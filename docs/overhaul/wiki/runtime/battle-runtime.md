# 战斗运行时

## 生产入口

当前前端生产路径通过 `createRaidLogicRuntime(options)` 创建 `RaidLogicRuntime`。运行时封装 `BattleModel`、确定性 Rapier 物理适配器和 `BattleOutputQueue`。

调用顺序是：

1. 创建运行时；
2. `await runtime.initialize()` 初始化物理；
3. 每 tick 调用 `step(...)`；
4. 消费返回值或排空 `outputQueue`；
5. 回滚时用 `serialize()` / `deserialize(snapshot)`；
6. 用 `hashHex()` 或 `hashComponentsDebug()` 检查一致性。

在 `physicsReady` 之前调用 `step` 会抛错。

## 初始化参数

`RaidLogicRuntimeOptions` 包括：模拟模式、双方 loadout、地图、`BattleRoomMode`、初始点数、确定性 seed、AI 参数和协作模式调试跳转。地图决定 arena bounds、出生点和 `mobSpawnerId`。

## 输入分支

- `training` / `ai`：`step({ mode, player })`。AI 模式由 `BattleModel` 内的 `CpuPlayer` 补齐对手输入。
- `online`：`step({ mode: "online", player, target, hostIsPlayer })`。`hostIsPlayer` 决定同帧动作的处理优先级；同步层固定让 Player1 优先。

运行时会暴露最近实际使用的双方输入，以及 `aimConsumedThisFrame`。后者不是表现信息，而是同步优化契约：只有某帧的 aim 真正影响射击、Bomb、主动卡或投射物重定向时，预测输入比较才必须包含 aim。

## 输出

每次推进或恢复都会创建完整 `BattleOutputFrame`。初始构造、`reset`、调试写入和 `deserialize` 产生 `snapshot_restored`；正常 `step` 产生 `frame_advanced`。

`BattleOutputState` 包含双方 fighter、点数掉落物、Mob、投射物、效果、护盾、训练统计和可选协作状态。表现层只应读取输出，不应持有并修改模型内部数组。

## 旧运行时边界

`RaidBattle`、`RaidState`、`FighterEntity` 等仍从 `@repo/raid-logic` 导出，并有测试覆盖，但前端 `BattleSession` 不使用它们。它们是较早的回滚游戏/兼容示例路径。修改当前游戏行为时应从 `RaidLogicRuntime -> BattleModel` 追踪，不要只修改 `sync/state.ts`。

## 源码索引

- `packages/raid-logic/src/battle/runtime.ts`
- `packages/raid-logic/src/battle/model/index.ts`
- `packages/raid-logic/src/battle/output.ts`
- `packages/types/src/battle/input.ts`
- `packages/types/src/battle/output.ts`
- `packages/types/src/battle/runtime-state.ts`
