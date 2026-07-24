# localsend 公共信令协议与载荷封装

真实实现参考：`apps/frontend/src/network/local-lan.ts`、`local-lan/services/signaling.ts`。

## 1. 服务器与注册

- 端点：`wss://public.localsend.org/v1/ws`（local-lan.ts:7）。
- 注册信息 `ClientInfoWithoutId`：

```ts
{
  alias: string,        // 玩家用户名（对其它 localsend 用户可见）
  version: string,      // 客户端构建号（用于双端版本匹配提示）
  deviceType: PeerDeviceType.web | desktop,
  token: string,        // crypto.randomUUID()，服务器用于识别重连
}
```

- `SignalingConnection.connect({ url, info, onMessage, generateNewInfo, onClose })`：generateNewInfo 用于服务器要求重新注册（如 token 冲突）时生成新身份。

## 2. 服务器下行消息（WsServerMessage）

| type | 载荷 | 处理（local-lan.ts:160-213） |
|------|------|------|
| HELLO | `{ client, peers[] }` | 记录自身 id，重建 peers Map |
| JOIN | `{ peer }` | peers.set |
| UPDATE | `{ peer }` | peers.set（alias 等变更） |
| LEFT | `{ peerId }` | peers.delete + 清 outgoing/incoming 请求 + 若是 matched 对象则解除匹配 |
| OFFER / ANSWER | `{ peer, sessionId, sdp }` | 解码 sdp 为 LocalPayload 处理 |
| ERROR | — | onStatusChange("error") |

**OFFER 与 ANSWER 必须同等处理**：本方案统一用 OFFER 发送，但服务器/对端实现可能以 ANSWER 回带，两个 case 共用同一分支（local-lan.ts:184-208）。

## 3. 载荷封装

发送（local-lan.ts:255-266）：

```ts
signaling.send({
  type: "OFFER",
  sessionId: `${Date.now().toString(36)}-${random}`,  // 每条唯一即可
  target: targetPeerId,
  sdp: encodeStringToBase64(JSON.stringify(payload)),
});
```

解包（local-lan.ts:268-279）：base64 → TextDecoder → JSON.parse，任何异常返回 null 丢弃；再校验 `"kind" in payload`。

**来源校验（必做）**：`p2p_packet` 与 `battle_ready` 仅当 `payload.targetId === this.client.id && payload.sourceId === message.peer.id` 才接受（local-lan.ts:196-206）——信封 peer.id 由服务器背书，载荷内 sourceId 由发送方自称，两者必须一致，防止公共服务器上的第三方伪造。

## 4. 双向确认匹配状态机

```
requestPeer(id):  outgoingRequests.add(id) → 发 match_request → maybeMatch
收 match_request: incomingRequests.add(peer.id) → maybeMatch

maybeMatch(id)（local-lan.ts:215-231）:
  matched 条件 = outgoingRequests.has(id) && incomingRequests.has(id)
  满足 → matchedPeerId = id → onMatch(peer) 回调
```

UI 状态由 `getPeerStates()` 派生：每个 peer 标 `{ outgoingRequest, incomingRequest, matched }`，列表按 alias 中文排序。

## 5. 对战数据桥接

```ts
// local-lan.ts:137-145
createP2pBridge(targetPeerId, localPlayerId) {
  const ctx = createNetworkServiceContext(localPlayerId, { transport: "local-lan", targetPeerId });
  return { send: (msg) => this.sendPeerPacket(targetPeerId, ctx, msg) };
}
```

`sendPeerPacket`：`clientMessageToPeerServerMessage(ctx, msg)` 把本地 ClientMessage（如 input_frame）转换成**对端视角的 ServerMessage**（附 playerId、type 改写），再包成 `p2p_packet` 发出。接收侧 `setPeerPacketHandler(handler)` 把 payload.message 直接交给 CombatSyncManager.receivePeerMessage —— 游戏层完全感知不到底层是 localsend。

发送端已完成视角转换是本方案与 WebRTC P2P 的差异点（WebRTC 是接收端转换）；两种都可以，关键是**全链路统一在一端做**。

## 6. 断线语义

onClose（local-lan.ts:89-99）：signaling/client/peers/requests/matched/handler 全部清零 + 通知 UI disconnected。**无重连恢复**——公共服务器无自营会话概念，重连即新身份，正在进行的匹配作废。战斗内断线由上层 reliability-layer 的 peer 暂停/1s 超时机制兜底。

## 7. 上层冗余为何仍然开启

虽然 WebSocket 本身是 TCP 可靠流，但：
- 第三方服务器可能静默丢消息（限流、队列溢出、协议不兼容字段被剥离）；
- 断线重连期间的消息永久丢失（无会话恢复）；

因此该链路在游戏层被归类为"不可靠 P2P"（`p2p.connected` 语义），发送 input_frame 时照常附带 `UnreliableLinkExtra.redundantInputs` 4 帧冗余 + 预测回滚，成本极小而容错显著。
