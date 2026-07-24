---
name: netcode-webrtc-p2p
description: 为 TypeScript 双人联机游戏建立"独立服务器做信令介绍"的 WebRTC P2P 直连。该技能应在需要实现 SDP offer/answer 交换、ICE candidate 中继、不可靠 DataChannel 配置（ordered:false + maxRetransmits:0）、握手发起者判定（防 glare）、超时失败与服务器中转降级时使用。物理信道不可靠，可靠性由 netcode-reliability-layer 的冗余捎带承担。
---

# 独立服务器信令的 WebRTC P2P 连接

## 架构总览

```
Client A ──已有可靠连接──> Dedicated Server <──已有可靠连接── Client B
   │        （仅转发 p2p_intent / p2p_signal / p2p_ready）        │
   └───────────── RTCDataChannel（ICE+STUN 打洞，UDP 直连）────────┘
```

- 前提：双方已通过服务器中转（netcode-room-relay）进入同一房间——**信令免费复用现有可靠信道**，无需独立信令协议；
- DataChannel 配置为 `{ ordered: false, maxRetransmits: 0 }` = 纯 UDP 语义，**故意关闭 SCTP 的重传/排序**，把可靠性交给应用层冗余捎带（延迟更可控，避免队头阻塞）；
- P2P 失败或中途断开时，`send()` 返回 false，上层自动回落服务器中转，游戏不中断。

## 实施步骤

1. **定义信令消息**（走现有房间信道的 JSON 消息）：
   - `p2p_intent { enabled }` → 服务器转发为 `peer_p2p_intent`；
   - `p2p_signal { signal: offer|answer|candidate }` → `peer_p2p_signal`；
   - `p2p_ready` → `peer_p2p_ready`。
   服务器只做白名单校验 + relayToPeer 转发，不解析 SDP。
2. **握手发起者判定（防 glare）**：只有 Player1 主动 createOffer；Player2 必须等收到对方 intent 后才建 RTCPeerConnection。绝不允许双方同时发 offer。
3. **建连流程**：createPeer（iceServers 仅一个 STUN）→ Player1 `createDataChannel("game-input", {ordered:false, maxRetransmits:0})` + createOffer → 对端 ondatachannel 接收；candidate 逐个即时上报（Trickle ICE）。
4. **candidate 缓冲**：`remoteDescription` 未就绪前到达的 candidate 必须暂存 `pendingCandidates`，setRemoteDescription 后统一 flush——乱序到达是常态。
5. **超时与终态失败**：20 秒握手超时；`connectionState ∈ {failed, disconnected, closed}`、channel error、send 异常均进入一次性 `fail(reason)` 终态（不重试 P2P，直接用服务器中转打完本场）。
6. **消息编解码**：channel.binaryType = "arraybuffer"，复用房间协议的二进制编解码（encodeProtocolMessage/decodeProtocolMessage），对端收到后把 ClientMessage 视角转换为 ServerMessage 视角再交给游戏层。
7. **接入可靠层**：实现 `PeerConnection` 接口（connected/status/start/close/send/handleServerMessage），`CombatSyncManager` 在 `p2p.connected` 时启用 `UnreliableLinkExtra.redundantInputs` 冗余（见 netcode-reliability-layer）。

## 关键设计决策

- **为什么不可靠模式**：`ordered:true` 的 DataChannel 遇丢包会队头阻塞，延迟尖刺对格斗/弹幕游戏致命；关掉重传后丢包只花一帧冗余就补上。
- **为什么失败即终态**：中途反复 ICE 重启的复杂度 >> 收益；服务器中转随时可用，失败一次就永久降级最简单可靠。
- **无 TURN**：打洞失败（对称 NAT）时不架 TURN——服务器中转本身就是"自营 TURN"。
- p2p_intent 双向声明：任一方禁用（设置关闭/无 WebRTC 环境）即 `fail("peer_disabled")`，另一方不会傻等。

## 参考资料

- `references/signaling-flow.md` — 完整信令时序、状态机、glare 防护与失败矩阵。
- 本仓库真实实现：`apps/frontend/src/network/p2p.ts`（P2pConnection）、`apps/dedicated-server/src/protocol/handler.ts:1087-1127`（信令转发）。
