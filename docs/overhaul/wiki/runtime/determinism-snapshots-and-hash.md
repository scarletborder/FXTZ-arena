# 确定性、快照与哈希

## 确定性边界

任何会影响 `BattleOutputState`、胜负或后续状态的计算都必须只依赖：初始配置与 seed、确定的帧号、双方规范化输入、已进入快照/哈希的状态。

战斗逻辑使用 `@shaisrc/fixed-point` 处理关键向量、角度、速度和几何运算，并使用 `@dimforge/rapier2d-deterministic-compat`。内容代码中的随机行为必须使用上下文提供的确定性随机源，不能调用 `Math.random()`、`Date.now()` 或读取渲染对象。

## 时间表示

- 战斗时间使用 tick/frame。
- 内容层用 `secondsToTicks` 在定义阶段换算持续时间。
- 运行状态中的 cooldown、锁定和生命周期通常保存绝对帧或 remaining ticks。
- 快照会把部分绝对计时器转换成相对剩余量，恢复时再基于目标帧重建。

## 快照

`BattleModelSnapshot` 当前版本为 `1`，包括：

- frame、game over、result 和各类 next ID；
- 两名 fighter 的可恢复状态及内容 ID；
- Mob、点数物、clear ring、投射物、效果；
- Mob spawner 自定义状态和 ticker；
- 训练统计与协作模式状态。

快照必须包含所有会改变未来帧的隐藏状态。新增计时器、序号、随机游标、形态状态或 delayed action 时，要同时更新 snapshot、restore 和 hash，而不能只让它出现在输出中。

## 哈希

`BattleModel.hash()` 对确定性模型分量生成帧哈希，`hashComponentsDebug()` 可按 fighter、projectile 等子系统定位差异。在线调试还使用 `ConfirmedFrameHashAccumulator` 将连续确认帧的哈希累积为 BLAKE3 摘要，并单独累积确认输入哈希。

只有已确认且连续的帧可进入全局摘要。预测帧可能被回滚替换，不能作为最终一致性证据。

## Aim 特例

鼠标位置可能每帧变化，但大量帧并不消费 aim。模型通过 `aimConsumedThisFrame` 标出 aim 实际影响结果的帧；同步层仅在这些帧比较预测与真实 aim。新增被动 `onPostUpdate`、跟随准星或延迟重定向机制时，需要正确声明/传播 aim 消费，否则两端可能在未触发回滚的情况下分叉。

## 检查清单

- 新状态能否被 snapshot/restore 完整往返？
- 新状态是否进入 hash，且集合顺序稳定？
- 使用了固定点或确定性整数运算吗？
- ID 分配和遍历顺序是否明确？
- rollback replay 是否会重复产生同一结果？
- 是否新增了需要标记的 aim 消费帧？

## 源码索引

- `packages/raid-logic/src/battle/model/snapshot.ts`
- `packages/raid-logic/src/battle/model/hash.ts`
- `packages/types/src/battle/model-snapshot.ts`
- `packages/raid-logic/src/sync/hash.ts`
- `apps/frontend/src/battle/session/rollback-history.ts`
- `packages/content/src/content/fp.ts`
