# Rollback 同步排查经验

这份文档记录联机 rollback / lockstep 同步中已经踩过的坑。后续修改 `raid-logic`、`frontend` 战斗同步、debug hash、角色技能、弹幕系统或结算流程时，先对照这里检查。

## 基本原则

联机同步只信任帧输入和 `raid-logic` 的确定性模拟。渲染、UI、Phaser 状态、真实时间、网络抵达顺序都不能影响权威战局结果。Rapier 是权威碰撞查询层，但它必须只通过 `raid-logic` 的固定封装读写，并把事件转换为稳定排序、纯数据的逻辑结果。

每个客户端可以有不同的预测历史，但在同一个权威帧、同一组双方输入下，最终恢复并重放后的状态 hash 必须一致。任何只在一端发生的 rollback 都不能改变之后的实体 id、效果 id、计时器或生成顺序。

## 权威帧与 Hash

`getConfirmedFrame()` 会被裁剪，这是正常行为。客户端只需要保留最后一个 ack 后确认的状态，加上未确认的本地预测。因此不能用当前缓存窗口里的 confirmed frame 列表计算整局最终 hash。

最终全局 hash 必须使用在线算法：每当一段帧被确认，就按帧号顺序采样这些权威帧的 frame hash，并写入 BLAKE3 accumulator。结算时输出的是 `0..serverConfirmedFrame` 的连续权威帧 hash 序列摘要。

debug log 的 `frames[]` 只能记录权威确认帧。预测帧、rollback 重放中的中间帧、尚未被双方 ack 覆盖的帧，不能进入最终导出的权威 diff 文件；如需排查预测过程，应使用 live console 或单独的临时开发日志。否则会出现“同 frameId、同 input、不同 hash”的假阳性，因为两端当时记录的是不同预测版本。

游戏结束不能只以本地 `runtime.gameOver` 为准进入结算。客户端本地判定结束后，应提交 `game_over`，等待服务器广播双方都确认的 `battle_finished.confirmedFrame`，再导出最终 hash 和权威日志。

## Snapshot 必须包含隐藏状态

rollback snapshot 不能只保存当前还存在的实体。所有会影响未来模拟的隐藏状态也必须序列化。

已经发现过的问题：

- `ProjectileSystem.nextProjectileId` 没进 snapshot。旧实现从当前存活 projectile 的最大 id 推断下一个 id。如果之前生成过弹幕但后来被消除、出界或命中，rollback 后下一次射击会复用较小 id。Sakuya 一次射击生成两枚 knife，最容易暴露为“同输入、同位置、同速度，但 projectile id 不同，hash 从射击帧开始分歧”。
- `EffectSystem.nextEffectId` 同理。消弹 ring 等效果如果被清理后再 rollback，后续 effect id 也会偏移。
- frame-relative timer 必须用相对量保存和恢复，例如 `visibleIn`、`expireIn`、`homingStartIn`、`homingRemaining`、`pausedRemaining`。不能直接把未来绝对帧号恢复到不同 rollback 基准上。
- 中立怪的排队行为也属于 timer。`ExampleFairy.volleyFireAge` 曾经是私有字段，只决定“已排队但尚未发射”的下一波弹幕；rollback 到这个窗口后，恢复出来的 mob 位置和血量一样，但排队开火状态丢失，高延迟下两端会从中立弹生成帧开始分歧。类似字段必须放进 mob snapshot/hash。
- `mobSpawner` 的内部流程必须 snapshot/restore。即使当前 `default-a` 是 frame-derived、没有隐藏计数器，新增 spawner 时只要有 `nextSpawnFrame`、波次游标、延迟生成队列、随机种子或“下一次发怪/发弹时间”，都必须进入 `NeutralMobSpawnerState`，并参与 hash。

### 计时器和排队行为

会影响未来帧的“时间”不只包括显式倒计时。凡是能回答“什么时候触发下一件事”的状态，都必须随 rollback 恢复：

- 剩余时长：`reloadRemaining`、`pausedRemaining`、`homingRemaining`。
- 未来触发点：`visibleFrom`、`expireAt`、`retargetAt`、`nextSpawnFrame`、`volleyFireAge`。
- 排队/延迟任务：`pendingSpawns`、mob 已排队的 volley、spawner 已安排但还没落地的 wave 成员。
- 暂停中的时间线：Sakuya time stop、projectile timeline pause、active card cooldown pause。

保存方式要按语义选择：

- snapshot 里的 projectile timer 使用相对量，如 `visibleIn = visibleFrom - snapshotFrame`。恢复时再加当前恢复帧，避免把旧基准上的绝对未来帧搬到新基准。
- mob 自身的行为计时如果以 `ageTicks` 为基准，例如 `volleyFireAge`，可以保留 mob-local age 值，但必须和 `ageTicks` 一起进 snapshot/hash。
- spawner 如果以全局 `frame` 为基准，例如 `nextSpawnFrame`，必须 snapshot/restore 这个绝对帧值，或改成纯 frame-derived；不要只靠构造函数默认值恢复。
- deserialize 后 Rapier 临时 bodies、事件队列、pending 队列这类派生状态应清空，并由恢复后的逻辑状态重新构建；权威未来只能来自 snapshot 里的纯数据。

新增任何系统时都要问：

- 是否有 `nextId`、计数器、随机种子、冷却序列、pending 队列、缓存索引等不在实体列表里的状态？
- 这些状态是否会影响未来生成物、hash 或战斗结果？
- 它是倒计时、绝对触发帧，还是依赖实体 `ageTicks` 的局部计时？snapshot/restore 是否保留了同一个语义？
- hash 是否覆盖了扩展状态？如果 hash 看不到这个字段，两端可能已经分歧但 debug diff 还晚几帧才显现。
- rollback 到旧帧再重放，是否能得到完全相同的 id、状态和 hash？

## 输入消费顺序

用户输入按帧进入 `CombatSyncManager`，每个模拟帧使用该帧的 `Player1` 与 `Player2` 输入。双方操作应以 canonical player 顺序进入 `BattleModel.stepVersus()`，不要根据本地玩家身份改变处理优先级。

同帧动作顺序必须固定。目前 `Player1` 优先于 `Player2`。如果未来改优先级，需要同步改测试和文档，并确认双方客户端不会因为 local/remote 身份产生不同顺序。

缺失远端输入时可以预测，但真实输入抵达后如果与预测不同，必须从 `changedFrame - 1` 的 snapshot rollback，然后逐帧重放到当前帧。

### 用户输入字段与网络包

新增任何用户输入字段时，必须同时更新类型、网络 codec、server relay、debug log 和测试。只改 `BattleInputState` 或 `ClientMessage` 不够。

检查清单：

- 类型定义：更新 `packages/types/src/battle/input.ts` 和 `packages/types/src/protocol/messages.ts` 中的 `InputFrameMessage` / `InputFrameRelayMessage`。
- 采集端：更新 `apps/frontend/src/battle/input.ts` 和 `CombatSyncManager.sendInput()` 的构造字段。
- 网络 codec：更新 `packages/types/src/protocol/binary.ts` 的 `writeInputFields()` / `readInputFields()` / `inputPayloadSize()`。
- server relay：更新 `apps/dedicated-server/src/protocol/handler.ts` 中 `handleInputFrame()` 转发字段。
- 前端接收：更新 `CombatSyncManager.handleServerMessage()` 和 `cloneInput()` / `sameInput()`。
- 日志：更新 `apps/frontend/src/battle/logger/index.ts` 的 clone/export 逻辑。
- 测试：更新 `packages/types/src/protocol/binary.test.ts`，至少覆盖 round-trip；如果字段影响战斗结果，还要更新 `apps/frontend/src/network/combat/manager.test.ts` 或 raid-logic rollback 测试。

字段编码规则：

- 离散方向：`moveX` / `moveY` 使用 `int8`，值域必须保持 `-1 | 0 | 1`。
- 布尔按钮：打包到 bitset。新增按钮时分配新的 bit，并同时更新 encode/decode。
- 帧号、ack、id：使用整数编码，禁止用 float。
- 连续数值：例如 `aimX` / `aimY` / 摇杆模拟量 / 模拟扳机压力，禁止用 `Float32`；必须用 decimal string + length prefix 写进 ArrayBuffer，并用 `fp.fromString(...)` 走确定性解析/校验路径。
- 低频复杂消息：可以继续走二进制包裹 JSON fallback，但高频 `input_frame` 必须显式维护字段布局。

已经踩过的坑：`aimX` / `aimY` 曾经用 `setFloat32()` 序列化，远端收到的值从 `845.3833799776838` 变成 `845.3833618164062`。这类偏差可能一开始不改变状态 hash，但会改变后续瞄准角、弹幕和碰撞，从而导致最终 hash 分歧。

### Ack 与确认帧

`input_frame.ackFrame` 表示“我已经连续收到并采用的对端输入帧”。双方不断发送 input 时，server 只负责 relay，客户端用 `min(lastReceivedRemoteFrame, lastPeerAckFrame)` 得到本地 confirmed frame。

注意：

- 本地 `runtime.frame` 不是权威确认帧。
- `serverConfirmedFrame` 只在双方提交 `game_over` 后由 server 计算，结算导出的 final hash 目标应使用这个权威范围。
- 如果 debug log 里 `runtimeFrame` 很大但 `localConfirmedFrame` / `serverConfirmedFrame` 仍是 0，应优先检查 ack 是否在输入包里持续发送、对端输入是否持续 relay、以及客户端是否在收到 relay 后调用了 `advanceRemoteContiguousFrame()`。

## 投射物、消弹与碰撞

权威战斗碰撞应使用 `BattlePhysics` / Rapier 适配层。不要在角色、能力卡、前端或其他系统里绕过适配层手写一套 projectile 命中、shield 阻挡、mob 命中或擦弹几何逻辑；否则很容易出现两端一边使用 Rapier、一边使用近似几何，导致“看起来命中了但权威未命中”的分歧。

Rapier 事件本身仍然需要被逻辑层规范化：

- 每帧由 `BattleModel` 在固定阶段同步 fighter、projectile、shield、neutral mob、point 等碰撞体，再推进 Rapier。
- Rapier 输出必须转成 `{ projectileId, victimKey, victimMobId, grazedByKey, blockedByShield }` 这类纯数据结果，后续按稳定顺序消费。
- rollback / deserialize 后必须清掉 Rapier 临时 bodies，并由下一帧从逻辑状态重建，不能把 Rapier 原生对象、handle 或事件队列写进 snapshot。
- 如果某类形状 Rapier 无法直接表达，应优先扩展适配层中的 Rapier 形状建模或显式定义一个可同步的查询策略，而不是在业务逻辑旁路新增一套碰撞判定。

消弹效果需要明确作用域：

- Reimu bomb 和 Sakuya bomb 使用固定点距离清弹。
- Sakuya bomb 会暂停剩余投射物，`pausedUntil` 必须使用确定的 frame 值。
- Backdoor 只应阻挡/清除已可见、有伤害、敌方、普通弹幕 `orb` / `knife`。不要影响己方弹、未可见预告弹、零伤害弹、`spark` / `laser` 等特殊投射物。碰撞范围由 Rapier shield body 表达，逻辑层只负责过滤作用域。
- Marisa Master Spark 这类延迟生成不能在 `ctx.spawnLaser()` 后立刻修改 `projectiles[projectiles.length - 1]`，因为 spawn 是 deferred。需要把 `pausedUntil` 等参数直接传进 spawn params。

所有进入 Rapier 的位置、尺寸、角度和输出结果都应在适配层内保持确定性；Map/Set 遍历参与 hash 或碰撞消费前必须排序。新增 projectile kind、mob hitbox 或 shield 形状时，必须补 rollback replay 测试，并覆盖两端经历不同预测/rollback 历史后 Rapier 结果仍一致。

## Debug Log 与 Diff

debug 每帧记录只在 debug 开启或 live hash 开启时发生，避免正常战斗无谓占用内存。

导出的 JSON 中：

- `frames[]`：只保存权威确认帧。
- `finalGlobalHash`：只有 `0..serverConfirmedFrame` 的连续权威帧都被采样后才允许输出；否则必须为 `null` / incomplete，不能用 frame 0 或本地预测帧凑数。
- `player1Input` / `player2Input`：按 canonical player 记录，不按本地/远端视角记录。
- `player1Input` / `player2Input` 必须来自 confirmed input 表，而不是来自预测 step 或本地 speculative step。预测输入在 rollback 后可能根本不会在最终权威时间线上执行，不能写进最终取证日志。

当前实现中，`CombatSyncManager` 在确认帧推进时，从 `inputs["Player1"]` / `inputs["Player2"]` 里按帧取出双方真实输入，通过 `recordConfirmedInputs` 交给 `BattleDebugLogger`。`BattleDebugLogger.recordConfirmedFrame()` 只把这份 confirmed input 写进 `frames[]`。

不要重新引入 `localFrames` / `revisions` 到最终导出文件里。如果临时需要排查预测过程，应使用 live console 或单独的临时开发日志，不能混进权威 diff 文件。

使用 `pnpm run diff -- --p1=a.json --p2=b.json` 时，如果 `frames[]` 中同帧输入相同但 hash 不同，优先检查该帧前后的 rollback snapshot 完整性、实体 id、effect id、投射物数量和计时器，而不是先怀疑输入同步。

如果 `finalGlobalHash` 为 `null`：

- 说明导出目标帧没有完整采样，通常是 `authoritativeFrame < targetFrame`。
- 在线结算时目标应为 `battle_finished.confirmedFrame`，不是本地 `runtime.frame`。
- 检查 console group 中的 `localConfirmedFrame`、`serverConfirmedFrame`、`authoritativeFrame` 和 `sampledConfirmedFrames`。
- 不要把未确认帧加入 accumulator；这样会把预测历史误当权威历史。

如果分歧出现在中立怪弹幕附近，优先检查：

- 场上 mob 是否通过 `mob.snapshot()` 导出，而不是直接读取 `mob.state` 绕过自定义快照。
- mob state/hash 是否包含会影响未来行为的扩展字段，例如排队 volley、形态切换延迟、局部 cooldown。
- `mobSpawner.snapshot()` / `restore()` 是否覆盖所有内部计时器和排队状态。
- deserialize 后重放同一段帧，mob 生成顺序、mob id、projectile id、发射帧和 Rapier hit 结果是否完全一致。

## 必跑回归

修改同步、snapshot、角色技能、投射物、消弹、hash、debug log 后，至少运行：

```bash
pnpm --filter @repo/raid-logic check-types
pnpm --filter @repo/raid-logic exec vitest run src/battle/model/index.test.ts --testTimeout=15000
pnpm --filter frontend exec vitest run src/network/combat/manager.test.ts --testTimeout=30000
pnpm --filter frontend check-types
```

`manager.test.ts` 应覆盖真实 `content`、`raid-logic`、`dedicated-server`、frontend 输入输出转换，并让两个客户端使用不同延时。测试里必须验证：

- 最终 `serverConfirmedFrame` 一致。
- `finalGlobalHash(BLAKE3)` 一致。
- 每个 sampled authoritative frame 没有在后续 rollback 重放中被改写。
- Reimu/Sakuya 与 Sakuya/Reimu 这类正式组合能通过。
- 至少包含一组高不对称延迟，让一端经历多次预测和 rollback，覆盖中立怪生成与发弹窗口。

对新增能力卡、角色技能、中立怪或 mob spawner，至少补一条“snapshot -> step -> hash -> deserialize snapshot -> step -> hash 相同”的测试。涉及计时器时，测试必须把 snapshot 放在“已安排但尚未触发”的窗口，例如 volley 已排队但还没发射、spawner 已更新下一次生成帧但还没生成。只测实时运行不够，真正的问题通常发生在其中一个客户端经历 rollback 之后。
