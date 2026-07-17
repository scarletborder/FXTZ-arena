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

## 2026-07-16：阶段 3 战斗会话

### 完成

- 新增无 Phaser 依赖的 `BattleSession`，统一拥有 `RaidLogicRuntime`、`BattleFramePipeline` 和 `BattleNetworkSession`。
- 将初始输出记录、固定帧更新、同步步进、快进和当前输出访问收敛到会话接口。
- 将回滚快照、确认帧哈希和调试历史迁入纯 `BattleRollbackHistory`。
- 新增 `PhaserBattleRollbackAdapter`，仅保留场景事件、设置读取、音频同步和调试输出等 Phaser 侧职责。
- `BattleScene` 改为组合 `BattleSession` 与 Phaser adapters，不再直接连接运行时、回滚和网络之间的回调网。
- 删除 `runtime-adapter.ts`、`hash-manager.ts` 和 `rollback-manager.ts`，未保留兼容转发文件。
- 新增 `BattleSession` 接口测试，覆盖初始输出记录和固定帧推进。

### 验证结果

- 会话层 3 个测试文件共 6 个测试通过。
- `pnpm test`：全部 workspace 测试通过；前端 71、战斗逻辑 209、服务端 117 个测试通过。
- `pnpm check-types`：全部 workspace 类型检查和前端生产构建通过。
- `pnpm lint`：全部 workspace lint 完成，无 error；保留既有 warning，新回滚 adapter 无 warning。
- `battle/session` 未检出 Phaser 导入，旧 manager 和 adapter 名称未检出残留引用。

### 下一步

1. 增加自动依赖守卫，持续禁止 `battle/session` 导入 Phaser 或具体传输。
2. 提取战斗视图模型投影，让 Phaser 视图不再读取完整领域对象。
3. 继续迁移 `battle/manager` 中的回放和调试职责，缩减 `BattleScene` 组合根。

## 2026-07-16：阶段 3 复核与阶段 4—6

### 复核修正

- 将 `BattleRollbackHistory` 的所有权从 Phaser adapter 移入 `BattleSession`；会话负责排空输出队列、记录快照、维护调试哈希并向呈现端发布输出。
- 将 `BattleDebugLogger` 改为通过 `BattleRollbackLogger` 端口注入，纯 session 模块不再导入浏览器文件写入实现。
- 扩充会话层测试，覆盖离线固定帧、回滚快照存取与裁剪，以及在线同步销毁。

### 渲染投影

- 新增纯 `createBattleViewModel` 投影，集中选择本地角色并派生准星危险状态、Youmu 冲刺高亮、插值和回滚透明度。
- `BattleView.render` 只接收 `BattleViewModel`，正常战斗、回放和观战调用者均已迁移。
- 新增投影测试，验证本地角色选择和准星数据派生。

### 目录与依赖守卫

- 新增架构测试，禁止 `battle/session` 导入 Phaser 或具体网络传输、禁止 `network/combat` 导入 Phaser，并禁止 `battle/view` 导入网络或可变运行时。
- 守卫首次运行发现两个协作 UI 直接读取网络层 `CanonicalFighterKey`；已迁移为 view 自有类型。
- 清空旧 `battle/manager`：布局迁入 `battle/view/layout.ts`，回放和调试控制器迁入 `battle/adapters/phaser`。

### 后续

1. 将商店和转场控制器的输入投影纳入统一 presentation model。

### 场景组合根收尾

- `BattleDebugController` 改为依赖 `BattleSession`，`BattleScene` 不再把可变 runtime 与 rollback history 分别传入调试模块。
- 游戏结束判断与调试物理读取通过会话查询接口完成，场景不再直接读取运行时状态。
- `BattleScene` 保留模块装配、Phaser 生命周期、输入采样、会话推进和视图提交职责。

## 2026-07-17：presentation model 与组合根收尾

### 完成

- 扩展统一 `BattleViewModel`，集中投影协作商店与手动转场的显示、就绪、交互和本地角色数据。
- `CollaborateShopController`、`CollaborateTransitionController` 及其 UI 不再接收完整 `CollaborateExtraState`、`FighterState` 或无类型对象。
- `BattleScene` 只负责创建 presentation model，并把商店、转场和战斗视图所需的子模型提交给对应模块。
- `BattleSession` 增加帧、调试哈希、回滚、调试点数和物理体查询接口；`BattleDebugController` 不再穿透会话读取可变 runtime 或 rollback history。
- 增加架构守卫，禁止 presentation consumers 重新导入完整战斗输出、协作状态或角色状态。

### 验证结果

- presentation model 与会话接口目标测试通过。
- 前端类型检查通过。

### 后续

1. 继续收缩 `BattleSession` 暂留给回滚呈现 adapter 的 runtime/history 兼容访问，并解除 adapter 初始化顺序形成的回调环。
