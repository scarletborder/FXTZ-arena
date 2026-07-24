---
name: netcode-room-relay
description: 为 TypeScript 双人联机游戏搭建"独立服务器中转"的房间连接，支持 WebSocket 与 WebTransport 双传输。该技能应在需要实现房间创建/加入/消息转发服务端、客户端传输抽象、自签证书 WebTransport 握手、断线重连会话恢复时使用。此方案底层信道可靠（TCP/QUIC 流），应用层无需重发冗余。
---

# 独立服务器中转的房间连接（WS + WebTransport）

## 架构总览

```
Client A ──(WS 或 WT 双向流)── Dedicated Server ──(WS 或 WT)── Client B
                                  │
                            Room{2 个 slot}
                            按 slot 转发 relayToPeer
```

- 服务器只做**帧转发 + 房间生命周期管理**，不跑游戏模拟；
- 底层 TCP（WS）/ QUIC 流（WT 双向流）已保证可靠有序，**应用层不需要重发、冗余、去重**；`input_frame` 不带 `UnreliableLinkExtra`；
- `ackFrame` 仍然携带——用于回滚历史裁剪与终局裁决，不用于重传。

## 实施步骤

1. **定义传输抽象**：客户端 `NetworkTransport { open/send/close + onOpen/onClose/onError/onMessage }`（参考 `apps/frontend/src/network/transport/base.ts`）；服务端对 WS/WT 连接抽象出统一 `Connection { send, close, onMessage }`（参考 `apps/dedicated-server/src/transport/interface.ts`）。
2. **实现 WS 通道**：服务端 `http(s).Server + ws 库 WebSocketServer`；客户端 `new WebSocket(url); binaryType="arraybuffer"`。
3. **实现 WT 通道**：服务端用 `@fails-components/webtransport` 的 `Http3Server`，`sessionStream("/wt")` 接会话，取第一条双向流作消息通道；客户端 `new WebTransport(url, { serverCertificateHashes })` + `createBidirectionalStream()`。
4. **解决自签证书**：HTTP 侧暴露 `/fingerprint` 端点返回证书 SHA-256 指纹；浏览器客户端 WT 首连失败时自动拉指纹重试（`serverCertificateHashes: [{ algorithm: "sha-256", value }]`）。注意 WT 证书有效期必须 ≤14 天。
5. **设计二进制协议**：2 字节帧头 `[version, msgType]`；高频消息（input_frame/ping/pong/game_over）用紧凑二进制编码，其余全部走 `msgType=255` 的 JSON 封装。参考 `packages/types/src/protocol/binary.ts`。
6. **实现房间管理**：Room = { roomId, playerSlots[2], status }；join 时分配 slot（Player1/Player2），`relayToPeer` 按"另一 slot 的 connectionId"转发。
7. **实现会话恢复**：客户端持有 sessionToken；断线后重连携带 token，服务器把新连接重绑到原 slot，并向对端广播 `peer_status: disconnected/reconnected`。
8. **消息帧分帧注意**：WS 天然有消息边界；WT 双向流是字节流，**必须自实现长度前缀分帧**（如 4 字节大端长度 + 载荷）。

## 关键坑

- WebTransport 需 HTTPS/QUIC + UDP 443 可达；某些网络（公司代理）不可用，必须保留 WS 回退，服务端 `/version` 端点声明能力供客户端探测。
- 桌面端（Tauri 等）浏览器 WebTransport API 不可用时，经 IPC 委托原生实现（参考 `wt-desktop.ts` 经 `invoke("wt_connect"...)` + 事件桥接）。
- 服务器是权威的房间状态源：battle_finished、房间销毁等控制消息由服务器裁决下发，客户端不要各自为政。
- 地址规整：把用户输入统一 normalize（默认端口、`https://` 前缀→WT、其余→WS），参考 `apps/frontend/src/network/address.ts`。

## 参考资料

- `references/protocol-and-server.md` — 二进制协议、服务端房间/会话/转发实现细节。
- `references/transports.md` — WS/WT 客户端与服务端建连、证书指纹、桌面端桥接细节。
- 本仓库真实实现：`apps/dedicated-server/src/`（transport/、room/、session/、protocol/）与 `apps/frontend/src/network/`（transport/、client.ts、address.ts、fingerprint.ts）。
