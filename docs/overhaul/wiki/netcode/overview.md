# 联机架构

## 模型

当前战斗联机是客户端确定性模拟 + 输入同步 + 预测回滚。双方运行相同 `RaidLogicRuntime`，网络发送 `BattleInputState`，不持续同步完整世界状态。

```text
local input -> CombatSyncManager -> local runtime step
                    |                    ^
                    v                    |
             P2P or server relay        |
                    |                    |
remote actual input +-> mismatch -> restore snapshot -> replay
```

专用服务器管理房间、加载状态、P2P 信令、输入中继、断线和双方 game-over verdict。它不为每个房间运行 `BattleModel`，因此“服务端确认帧”是协议确认/裁决边界，不是服务端重算出的世界快照。

## 前端层次

- `BattleNetworkSession`：决定当前场景是否启动同步，装配 `CombatSyncManager`、P2P 和表现 host。
- `CombatSyncManager`：输入历史、预测、ack、回滚、协作强制 ready、结束裁决。
- `CombatConnection`：仅含 `send` 和 `setMessageHandler` 的小接口。
- `ConnectionManager`：服务器长连接、房间缓存、重连和 transport 选择。
- `PeerConnection`：可选的 P2P 数据路径；失败时仍可走服务器中继。

## 每帧流程

`CombatSyncManager.step(localInput)` 的关键顺序：

1. 规范化本地输入；
2. 以 `runtime.frame + 1` 存储并发送本地输入；
3. 排空已收到的远端输入，必要时先回滚；
4. 为双方取本帧真实输入或预测输入；
5. 以 Player1 优先推进在线 runtime；
6. 记录快照、哈希、aim 消费状态；
7. 更新确认帧、裁剪历史并检查结束裁决。

先存本帧本地输入再处理远端纠错非常重要，否则回滚重演可能缺少当前帧的本地输入。

## 确认帧

客户端维护：

- `lastReceivedRemoteFrame`：连续收到的远端输入边界；
- `lastPeerAckFrame`：对端声明已收到本端输入的边界；
- confirmed frame：两者的最小值。

确认帧之前的历史可以被裁剪或纳入最终调试哈希；确认帧之后仍可能回滚。

## 源码索引

- `apps/frontend/src/battle/session/network-session.ts`
- `apps/frontend/src/network/combat/manager.ts`
- `apps/frontend/src/network/combat/types.ts`
- `apps/frontend/src/network/client.ts`
- `apps/dedicated-server/src/protocol/handler.ts`
