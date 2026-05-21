# Rollback 同步排查经验

这份文档记录联机 rollback / lockstep 同步中已经踩过的坑。后续修改 `raid-logic`、`frontend` 战斗同步、debug hash、角色技能、弹幕系统或结算流程时，先对照这里检查。

## 基本原则

联机同步只信任帧输入和 `raid-logic` 的确定性模拟。渲染、UI、Phaser 状态、Rapier 事件顺序、真实时间、网络抵达顺序都不能影响权威战局结果。

每个客户端可以有不同的预测历史，但在同一个权威帧、同一组双方输入下，最终恢复并重放后的状态 hash 必须一致。任何只在一端发生的 rollback 都不能改变之后的实体 id、效果 id、计时器或生成顺序。

## 权威帧与 Hash

`getConfirmedFrame()` 会被裁剪，这是正常行为。客户端只需要保留最后一个 ack 后确认的状态，加上未确认的本地预测。因此不能用当前缓存窗口里的 confirmed frame 列表计算整局最终 hash。

最终全局 hash 必须使用在线算法：每当一段帧被确认，就按帧号顺序采样这些权威帧的 frame hash，并写入 BLAKE3 accumulator。结算时输出的是 `0..serverConfirmedFrame` 的连续权威帧 hash 序列摘要。

debug log 的 `frames[]` 只能记录权威确认帧。预测帧、rollback 重放中的中间帧、尚未被双方 ack 覆盖的帧，只能放在 `revisions[]` 或临时历史里。否则会出现“同 frameId、同 input、不同 hash”的假阳性，因为两端当时记录的是不同预测版本。

游戏结束不能只以本地 `runtime.gameOver` 为准进入结算。客户端本地判定结束后，应提交 `game_over`，等待服务器广播双方都确认的 `battle_finished.confirmedFrame`，再导出最终 hash 和权威日志。

## Snapshot 必须包含隐藏状态

rollback snapshot 不能只保存当前还存在的实体。所有会影响未来模拟的隐藏状态也必须序列化。

已经发现过的问题：

- `ProjectileSystem.nextProjectileId` 没进 snapshot。旧实现从当前存活 projectile 的最大 id 推断下一个 id。如果之前生成过弹幕但后来被消除、出界或命中，rollback 后下一次射击会复用较小 id。Sakuya 一次射击生成两枚 knife，最容易暴露为“同输入、同位置、同速度，但 projectile id 不同，hash 从射击帧开始分歧”。
- `EffectSystem.nextEffectId` 同理。消弹 ring 等效果如果被清理后再 rollback，后续 effect id 也会偏移。
- frame-relative timer 必须用相对量保存和恢复，例如 `visibleIn`、`expireIn`、`homingStartIn`、`homingRemaining`、`pausedRemaining`。不能直接把未来绝对帧号恢复到不同 rollback 基准上。

新增任何系统时都要问：

- 是否有 `nextId`、计数器、随机种子、冷却序列、pending 队列、缓存索引等不在实体列表里的状态？
- 这些状态是否会影响未来生成物、hash 或战斗结果？
- rollback 到旧帧再重放，是否能得到完全相同的 id、状态和 hash？

## 输入消费顺序

用户输入按帧进入 `CombatSyncManager`，每个模拟帧使用该帧的 `player-1` 与 `player-2` 输入。双方操作应以 canonical player 顺序进入 `BattleModel.stepVersus()`，不要根据本地玩家身份改变处理优先级。

同帧动作顺序必须固定。目前 `player-1` 优先于 `player-2`。如果未来改优先级，需要同步改测试和文档，并确认双方客户端不会因为 local/remote 身份产生不同顺序。

缺失远端输入时可以预测，但真实输入抵达后如果与预测不同，必须从 `changedFrame - 1` 的 snapshot rollback，然后逐帧重放到当前帧。

## 投射物、消弹与碰撞

权威战斗判定不要依赖 Rapier collision event queue。Rapier 可以用于 debug overlay 或独立测试，但 projectile 命中、shield 阻挡、消弹等权威结果应使用固定顺序的确定性代码。

消弹效果需要明确作用域：

- Reimu bomb 和 Sakuya bomb 使用固定点距离清弹。
- Sakuya bomb 会暂停剩余投射物，`pausedUntil` 必须使用确定的 frame 值。
- Backdoor 只应清除已可见、有伤害、敌方、普通弹幕 `orb` / `knife`。不要清除己方弹、未可见预告弹、零伤害弹、`spark` / `laser` 等特殊投射物。
- Marisa Master Spark 这类延迟生成不能在 `ctx.spawnLaser()` 后立刻修改 `projectiles[projectiles.length - 1]`，因为 spawn 是 deferred。需要把 `pausedUntil` 等参数直接传进 spawn params。

所有几何判断都应使用固定点工具，Map/Set 遍历参与 hash 前必须排序。新增 projectile kind 或 shield 形状时，必须补 rollback replay 测试。

## Debug Log 与 Diff

debug 每帧记录只在 debug 开启或 live hash 开启时发生，避免正常战斗无谓占用内存。

导出的 JSON 中：

- `frames[]`：只保存权威确认帧。
- `revisions[]`：可保存预测、回滚、重放记录，用于排查过程。
- `finalGlobalHash`：只有 `0..serverConfirmedFrame` 的连续权威帧都被采样后才允许输出；否则应标记 incomplete。
- `player1Input` / `player2Input`：按 canonical player 记录，不按本地/远端视角记录。

使用 `pnpm run diff -- --p1=a.json --p2=b.json` 时，如果 `frames[]` 中同帧输入相同但 hash 不同，优先检查该帧前后的 rollback snapshot 完整性、实体 id、effect id、投射物数量和计时器，而不是先怀疑输入同步。

## 必跑回归

修改同步、snapshot、角色技能、投射物、消弹、hash、debug log 后，至少运行：

```bash
pnpm --filter @repo/raid-logic check-types
pnpm --filter @repo/raid-logic exec vitest run src/battle/model/index.test.ts --testTimeout=15000
pnpm --filter frontend exec vitest run src/network/combat/manager.test.ts --testTimeout=15000
pnpm --filter frontend check-types
```

`manager.test.ts` 应覆盖真实 `content`、`raid-logic`、`dedicated-server`、frontend 输入输出转换，并让两个客户端使用不同延时。测试里必须验证：

- 最终 `serverConfirmedFrame` 一致。
- `finalGlobalHash(BLAKE3)` 一致。
- 每个 sampled authoritative frame 没有在后续 rollback 重放中被改写。
- Reimu/Sakuya 与 Sakuya/Reimu 这类正式组合能通过。

对新增能力卡或角色技能，至少补一条“snapshot -> step -> hash -> deserialize snapshot -> step -> hash 相同”的测试。只测实时运行不够，真正的问题通常发生在其中一个客户端经历 rollback 之后。
