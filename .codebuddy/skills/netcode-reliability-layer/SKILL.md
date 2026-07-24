---
name: netcode-reliability-layer
description: 在不可靠物理信道（UDP、WebRTC DataChannel、第三方中转）之上，为 TypeScript 双人联机游戏构建应用层可靠输入同步。该技能应在需要设计帧输入冗余捎带、捎带 ACK、去重、乱序容忍、预测回滚、历史裁剪等可靠性机制时使用；是 netcode-webrtc-p2p、netcode-public-relay-localsend、netcode-udp-direct 三条不可靠链路的共同上层。
---

# 不可靠信道上的可靠输入同步层

## 核心思想

不在传输层实现 TCP 式"定时器重发 + 显式 ACK 包"，而是利用锁步/回滚类游戏"每帧都要发输入"的特性，做**冗余捎带**：

1. 每帧发送 `input_frame` 消息，消息内**捎带 ACK**（`ackFrame`）与**最近 N 帧的冗余输入**；
2. 丢包由后续帧的冗余输入自动补齐，无需重发定时器；
3. 收不到的帧先用**预测**顶上，真实输入到达且不一致时**回滚重放**；
4. 双方都确认过的帧（confirmedFrame）之前的历史全部**裁剪**，内存有界。

适用前提：游戏逻辑为确定性模拟（相同输入序列 → 相同状态），帧率固定（如 60fps）。

## 实施步骤

按顺序完成以下模块（详细协议与代码见 references）：

1. **定义消息**：`input_frame = { type, frame, ackFrame, ...input }`；不可靠链路附加 `UnreliableLinkExtra.redundantInputs`（前 1~4 帧输入）。
2. **实现连续 ACK 语义**：`ackFrame` 表示"已连续收到对方 ≤N 的全部帧"，靠 `advanceRemoteContiguousFrame` 只在无空洞时推进。
3. **实现收发队列**：发送侧 pending 队列、接收侧 received 队列，每帧 step 时统一 drain，保证与模拟节拍解耦。
4. **实现去重与乱序容忍**：所有输入写入 `Map<frame, input>`，重复/乱序到达等价于幂等覆盖，天然去重。
5. **实现预测与回滚**：缺帧时复用"对方最近一次已知输入"作预测并登记；真实输入到达后按"意图比较"判定是否回滚到 `frame-1` 快照并重放。
6. **实现历史裁剪**：`confirmedFrame = min(本地已连续收到的对方帧, 对方 ack 的本地帧)`，裁剪其之前的输入、预测、快照。
7. **规范化输入**：序列化往返会引入浮点误差（如 aim 坐标 312.7 ↔ 312.69999），必须 `Math.trunc` 规范化，否则触发大量假回滚。
8. **降级路径**：`p2p.send()` 返回 false 时回落到可靠的服务器中转信道（见 netcode-room-relay）。

## 关键设计取舍

- **冗余深度 4 帧**：60fps 下相当于每个输入被发送 5 次、覆盖 ~83ms 连续丢包；更深加带宽，更浅抗丢包差。
- **ACK 不用于重发，只用于裁剪**：即使 ack 丢了也只是暂时多留历史，无正确性风险。
- **aim 类连续量只在"被消费"的帧参与回滚比较**（射击/放技能帧），鼠标微动不触发回滚。
- **终局裁决**：game_over 判定消息同样携带 `frame + ackFrame`，双方各自出裁决后取 `min(双方 frame, 双方 ackFrame)` 为确认帧。

## 参考资料

- `references/redundancy-and-ack.md` — 冗余捎带、连续 ACK、去重、消息结构完整细节。
- `references/rollback-and-prediction.md` — 预测、意图比较、回滚重放、历史裁剪完整细节。
- 本仓库真实实现：`apps/frontend/src/network/combat/manager.ts`（CombatSyncManager）、`apps/frontend/src/network/combat/queues.ts`（CombatInputQueues）。
