# 回滚和状态恢复

FXTZ-arena 使用 lockstep + rollback 思路：客户端可以预测未来输入；当权威输入到达后，如果预测不同，就恢复旧 snapshot，并用权威输入重放到当前帧。

## 基本流程

1. 每帧记录输入。
2. 战局 `step` 后保存 snapshot 和 frame hash。
3. 如果收到旧帧的权威输入且与预测不一致，找到该帧 snapshot。
4. 反序列化 snapshot 恢复状态。
5. 按记录输入重放到目标帧。
6. 重新生成输出状态和 hash。

## Snapshot 当前包含

战局模型 snapshot 包含：

- `frame`、`gameOver`。
- 双方 fighter 状态。
- 投射物、效果、中立怪物。
- 训练统计。
- `nextProjectileId`、`nextEffectId`、`nextNeutralMobId`。
- mob spawner 状态。

## Hash 考虑

每个确认帧会生成 frame hash。结算时，客户端按帧号连续采样确认帧 hash，并写入 BLAKE3 accumulator，得到整局最终 hash。

## 扩展状态恢复

新增系统时按下面清单检查：

- 该状态是否影响未来生成物、碰撞、伤害、胜负或输入解释？
- 该状态是否依赖 fixed-point 计算结果、移动结果、角度或浮点边界？如果会影响战局，应按 [Fixed-point、数学计算和移动处理](./Fixed-Point-and-Math.md) 的规则实现。
- 该状态是否包含递增 id、随机种子、冷却、计时器或延迟队列？
- rollback 到旧帧再重放，是否能得到完全相同的 id、状态和 hash？
- 是否需要补充 serialize/deserialize/hash/replay 测试？

如果答案为“会影响战局结果”，就必须进入 snapshot，并纳入 hash 或通过测试证明不需要进入 hash。
