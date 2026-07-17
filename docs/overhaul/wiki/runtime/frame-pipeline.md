# 帧管线

## 两层固定帧

项目中有两个同名但职责不同的 `BattleFramePipeline`：

- 前端 `battle/session/frame-pipeline.ts`：把 Phaser `delta` 累积为固定步长，采样输入，并选择离线推进或 `CombatSyncManager`。
- raid-logic `battle/model/frame-pipeline.ts`：在一个确定性 battle frame 内选择协作转场、商店或正常战斗分支。

讨论或搜索时必须带上“前端帧管线”或“逻辑帧管线”。

## 前端帧管线

它维护 accumulator，并按 `FIXED_STEP_MS` 循环。每个 tick：

1. 从当前输出采样本地输入；
2. 若联机同步运行，把输入交给 network session；
3. 否则按训练、AI或同设备双人模式组装输入并调用 runtime；
4. 记录输出和回放输入；
5. 检查本地战斗结束。

渲染帧率与战斗帧率因此解耦。快进和回放也复用固定步长推进，而不是用大 `delta` 直接修改状态。

## 逻辑帧管线

所有分支先执行：校验物理已就绪、捕获上一帧位置、frame `+1`、重置 aim 消费标志、推进 ticker 和统计。

分支优先级：

1. `CollaborateTransitionBranchManager`：处理协作转场同步；命中后本帧结束。
2. `CollaborateShopBranchManager`：商店打开时只处理商店输入和 spawner；商店在本帧关闭则继续正常战斗。
3. `RunningBattleBranchManager`：正常战斗。

正常战斗顺序：

```text
tick fighter timers / game-over guard
-> fighter actions
-> mob spawner
-> mob move/fire/form/death
-> projectile clashes
-> projectile movement/collision/hit/graze/clear
-> remove inactive mobs
-> collectibles
-> sync collectible physics
-> flush deferred spawns
-> effects
```

顺序是确定性契约。角色和能力卡产生的部分对象采用 deferred spawn，避免同帧遍历期间修改集合并改变执行次序。

## 同帧优先级

`BattleFrameInputPair.firstIsPlayer` 决定先处理哪名 fighter。在线路径把 Player1 作为稳定优先方。新增会导致同帧竞争的机制时，必须保留这一显式顺序，不可依赖数组插入偶然性。

## 源码索引

- `apps/frontend/src/battle/session/frame-pipeline.ts`
- `packages/raid-logic/src/battle/model/frame-pipeline.ts`
- `packages/raid-logic/src/battle/model/frame-branch-manager.ts`
- `packages/raid-logic/src/battle/model/frame-pipeline-types.ts`
- `packages/constants/src/battle/scene.ts`
