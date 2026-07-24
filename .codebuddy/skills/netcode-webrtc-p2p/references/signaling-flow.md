# WebRTC P2P 信令时序与状态机

真实实现参考：`apps/frontend/src/network/p2p.ts`、`apps/dedicated-server/src/protocol/handler.ts`。

## 1. 完整时序

```
Player1                      Server                      Player2
  │  p2p_intent{enabled:true} │                            │
  ├──────────────────────────>│  peer_p2p_intent           │
  │                           ├───────────────────────────>│
  │                           │  p2p_intent{enabled:true}  │
  │       peer_p2p_intent     │<───────────────────────────┤
  │<──────────────────────────┤                            │
  │ createPeer + createDataChannel + createOffer           │
  │  p2p_signal{offer,sdp}    │                            │
  ├──────────────────────────>│  peer_p2p_signal{offer}    │
  │                           ├───────────────────────────>│
  │                           │     setRemoteDescription → createAnswer
  │                           │  p2p_signal{answer,sdp}    │
  │  peer_p2p_signal{answer}  │<───────────────────────────┤
  │<──────────────────────────┤                            │
  │  （双方持续 Trickle）p2p_signal{candidate,...} 双向互发   │
  │                           │                            │
  │═══════════ ICE 打洞成功，DataChannel onopen ═══════════│
  │  p2p_ready                │  peer_p2p_ready            │
  ├──────────────────────────>├───────────────────────────>│
```

## 2. 状态机

```
idle ──start()──> connecting ──channel.onopen──> connected
 │                    │                              │
 │ enabled=false      │ 20s 超时 / signal_error /    │ channel_closed /
 v                    │ peer_disabled / webrtc 缺失  │ connection_state 恶化
disabled              v                              v
                    failed（终态，terminalFailed=true，不可恢复）
```

要点（p2p.ts）：
- `DEFAULT_TIMEOUT_MS = 20_000`（p2p.ts:35），`startTimer` 在 start() 与首次收到 signal 时启动，onopen 清除；
- `fail(reason)`（p2p.ts:312-333）：置 terminalFailed、关闭 peer/channel、清 pendingCandidates、状态 → failed/disabled，并记录结构化诊断日志（reason、connectionState、readyState）；
- `close()` 与 `fail()` 区分：close 是正常收尾（回 idle），fail 是终态。

## 3. Glare（双 offer 冲突）防护

`tryBeginHandshake`（p2p.ts:159-178）：

```ts
if (this.remoteIntent !== true && this.options.localPlayerId !== "Player1") {
  return;   // 非 Player1 永远不主动 offer
}
```

角色由房间 slot 确定（Player1 = offer 方），天然无冲突，不需要 perfect negotiation 模式。

## 4. Candidate 缓冲

`handleSignal`（p2p.ts:246-298）：

```ts
if (!this.peer.remoteDescription) {
  this.pendingCandidates.push(candidate);   // SDP 还没到，先存
} else {
  await this.peer.addIceCandidate(candidate);
}
// setRemoteDescription 之后：
await this.flushPendingCandidates();
```

信令经服务器两跳转发，candidate 先于 offer/answer 到达是常见情形，不缓冲会直接 addIceCandidate 抛错。

## 5. DataChannel 配置与收发

```ts
peer.createDataChannel("fxtz-input", { ordered: false, maxRetransmits: 0 });
channel.binaryType = "arraybuffer";
// 发送（p2p.ts:132-146）
const bytes = encodeProtocolMessage(message);
channel.send(bytes.slice());     // slice 拷贝，避免复用底层 buffer
// 接收（p2p.ts:224-234）
const decoded = decodeProtocolMessage(event.data);
if (decoded && typeof decoded === "object" && "type" in decoded) { ... }
```

收到的消息是对端的 ClientMessage 视角，需经 `dataChannelMessageToPeerServerMessage` 转换成本地期望的 ServerMessage 视角（如 `input_frame` 附上对端 playerId、`loading_done` → `peer_loading_done`），保证游戏层无论消息来自服务器还是 P2P 处理逻辑完全一致。

## 6. 服务端转发（handler.ts）

- `handleP2pIntent`（:1087）/ `handleP2pSignal`（:1098）/ `handleP2pReady`（:1119）：校验发送者在房间内 → `relayToPeer` 转给另一 slot；
- `normalizeP2pSignal`（:1592）白名单：只放行 `{kind:"offer",sdp} | {kind:"answer",sdp} | {kind:"candidate",candidate,sdpMid,sdpMLineIndex}`，其余丢弃——防止客户端注入任意 JSON；
- 服务器完全不理解 SDP 内容，未来升级 WebRTC 用法无需改服务器。

## 7. 与可靠层/降级的对接

- `CombatSyncManager.sendInput`：`if (!p2p.send(msg)) connectionManager.send(msg)` —— P2P 不可用时每条消息独立回落服务器中转，两条链路可混用（对端从两个入口都能收，去重靠 Map 幂等覆盖）；
- `p2p.connected == true` 时发送侧才附加 `UnreliableLinkExtra.redundantInputs`（4 帧冗余）；
- `handleServerMessage` 返回 true 表示消息是 p2p 信令已被消费，游戏层不再处理（manager.ts:152-155 的先行拦截）。

## 8. 失败矩阵

| 场景 | 触发 | 结果 |
|------|------|------|
| 对方设置禁用 P2P | peer_p2p_intent{enabled:false} | fail("peer_disabled")，全程走中转 |
| 无 RTCPeerConnection（老 WebView） | canUseWebRtc() false | 上报 intent:false + fail |
| 对称 NAT 打洞失败 | 20s 无 onopen | fail("timeout")，走中转 |
| 中途断开 | connectionState=disconnected/failed | fail，后续消息自动走中转 |
| send 抛异常 | channel.send throw | fail("send_error")，本条消息由调用方回落中转 |
