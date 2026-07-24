# 冗余捎带与连续 ACK 设计

真实实现参考：`apps/frontend/src/network/combat/manager.ts`（下文行号以该文件为准）。

## 1. 消息结构

```ts
interface InputFrameMessage {
  type: "input_frame";
  frame: number;      // 本条输入所属帧号（从 1 开始）
  ackFrame: number;   // 捎带 ACK：我已"连续无空洞"收到对方的最高帧号
  // ...输入字段（moveX/moveY/aimX/aimY/各按钮布尔量等）
  UnreliableLinkExtra?: {
    redundantInputs: Array<{ frame: number; /* ...输入字段 */ }>;
  };
}
```

要点：
- `ackFrame` 是**捎带**的，不发独立 ACK 包；
- `UnreliableLinkExtra` 只在不可靠链路（WebRTC/UDP/第三方中转）上填充，可靠链路（服务器 WS/WT 中转）省流量不带。

## 2. 发送路径（每帧一次）

`sendInput`（manager.ts:341-359）：

```ts
const message: InputFrameMessage = {
  type: "input_frame",
  frame,
  ackFrame: this.lastReceivedRemoteFrame,   // 捎带 ACK
  ...canonicalizeInput(input),
};
const redundantInputs = this.options.p2p?.connected
  ? this.createRedundantInputs(frame)       // 仅不可靠链路
  : [];
if (redundantInputs.length > 0) {
  message.UnreliableLinkExtra = { redundantInputs };
}
if (!this.options.p2p?.send(message)) {
  this.connectionManager.send(message);     // 降级：走服务器中转
}
```

`createRedundantInputs`（manager.ts:558-586）：取 `currentFrame-1` 到 `max(1, currentFrame-4)` 共至多 4 帧的本地历史输入，逐帧克隆打包。**每个输入总共被发送至多 5 次**（本帧 1 次 + 后续 4 帧捎带），60fps 下覆盖约 83ms 的连续丢包窗口。

## 3. 接收路径

`receiveInputFrameMessage`（manager.ts:301-319）：

```ts
this.queues.enqueueReceived({ playerId, frame, ackFrame, input: canonicalizeInput(msg) });
for (const redundant of msg.UnreliableLinkExtra?.redundantInputs ?? []) {
  this.queues.enqueueReceived({ playerId, frame: redundant.frame, ackFrame, input: ... });
}
```

主帧与冗余帧一视同仁入队。消费在每帧 `step()` 内统一 `drainReceived`（manager.ts:321-326），先更新 `lastPeerAckFrame = max(旧值, item.ackFrame)`，再交给 `receiveRemoteInput`。

## 4. 去重与乱序容忍

- 所有输入写入 `Map<PlayerId, Map<number, BattleInputState>>`（manager.ts:19、519-525）。重复到达 = 幂等覆盖（同帧输入内容相同），无需显式序号去重表。
- 乱序到达无影响：`Map` 按帧号索引，消费时按需查找。

## 5. 连续 ACK 语义（关键）

`advanceRemoteContiguousFrame`（manager.ts:739-752）：

```ts
while (true) {
  const nextFrame = this.lastReceivedRemoteFrame + 1;
  const nextInput = remoteInputs.get(nextFrame);
  if (!nextInput) break;                 // 有空洞就停
  this.lastReceivedRemoteFrame = nextFrame;
  this.lastKnownInputs.set(remote, nextInput);
}
```

`lastReceivedRemoteFrame` 只在**无空洞**时推进，因此 `ackFrame=N` 严格意味着"≤N 全部收到"。这让对端可以安全裁剪 ≤N 的历史，也让 `getConfirmedFrame()`（manager.ts:417-420）：

```ts
confirmedFrame = min(lastReceivedRemoteFrame, lastPeerAckFrame)
```

成为"双方都拥有全部输入"的安全水位线。

## 6. 队列实现

`apps/frontend/src/network/combat/queues.ts` — 两个纯数组 FIFO（send_scene / receive_scene），`drainPending` / `drainReceived` 在游戏帧内同步清空。作用是把网络回调时机与模拟节拍解耦：网络线程任意时刻入队，模拟只在 `step()` 边界消费。

## 7. 为什么不需要重发定时器

- 输入天然每帧都发（等价于 16.7ms 周期的"重发时钟"）；
- 冗余捎带使单包丢失被后续 4 包覆盖；
- 若连续丢 5 包以上，预测 + 回滚机制兜底（见 rollback-and-prediction.md）；
- 若链路彻底断开，`p2p.send` 失败自动回落服务器中转，或触发暂停/重连超时（manager.ts:188-236，1 秒重连窗口）。

## 8. 终局裁决（不可靠链路上的可靠"最后一条消息"）

game_over 是一次性消息，丢了没有后续帧捎带，处理方式（manager.ts:435-502）：
- 裁决消息携带 `frame + ackFrame + winnerPlayerId`；
- 双方各自发出裁决，收到对方裁决即触发 `trySendGameOverVerdict`（收到即等价 ACK）；
- 最终确认帧取 `min(本地 frame, 本地 ackFrame, 对方 frame, 对方 ackFrame)`；
- 一方先出结果、另一方还没 gameOver 时，后者以 `min(自身帧, 已收对方帧, 对方裁决帧)` 出裁决呼应。
