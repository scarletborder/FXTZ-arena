# UDP 直连会话实现细节

真实实现参考：`apps/frontend/src/network/udp-direct-session.ts`、`desktop-udp.ts`、`apps/desktop/src-tauri/src/lib.rs`。

## 1. Rust 侧（Tauri）

状态（lib.rs:25-30）：

```rust
struct UdpState {
  socket: Mutex<Option<Arc<UdpSocket>>>,
  running: Arc<AtomicBool>,
  session: Arc<AtomicU64>,   // 防旧线程窜话的版本号
}
```

`udp_listen`（lib.rs:32-80）关键点：

1. 先 `stop_udp_socket`：`running=false` + `session += 1`；
2. `UdpSocket::bind(("0.0.0.0", port))`，`set_read_timeout(100ms)`——接收线程以 100ms 超时轮询，`WouldBlock/TimedOut` 时检查 `running` 与 `session` 是否仍是自己的版本，不是则退出；
3. 接收线程每包 `app.emit("udp-receive", UdpPayload { addr: 来源SocketAddr字符串, data: Vec<u8> })`；
4. 返回 `local_addr()` 字符串（含实际分配端口）。

`udp_send`（lib.rs:82-92）：锁取当前 socket，`send_to(&data, addr)`，addr 为 `"ip:port"` 字符串。

## 2. 前端薄封装（desktop-udp.ts）

```ts
listenUdp(port)  → invoke("udp_listen", { port }) → 返回地址字符串
sendUdp(addr, u8) → invoke("udp_send", { addr, data: Array.from(u8) })  // Vec<u8> 对齐
subscribeUdp(cb) → event.listen("udp-receive", ...) → data: number[] 还原为 Uint8Array
stopUdp()        → invoke("udp_stop")
```

仅 `IS_DESKTOP_APP` 环境可用；web 构建下这些函数不可达（UI 隐藏该入口）。

## 3. 数据报协议（udp-direct-session.ts:24-49）

每个数据报 = `TextEncoder.encode(JSON.stringify(payload))`，一报一消息：

```ts
type UdpPayload =
  | { kind: "hello"; client: ClientInfo; spectator?: boolean }
  | { kind: "welcome"; client: ClientInfo }
  | { kind: "spectator_welcome"; client: ClientInfo }
  | { kind: "p2p_packet"; message: ServerMessage }
  | { kind: "spectator_packet"; message: ServerMessage }
  | { kind: "battle_ready"; loadout: PlayerLoadout };
```

decode 任何异常 → null → 静默丢弃（公网端口会收到扫描垃圾包）。

## 4. 握手状态机（handlePacket，:126-183）

```
Guest                          Host
  │ hello{client}                │
  ├─────────────────────────────>│ peer=client; peerAddr=收包addr
  │            welcome{client}   │ onMatch(peer)
  │<─────────────────────────────┤
  │ peer=client; peerAddr=来源addr
  │ onMatch(peer)
  │
  │ battle_ready{loadout} 双向互发 → onBattleReady → 进战斗
  │ p2p_packet{message}   双向互发 → peerPacketHandler → CombatSyncManager
```

规则：
- **地址以实际收包 addr 为准**（Host :143-148、Guest :151-156），自动适配 NAT 映射后的公网地址；
- 握手完成前收到的 `p2p_packet/battle_ready` 因 `!this.peer` 直接丢弃（:171-173）；
- 无显式"断开"消息：close() 只清本地状态 + stopUdp，对端靠上层输入停止 + 暂停超时感知。

## 5. 观战者路径（Host 专属）

- `hello { spectator:true }` → `spectatorAddrs.set(addr, client)` → 回 `spectator_welcome` → **逐条重放** `spectatorHistory`（:133-141）；
- `sendToSpectators(message)`（:207-212）：先 `rememberSpectatorMessage` 入历史，再对所有观战地址广播 `spectator_packet`；
- 历史维护（:214-245）：
  - `battle_start` 保证唯一且位于首个 input_frame 之前（迟到则 splice 插入，重复则原位替换）；
  - `input_frame` 按 `(playerId, frame)` 去重（重复覆盖），插入后按 `frame → playerId` 排序；
  - 效果：任意时刻加入的观战者都能拿到"battle_start + 有序完整输入流"，用与对战相同的确定性模拟无状态重放。

## 6. 与游戏层对接

两个桥接对象（:112-120）：

- `createP2pBridge(localPlayerId)` → `{ send(ClientMessage) }`：`clientMessageToPeerServerMessage` 做视角转换后包 `p2p_packet` 发出——作为 CombatSyncManager 的"connectionManager"替身；
- `createDirectPeer(localPlayerId)` → `PeerConnection` 实现（UdpDirectPeerConnection，:288-351）：
  - `connected` 恒 true、`status` 恒 "connected"（UDP 无连接语义，握手完成即视为在线）；
  - `send()` 直发；`handleServerMessage` 经 `proxyDirectPeerServerMessage` 拦截 `peer_loading_done` 等控制消息。

因为 `p2p.connected === true`，CombatSyncManager 自动启用 `UnreliableLinkExtra.redundantInputs`（4 帧冗余捎带）+ 预测回滚 + ackFrame 裁剪——UDP 丢包/乱序/重复全部由该层吸收，本文件不实现任何重发逻辑。

## 7. 安全与健壮性检查单

- [ ] decode 失败静默丢弃；
- [ ] 握手前数据包丢弃；
- [ ] `spectator` 与对战 peer 地址表分离，观战者无法注入 p2p_packet（kind 不同）；
- [ ] 重复 hello 幂等（Host 直接覆盖 peer/peerAddr，支持 Guest 换端口重进）；
- [ ] close() 顺序：unlisten → 清 handler → 清状态 → stopUdp().catch(忽略)；
- [ ] 单报文 < 1200B（输入帧 OK；不要把观战历史合并成大包）。
