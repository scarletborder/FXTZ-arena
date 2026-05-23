# 战局循环介绍

当前战局核心在 `packages/raid-logic/src/battle/model/index.ts` 的 `BattleModel.stepFrame`。每一帧以固定 tick 推进，默认 60fps。

## 当前步进阶段

1. 捕获上一帧状态：记录双方上一帧位置和朝向，供渲染插值等非权威表现使用。
2. 推进 frame：`frame += 1`，训练统计 `elapsedTicks += 1`。
3. Timer ticking：清空 pending spawns，推进双方 fighter 的计时器。
4. Fighter actions：按确定的先后顺序处理双方行动。
5. Mob spawner / neutral mobs：推进中立怪物生成器和中立怪物行为。
6. Post-update：处理弹幕冲突、投射物移动与碰撞、中立怪物清理、延迟生成物落地、sfx/effect 推进。

## Fighter action 顺序

单个 fighter 内部顺序固定：

1. 根据 `alternateHeld` 切换角色。
2. 根据瞄准点更新朝向。
3. 移动。
4. fighter post-update。
5. 处理装填。
6. 使用主动能力卡。
7. 使用 bomb。
8. 普通射击。

## 延迟生成

角色、能力卡和中立怪物调用 `spawnBullet` / `spawnLaser` 时，不会立刻写入 projectiles，而是进入 `pendingSpawns`。本帧 post-update 后统一 `flushDeferredSpawns`，避免行动顺序造成不稳定的碰撞结果。

## 帧同步和回滚要求

- 所有影响战局结果的逻辑必须由 tick 推进，不能读取真实时间。
- 位置、距离、角度、移动和碰撞相关计算应遵守 [Fixed-point、数学计算和移动处理](./Fixed-Point-and-Math.md)。
- Map/Set 或数组参与 hash 前必须有稳定顺序。
- 新增阶段时要明确它在 `stepFrame` 中的位置，尤其是它发生在碰撞前还是碰撞后。
- 新增可生成 id 的系统时，`nextId` 必须进入 snapshot。
- 任何会影响未来帧的隐藏状态都必须进入 snapshot/restore/hash 测试。
