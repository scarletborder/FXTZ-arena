# 预测、回滚与历史裁剪

真实实现参考：`apps/frontend/src/network/combat/manager.ts`。

## 1. 每帧主循环

`step(localInput)`（manager.ts:94-130）严格顺序：

1. **先入队并发送本地输入**（frame = runtime.frame + 1）——保证随后触发的回滚重放能取到本帧最新本地输入；
2. drain 接收队列，应用远端输入（可能触发回滚）；
3. `runtime.step()` 推进一帧；
4. 记录快照（供回滚）、裁剪历史。

## 2. 预测

`getInputForFrame`（manager.ts:588-599）：

- 有真实输入 → 直接用；
- 没有 → 克隆 `lastKnownInputs`（对方最近一次已知输入）作为预测值，并登记到 `predictedInputs[playerId:frame]` 供事后比对。

"重复上一帧输入"是双人动作游戏最优的零成本预测器：移动按住不放、按钮多数帧不变。

## 3. 真实输入到达：是否回滚？

`receiveRemoteInput`（manager.ts:361-391)：

```ts
storeInput(playerId, frame, actualInput);
advanceRemoteContiguousFrame();
if (frame <= runtime.frame) {              // 该帧已被模拟过
  const previous = existing ?? predicted;  // 当时用的是什么
  const aimMismatch = aimConsumingFrames.has(frame)
    ? !sameIntentWithAim(previous, actualInput)
    : !sameIntent(previous, actualInput);
  if (aimMismatch) rollbackTo(frame);
}
```

**意图比较（sameIntent，manager.ts:886-914）是减少假回滚的关键**：

- 离散量（移动方向、各按钮、购买 ID）永远严格比较；
- 连续量（aimX/aimY 鼠标坐标）**只在该帧存在"消费 aim 的动作"时比较**（开枪/炸弹/主动卡，或模拟层标记的 `aimConsumingFrames`，如弹幕转向帧）。鼠标每帧都在动，但不开枪时坐标差异不影响模拟结果，跳过比较可避免每帧回滚。

## 4. 输入规范化（防浮点假回滚）

`canonicalizeInput`（manager.ts:804-829）：`aimX/aimY` 一律 `Math.trunc`。JSON 序列化往返产生的 ~0.3px 浮点差异曾导致整场频繁全量回滚；收发两端统一整数网格后消除。空字符串 ID 规整为 `undefined` 同理。

## 5. 回滚重放

`rollbackTo(changedFrame)`（manager.ts:393-415）：

1. `restoreFrame = changedFrame - 1`，取该帧快照 `runtime.deserialize(snapshot)`；
2. 丢弃 restoreFrame 之后的快照与 `aimConsumingFrames` 标记（重放会重建）；
3. `for frame in (restoreFrame+1 .. currentFrame)` 逐帧 `stepRuntimeFrame` 重放——本地输入用真实历史，远端输入用"真实优先、否则预测"（getInputForFrame），并重新记录快照。

前提：模拟运行时必须支持 `serialize/deserialize` 全量快照，且逐帧记录（`callbacks.getRollbackRecord(frame)`）。

## 6. 历史裁剪（内存有界）

`pruneOnlineHistory`（manager.ts:672-737）：

```ts
confirmedFrame = min(lastReceivedRemoteFrame, lastPeerAckFrame);
```

- 先把 ≤confirmedFrame 且双方输入齐全的帧逐帧上报为"已确认输入"（可用于录像/一致性校验）；
- 然后删除该水位线之前的：快照历史、双方输入 Map、预测记录、aimConsumingFrames、强制 ready 标记。

由于 ackFrame 语义是"连续无空洞"，裁剪永远安全：任何未来回滚都不可能回到 confirmedFrame 之前。

## 7. 断线与暂停

- 收到 `peer_status: disconnected` → `paused = true`，启动 1 秒重连超时（manager.ts:217-229），超时判本地胜结束；
- `peer_status: reconnected` → 清除超时、恢复；
- 暂停期间 `step()` 仍要 `drainReceived(() => undefined)` 排空接收队列（manager.ts:96-99），防止恢复瞬间积压输入引发回滚风暴。

## 8. 一致性验证

搭好后用确定性测试验证：同一输入序列在"直连无丢包"与"高丢包乱序"两种模拟链路下最终状态哈希一致。本仓库参考 `apps/frontend/src/network/combat/rollback-consistency/`（harness.ts / matrix.ts / character-suite.ts）。
