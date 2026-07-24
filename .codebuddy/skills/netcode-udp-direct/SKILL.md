---
name: netcode-udp-direct
description: 为 TypeScript 双人联机游戏（桌面端，Tauri/Electron 类）建立原生 UDP 套接字直连，含 Rust 侧 socket 桥接、hello/welcome 地址交换握手、观战者接入与历史重放。该技能应在局域网/公网直连（玩家手工交换 IP:PORT）、需要绕过浏览器无 UDP 限制、或需要最低延迟链路时使用。UDP 天然不可靠，可靠性由 netcode-reliability-layer 的冗余捎带承担。
---

# UDP 直连（桌面端原生套接字）

## 架构总览

```
Host (listen 0.0.0.0:port)  <──UDP 数据报──>  Guest (listen 随机端口)
        ▲ Tauri invoke/event 桥接                      ▲
   前端 UdpDirectSession                        前端 UdpDirectSession
                              （可选）Spectator*N ──hello{spectator}──> Host
```

- 浏览器无原生 UDP，必须由桌面壳（Rust/Tauri）持有 socket，经 IPC 与前端互通；
- 地址交换走**带外渠道**（玩家把 host 的 `IP:PORT` 用 IM 发给对方），没有信令服务器；
- 每个 UDP 数据报 = 一条完整 JSON 消息（天然消息边界，无需分帧）；
- 无连接概念：`welcome` 收到即视为"已连接"，此后对端地址固定；可靠性完全依赖上层冗余捎带 + 预测回滚。

## 实施步骤

1. **原生侧三命令 + 一事件**（Rust/Tauri 参考 `apps/desktop/src-tauri/src/lib.rs`）：
   - `udp_listen(port) -> local_addr`：绑定 `0.0.0.0:port`（0=随机），起接收线程，`set_read_timeout(100ms)` 轮询以便优雅退出；每包 `emit("udp-receive", { addr, data })`；
   - `udp_send(addr, data)`：`socket.send_to`；
   - `udp_stop()`：`running=false` + session 计数自增，令旧接收线程退出（防止重建 socket 后旧线程窜数据）；
   - 状态用 `Mutex<Option<Arc<UdpSocket>>> + AtomicBool + AtomicU64(session)` 管理单例。
2. **前端薄封装**（参考 `desktop-udp.ts`）：`listenUdp/sendUdp/stopUdp/subscribeUdp`；注意 `Uint8Array ↔ number[]` 转换对齐 Rust `Vec<u8>`。
3. **握手协议**（JSON 数据报）：
   - Host：`host(port, username)` → listen + subscribe，把返回地址交给玩家分发；
   - Guest：`connect(addr, username)` → listen(0) + subscribe + 发 `hello { client }`；
   - Host 收 hello → 记录 peer 与来源 addr（**以实际收包 addr 为准**，天然穿过 NAT 回程）→ 回 `welcome { client }` → 双方 onMatch。
4. **对战数据**：`p2p_packet { message }` 包裹视角转换后的 ServerMessage；`battle_ready { loadout }` 交换配置后开战。
5. **接入可靠层**：实现 `PeerConnection` 接口（UDP 版 status 恒为 connected，send 直发数据报）；游戏层照常开启 4 帧冗余捎带 + 预测回滚（见 netcode-reliability-layer）。
6. **（可选）观战者**：spectator 发 `hello { spectator:true }` → Host 记录地址、回 `spectator_welcome` 并**重放全量历史**（battle_start + 排序去重后的 input_frame 流），此后实时 `spectator_packet` 广播。

## 关键坑

- **旧接收线程窜话**：重复 listen 不做 session 版本号会导致旧线程把包发给新会话——session 原子计数 + 线程内比对是必须的。
- **NAT 回程**：Guest 的 hello 到达 Host 时，Host 必须用收包的 `addr`（而非 Guest 自报地址）作为回信地址；Guest 侧同理以 welcome 的来源地址锁定 peer。公网对称 NAT 下仍可能不通，此时引导玩家改用其它方案。
- **MTU**：单数据报 JSON 保持 < ~1200 字节，避免 IP 分片放大丢包（输入帧远小于此，观战历史重放要逐条发不要合包）。
- **无 keepalive 即无断线检测**：本方案未实现心跳，掉线表现为"对方输入停止"，由上层 peer 暂停/超时兜底；如需更快检测可加周期性 ping 数据报。
- 恶意包：UDP 端口对任何人开放，decode 失败直接丢弃、握手前的 p2p_packet 一律忽略（`if (!this.peer) return`）。

## 参考资料

- `references/udp-session.md` — Rust 桥接、握手状态机、观战重放、与游戏层对接的完整细节。
- 本仓库真实实现：`apps/frontend/src/network/udp-direct-session.ts`、`apps/frontend/src/network/desktop-udp.ts`、`apps/desktop/src-tauri/src/lib.rs`（udp_listen/udp_send/udp_stop）。
