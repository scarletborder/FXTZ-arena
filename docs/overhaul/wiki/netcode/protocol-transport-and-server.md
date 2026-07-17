# 协议、传输与服务器

## 协议所有权

客户端和服务端消息联合类型位于 `packages/types/src/protocol/messages.ts`。新增消息时必须同时更新类型、服务端 handler、前端接收方和相关测试；不要在某一端私建形状相似的对象。

主要消息阶段：

| 阶段       | 消息示例                                                     |
| ---------- | ------------------------------------------------------------ |
| 连接       | `hello`、`server_hello`、`ping`/`pong`                       |
| 房间       | 创建、加入、列表、`room_state`、离开                         |
| 选人与加载 | ready/loadout、`battle_start`、loading done、`game_starting` |
| P2P        | intent、signal、ready                                        |
| 战斗       | `input_frame`、spectator input、peer status                  |
| 协作       | shop action、forced ready                                    |
| 结束       | `game_over`、peer verdict、`battle_finished`                 |

## 传输

前端 `BaseNetworkTransport` 的实现包括：

- `WsNetworkTransport`：WebSocket；
- `WtNetworkTransport`：浏览器 WebTransport；
- `WtDesktopTransport`：Tauri/桌面 WebTransport。

`ConnectionManager` 根据地址和运行目标选择 transport，并负责 ping、证书指纹获取、短延迟自动重连和房间状态缓存。战斗同步只依赖更小的 `CombatConnection`，避免把大厅状态带入同步核心。

服务端同时提供 WebSocket 与 WebTransport adapter，二者进入同一个协议 handler。

## 房间生命周期

典型状态流：

```text
waiting -> selecting -> loading -> fighting -> finished
```

双方提交 loadout 后生成 battle ID 和 seed，进入 loading；双方 loading done 后进入 fighting。断线时服务器保留 slot 供重连，并向对端发送 peer status；超时或退出后结束/清理房间。

`BattleConfig` 由服务器固定 battle mode、map、seed、fps、生命、cost limit 和双方 loadout。确定性 seed 必须由双方使用同一值初始化 runtime。

## 服务器权威范围

服务器权威管理：身份与 slot、房间配置、开始条件、消息来源、ack/verdict 汇总、最终结束通知。

服务器当前不权威管理：逐帧角色位置、投射物碰撞、伤害、Mob 状态。若未来引入服务端模拟，这将是协议与部署模型的重大改变，不能仅在 handler 中增加一个字段。

## 观战

Player1 会转发双方实际执行的输入记录给观战路径。服务器保存并广播 spectator input history，使观战端可用同一确定性 runtime 重建战局。观战正确性同样依赖相同配置、内容版本和连续输入。

## 源码索引

- `packages/types/src/protocol/messages.ts`
- `packages/types/src/protocol/binary.ts`
- `apps/frontend/src/network/transport/`
- `apps/frontend/src/network/client.ts`
- `apps/dedicated-server/src/transport/`
- `apps/dedicated-server/src/protocol/handler.ts`
- `apps/dedicated-server/src/room/lifecycle.ts`
