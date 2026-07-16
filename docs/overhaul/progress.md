# 重构进度

## 2026-07-16：阶段 0—1

### 完成

- 盘点 workspace 包、客户端战斗目录、网络目录和主要大文件。
- 确认 `BattleScene`、`BattleRuntimeAdapter`、`BattleNetworkManager` 为第一批耦合热点。
- 建立重构目标、依赖规则、阶段计划和验证基线。
- 提取无 Phaser 依赖的 `BattleFramePipeline`。
- 将固定帧 accumulator、本地/同步分流、双人输入与帧记录迁入新模块。
- 将 `BattleRuntimeAdapter` 收缩为运行时创建和 Phaser 事件/键盘 adapter。
- 添加接口级测试覆盖离线固定帧、在线同步分流和同设备双人模式。

### 验证结果

- `frame-pipeline.test.ts`：3 个测试通过。
- 前端 lint：通过，保留仓库原有的 69 个 warning。
- 初始基线暴露出 FighterState 测试夹具和联机哈希失败；已在后续诊断中修复。

### 后续

1. 合并运行时、回滚和同步的回调网，形成 `BattleSession` 小接口。
2. 引入战斗视图模型投影，逐步阻止 Phaser 视图读取完整领域对象。

## 2026-07-16：阶段 2 与目录规划

### 完成

- 建立目标目录树、文件放置规则和逐文件迁移表。
- 将纯 `BattleFramePipeline` 移入 `battle/session`。
- 将 `BattleRuntimeAdapter` 移入 `battle/adapters/phaser`。
- 用无 Phaser 的 `BattleNetworkSession` 替代 `BattleNetworkManager`。
- 提取 `BattleNetworkHost` 接口，并提供 Phaser 文本、计时与结果事件 adapter。
- 将战斗连接收敛为 `CombatConnection` 小接口，移除本地连接的类型强转。
- 删除旧 `battle/manager/network-manager.ts`，未保留转发文件。
- 新增网络会话接口测试，覆盖离线不启动同步和 P2P 状态呈现。

### 验证结果

- 阶段 1—2 的 5 个目标测试全部通过。
- 前端 lint 通过，无 error；warning 从基线的 69 个降至 64 个。
- 前端类型检查通过。

## 2026-07-16：测试基线修复

### 根因与修复

- 两个手写 `FighterState` 夹具遗漏 `sakuraCharmGuardAvailable`，补齐与运行时一致的默认值 `false`。
- Backdoor 使魔和 Yukari 的 Ran 每帧使用由 aim 派生的朝向更新确定性状态，但没有声明 aim 已被消费，导致同步层跳过必要回滚。为角色和卡牌增加 `consumesAimOnPostUpdate` 能力，并由战斗逻辑统一上报。
- 新增被动 aim 消费回归测试，覆盖 Backdoor 和 Yukari。
- 修正三个稳定复现的旧基线问题：Yukari 成本断言、Multi-shot 纹理断言，以及 Doll 回收后保留速度。

### 最终验证

- `pnpm test`：全部 workspace 测试通过。
- `pnpm check-types`：全部 workspace 类型检查通过。
- `pnpm lint`：全部 workspace lint 完成，无 error；保留既有 warning。
- `CombatSyncManager` 两种非对称延迟集成测试均通过，确认双方最终帧哈希和全局 BLAKE3 哈希一致。

### 下一步

1. 提取 `BattleSession`，隐藏 `BattleScene` 中运行时、回滚和网络之间的回调网。
2. 将 `rollback-manager.ts` 迁入 `battle/session/rollback-history.ts`。
3. 为 `battle/session` 添加禁止导入 Phaser 的自动依赖守卫。
