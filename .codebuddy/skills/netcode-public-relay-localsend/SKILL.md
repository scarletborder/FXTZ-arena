---
name: netcode-public-relay-localsend
description: 在没有自营服务器的情况下，借用第三方公共信令服务器（localsend 公共 WebSocket，wss://public.localsend.org/v1/ws）为 TypeScript 双人联机游戏做玩家发现、双向确认匹配与对战数据中转。该技能应在需要"零基础设施"联机方案、把自定义载荷伪装进第三方协议字段（OFFER/ANSWER 的 sdp 字段装 base64 JSON）、或设计双向 match_request 握手时使用。
---

# 第三方公共服务器（localsend）中转的连接

## 核心思路

localsend 公共信令服务器本是为 WebRTC 文件传输设计的：客户端注册后可见同一签名分组的 peer 列表，并允许向指定 peer 转发 `OFFER/ANSWER { sdp }` 消息。本方案**不做 WebRTC**，而是把自定义 JSON 载荷 base64 后塞进 `sdp` 字段，将其当作免费的"玩家发现 + 小报文中转"通道：

```
Client A ──wss──> public.localsend.org/v1/ws <──wss── Client B
              OFFER{target, sdp: base64(JSON payload)}
```

- 发现：HELLO/JOIN/UPDATE/LEFT 消息维护在线 peer 列表；
- 匹配：双向 `match_request` 互相确认后视为 matched；
- 对战数据：`p2p_packet`（内含 input_frame 等）逐条经服务器转发；
- 物理信道是单条 WebSocket（TCP，可靠），但**第三方服务器可能丢弃/限流/断连且不受控**，工程上按不可靠链路对待：上层保持 netcode-reliability-layer 的冗余捎带与预测回滚。

## 实施步骤

1. **实现 localsend 信令客户端**：连接 `wss://public.localsend.org/v1/ws`，注册 `ClientInfo { alias, version, deviceType, token }`（token 用 randomUUID）；处理 `HELLO`（拿到自身 id + 存量 peers）、`JOIN/UPDATE`（增改 peer）、`LEFT`（删 peer + 清理其请求状态）、`ERROR`。
2. **定义自定义载荷**（塞进 sdp 字段）：
   ```ts
   type LocalPayload =
     | { kind: "match_request"; sourceId; sourceName; targetId }
     | { kind: "p2p_packet"; sourceId; targetId; message: ServerMessage }
     | { kind: "battle_ready"; sourceId; targetId; loadout };
   ```
   发送：`signaling.send({ type:"OFFER", sessionId, target: peerId, sdp: base64(JSON.stringify(payload)) })`；接收端对 OFFER 和 ANSWER 同等解码。
3. **双向确认匹配**：本方 requestPeer → outgoingRequests.add；收到对方 match_request → incomingRequests.add；`outgoing ∩ incoming` 同时含对方 id 才算 matched（防单方面拉人进战斗）。
4. **载荷安全校验**：解码后必须校验 `payload.targetId === 自身 id && payload.sourceId === 消息信封中的 peer.id`，防止伪造来源/串线（公共服务器上有陌生 localsend 用户）。
5. **桥接游戏层**：`createP2pBridge(targetPeerId, localPlayerId)` 返回 `{ send(ClientMessage) }`，内部转成对端视角的 ServerMessage 后按 p2p_packet 发送；接收侧 `setPeerPacketHandler` 直通 CombatSyncManager。
6. **战斗启动握手**：matched 后双方各自发 `battle_ready { loadout }` 交换配置，双方都收到后进入战斗场景。

## 关键坑与约束

- **协议寄生的脆弱性**：localsend 协议升级/字段校验收紧可能随时破坏方案，版本必须可灰度回退到其它连接方式；不要发大报文（sdp 字段做文件传输信令用，塞几 KB 输入帧没问题，塞资源数据会被掐）。
- **对陌生 peer 可见**：你的客户端会出现在其他 localsend 用户的设备列表里（alias 可见），alias 用游戏用户名即可，勿放敏感信息。
- **无会话恢复**：WebSocket 断了 = 全部状态清零重来（peers/requests/matched 全清，onClose 回调里统一处理），战斗中断线依赖上层 1 秒暂停超时判定。
- **每条消息过服务器**，RTT 比真 P2P 高；适合作为"找不到服务器/打洞失败"时的保底社交联机，不适合作为主力对战链路。

## 参考资料

- `references/localsend-protocol.md` — localsend 信令消息全集、载荷封装/解包、匹配状态机细节。
- 本仓库真实实现：`apps/frontend/src/network/local-lan.ts`（LocalLanSession）、`apps/frontend/src/network/local-lan/services/signaling.ts`（协议层）、`utils/base64.ts`。
