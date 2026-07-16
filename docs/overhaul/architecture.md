# 重构架构与接缝

## 模块划分

### 确定性逻辑

`@repo/raid-logic` 是战斗规则的深模块。它的接口是运行时初始化、输入帧推进、输出帧、快照和哈希。该包不得知道 Phaser、网络传输、菜单或持久化。

### 战斗会话

战斗会话是客户端应用层模块，负责运行时创建、固定帧推进、在线同步选择和回滚记录。调用者只需提交 elapsed time，并读取最新输出。网络同步和回滚记录器是内部接缝，不应由 Phaser adapter 操作运行时输出队列。

阶段 1 先提取其中最稳定的 `BattleFramePipeline`。它隐藏 accumulator、固定步长循环、本地/联机分流、双人输入和自动装填观察。其接口只依赖战斗运行时与回调，不依赖 Phaser。

### 网络

网络分为协议与传输 adapter。协议模块处理消息、确认帧、回滚窗口和连接状态；WebSocket、WebTransport、P2P 与本地直连是传输 adapter。协议不得创建文本、计时器或场景事件。

### 渲染

Phaser 视图消费只读视图模型。领域输出到视图模型的投影负责选择本地玩家、插值、回滚透明度、准星危险状态等派生信息。视图不得推进运行时或发送网络消息。

### 组合根

`BattleScene` 是 Phaser 生命周期 adapter 和组合根。完成重构后，`create` 只装配模块，`update` 只采样输入、推进会话并提交视图，`shutdown` 只释放已装配资源。

## 依赖规则

1. `packages/raid-logic` 不能依赖 `apps/*`、`phaser` 或网络实现。
2. `apps/frontend/src/battle/session` 不能依赖 `phaser`。
3. `battle/view` 不能导入 `network`、`BattleRuntimeAdapter` 或可变运行时。
4. `network/combat` 不能导入 Phaser；显示与延时通过 adapter 注入。
5. 只有组合根可以同时导入逻辑、渲染和网络模块。

目标目录与逐文件迁移表见 [directory-structure.md](./directory-structure.md)。目录是依赖方向的可见表达：`session` 定义接口，`adapters/phaser` 实现技术接缝，`view` 只负责呈现。

## 迁移策略

采用纵向切片而不是目录整体搬迁。每次先定义一个能隐藏真实复杂度的小接口，然后迁移调用者并删除原实现。生产 adapter 与测试 adapter 共同证明接缝真实存在。重构期间保持协议格式、战斗哈希、资源键和场景键不变。

## 验证基线

```powershell
pnpm --filter frontend test
pnpm --filter frontend check-types
pnpm --filter frontend lint
pnpm --filter @repo/raid-logic test
pnpm --filter dedicated-server test
```
