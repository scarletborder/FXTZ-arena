# FXTZ Arena 开发 Wiki

本 Wiki 描述 **2026-07-17 仓库当前实现**。它面向维护战斗逻辑、联机同步、内容和 Phaser 客户端的开发者，以源码为事实来源，不继承旧文档中已失效的设计设想。

## 阅读路线

- 第一次进入项目：先读[系统总览](./architecture/system-overview.md)和[工作区与依赖](./architecture/workspace-and-dependencies.md)。
- 修改战斗规则：读[战斗运行时](./runtime/battle-runtime.md)、[帧管线](./runtime/frame-pipeline.md)和[确定性、快照与哈希](./runtime/determinism-snapshots-and-hash.md)。
- 修改联机：读[联机架构](./netcode/overview.md)、[输入预测与回滚](./netcode/input-prediction-and-rollback.md)和[协议、传输与服务器](./netcode/protocol-transport-and-server.md)。
- 添加内容：从[内容模型](./content/content-model.md)进入，再按角色、能力卡、投射物或 Mob 阅读专题页。
- 修改前端表现：读[客户端战斗会话与视图](./client/battle-session-and-view.md)。
- 提交前：按[测试与排错](./guides/testing-and-debugging.md)验证。

## 事实优先级

发生冲突时按以下顺序判断：

1. 当前生产代码和测试；
2. `packages/types` 的跨包契约；
3. 根目录 `CONTEXT.md` 与 `docs/adr/` 中仍有效的决策；
4. 本 Wiki；
5. `docs/wiki` 及 `docs/*.md` 中的旧材料。

旧文档可以解释历史背景，但不能用来推断现行接口、帧顺序或同步行为。

## 当前生产主路径

```text
Phaser BattleScene
  -> frontend BattleSession
  -> raid-logic RaidLogicRuntime
  -> BattleModel / BattleFramePipeline
  -> BattleOutputFrame
  -> BattleViewModel
  -> Phaser views
```

联机时，`CombatSyncManager` 位于 `BattleSession` 与 `RaidLogicRuntime` 之间，负责输入发送、远端输入预测、确认帧和回滚重演。专用服务器负责房间、信令、输入转发与对局裁决，不运行权威战斗模拟。

## 维护约定

- 文档中的路径均相对仓库根目录。
- 新增或移动核心接口时，同一变更中更新相关页面的“源码索引”。
- 不在 Wiki 复制完整数值表；数值以 `packages/content/src/content` 和 `packages/constants/src` 为准。
- 不把 `packages/raid-logic/src/entities.ts`、`game.ts`、`sync/state.ts` 的兼容路径写成前端当前生产架构，详见[实体与状态模型](./domain/entity-and-state-model.md)。
