# 二进制协议与服务端设计

真实实现参考：`packages/types/src/protocol/binary.ts`、`apps/dedicated-server/src/`。

## 1. 帧格式

所有消息共享 2 字节帧头：

```
byte 0: VERSION (=1)
byte 1: 消息类型码
byte 2..: 载荷
```

类型码分配（binary.ts:5-12）：

| 码 | 含义 |
|----|------|
| 1  | CLIENT_INPUT_FRAME（客户端→服务器 输入帧，紧凑二进制） |
| 17 | SERVER_INPUT_FRAME（服务器→客户端 转发输入帧） |
| 2 / 18 | CLIENT_GAME_OVER / SERVER_PEER_GAME_OVER |
| 3 / 19 | CLIENT_PING / SERVER_PONG |
| 255 | JSON_MESSAGE：`[1][255] + UTF8(JSON.stringify(msg))` |

设计原则：**只为高频小消息设计二进制布局**（每秒 60 条的输入帧、ping），低频控制消息（join_room、room_state、p2p 信令等）全部走 JSON，可扩展且省开发量。解码入口统一 `decodeProtocolMessage(buffer)`：先读帧头，分派到对应解码器。

输入帧二进制布局要点：frame/ackFrame 用 varint 或定长 u32；布尔按钮打包成位标志；aim 坐标定点整数。修改输入结构时二进制编解码需同步双端更新——版本字节用于灰度兼容。

## 2. 服务端组成

```
transport/ws-server.ts   WS 监听 + HTTP 辅助端点
transport/wt-server.ts   Http3Server(QUIC) + /wt 会话
transport/interface.ts   统一 Connection 抽象
protocol/handler.ts      消息分发（join/input/p2p 信令/裁决…）
protocol/messages.ts     消息类型定义与校验
room/manager.ts          房间创建/加入/查找
room/lifecycle.ts        房间状态机（waiting→playing→finished→销毁）
session/store.ts         sessionToken → 会话映射（断线重连）
matchmaking/index.ts     匹配队列（可选）
```

## 3. 转发核心（relayToPeer）

`protocol/handler.ts:1399-1416`：找到发送者所在房间，取 `playerSlots` 中另一个 slot 的 connectionId，将消息（必要时改写 type，如 `game_over` → `peer_game_over`，附上 `playerId`）直接写给对端连接。服务器不解释输入内容，仅透传 + 记录 confirmedFrame 供裁决。

被转发前服务器做**最小校验**：字段类型、frame 为正整数、消息类型在白名单内（如 p2p 信令只放行 offer/answer/candidate，`normalizeP2pSignal` handler.ts:1592）。原则：中转服务器要防注入，但不做游戏逻辑校验。

## 4. 房间生命周期

- 创建：第一位玩家 create_room → 生成 roomId（短随机码），占 Player1 slot；
- 加入：join_room(roomId) → 占 Player2 slot，双方收到 room_state 更新；
- 对局：双方 loading_done 后进入 playing，开始转发 input_frame；
- 结束：任一方 game_over 裁决 + 对方呼应，或双方掉线超时 → 服务器下发 `battle_finished { winnerPlayerId, confirmedFrame }`（权威判定），随后销毁房间；
- 半途离开：向留守方发 `room_state{status:"finished"}`，客户端据此判本地胜。

## 5. 会话与断线重连

- 首次连接分配 `sessionToken`，客户端持久保存；
- 断线：连接关闭时**不立刻销毁 slot**，标记 disconnected 并向对端发 `peer_status:{status:"disconnected"}`（对端进入暂停，见 reliability-layer 技能）；
- 重连：新连接携带 token → `session/store.ts` 找回会话 → 重绑 slot → 广播 `peer_status: reconnected`；
- 宽限期超时（服务器侧数秒、客户端侧 1 秒暂停窗口）后判负/结束。

## 6. HTTP 辅助端点（挂在 WS 同一 http server 上）

| 路径 | 用途 |
|------|------|
| `/fingerprint` | 返回 TLS 证书 SHA-256 指纹文本（WT 自签证书握手用） |
| `/version` | JSON：`{ version, webTransport, collaborate }`，客户端能力探测 |
| `/echo` | 浏览器手动信任自签证书的提示页 |

均需 `cache-control: no-store`。

## 7. 为什么该方案无需应用层冗余

- WS = TCP：可靠、有序、自动重传；
- WT 双向流 = QUIC 流：同样可靠有序（注意：**不要用 WT datagram**，那是不可靠的）；
- 因此 `input_frame` 不带 `UnreliableLinkExtra`，唯一的"不可靠"是连接整体断开，交由会话恢复机制处理；
- 代价：中转增加一跳 RTT，且 TCP 队头阻塞在弱网下劣于 UDP 方案——这正是其余三种 P2P 方案存在的原因。
