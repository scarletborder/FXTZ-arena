# 输入预测与回滚

## 输入历史

`CombatSyncManager` 为 Player1/Player2 分别保存按 frame 索引的规范化输入。缺少某方真实输入时，使用该玩家 `lastKnownInputs` 的副本作为预测，并在 `predictedInputs` 中记录预测值。

规范化会消除无效/不稳定表示。同步比较关注“意图”而不是对象引用；普通帧忽略 aim 差异，已标记的 aim-consuming frame 才比较 aim。

## 回滚触发

收到已经模拟过的远端真实输入后：

- 若真实意图与当时使用的输入一致，无需回滚；
- 若不一致，从 `changedFrame - 1` 的快照恢复；
- 裁掉恢复点之后的旧历史；
- 从变更帧重演到原当前帧，并重新记录输出、快照和 aim 消费帧。

协作模式下，延迟收到的强制 shop ready 或 transition ready 也可能触发同样的回滚。

## 快照所有权

`BattleRollbackHistory` 由 `BattleSession` 持有。每个 runtime 输出帧的 snapshot 被写入 rollback history；同步管理器通过 callback 读取恢复点，而不直接拥有前端日志系统。

调试开启时，history 还保存帧哈希、输入、事件和确认帧累计摘要。普通 rollback snapshot 与 debug history 不应混为一谈：即使关闭 debug，在线回滚仍必须保留必要快照。

## 历史裁剪

- 对端已确认的旧输入和快照可按确认边界裁剪。
- 回滚后必须删除恢复点之后的哈希、日志和 aim-consuming 标记。
- debug history 目前使用 3600 帧上限保护内存。
- 不要在仍可能收到迟到输入的窗口内过早删除恢复点。

## 不可靠链路冗余

P2P 连接使用不可靠数据路径时，当前输入消息可附带最近最多四帧的 `redundantInputs`。接收端把它们作为普通远端输入入队，以降低单包丢失导致的预测窗口增长。服务器中继路径仍使用同一消息类型。

## 结束裁决

本地 runtime 得出 game over 后，客户端发送包含 `frame`、`ackFrame`、`winnerPlayerId` 的 verdict。服务端或本地 P2P 路径等待双方信息，最终 authoritative/confirmed frame 取双方可共同确认的保守边界。不同步的预测尾帧不能直接成为最终回放或哈希结论。

## 回归测试重点

- 对称与非对称延迟；
- 输入丢失和冗余恢复；
- aim 延迟消费；
- 角色、能力卡、familiar 的隐藏状态；
- 协作商店/转场强制 ready；
- 回滚前后最终帧 hash 与全局 confirmed hash。

## 源码索引

- `apps/frontend/src/network/combat/manager.ts`
- `apps/frontend/src/network/combat/rollback-consistency/`
- `apps/frontend/src/battle/session/rollback-history.ts`
- `apps/frontend/src/battle/logger/index.ts`
