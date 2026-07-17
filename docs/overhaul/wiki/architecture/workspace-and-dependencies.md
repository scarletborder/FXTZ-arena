# 工作区与依赖

## Workspace

| 路径                    | 包名/应用          | 说明                          |
| ----------------------- | ------------------ | ----------------------------- |
| `packages/types`        | `@repo/types`      | 跨包数据契约和协议            |
| `packages/constants`    | `@repo/constants`  | 常量与换算                    |
| `packages/content`      | `@repo/content`    | 可注册内容及战斗 hook         |
| `packages/raid-logic`   | `@repo/raid-logic` | 确定性模拟                    |
| `packages/i18n`         | `@repo/i18n`       | i18next 和中英文资源          |
| `apps/frontend`         | `frontend`         | Phaser 4 + Vite 客户端        |
| `apps/dedicated-server` | `dedicated-server` | WebSocket/WebTransport 服务端 |
| `apps/desktop`          | `desktop`          | Tauri 2 桌面壳                |
| `apps/diff`             | `diff`             | 辅助差异工具                  |

## 依赖方向

核心方向是：

```text
constants <- types
     ^          ^
     +-- content
           ^
           +-- raid-logic
                    ^
                    +-- frontend / dedicated-server
```

图中箭头指向被依赖方，并省略了部分直接依赖（例如 content 和 raid-logic 都直接依赖 constants）。维护时以各包 `package.json` 和架构测试为准。更重要的职责规则是：types 不依赖 content/raid-logic，内容包不导入 raid-logic 内部实现，raid-logic 不导入 Phaser，纯 session 和 combat 模块不导入 Phaser。

## 前端战斗目录

- `battle/session`：无 Phaser 的应用层会话、固定帧和回滚历史。
- `battle/adapters/phaser`：生命周期、状态文本、回放、调试等 Phaser adapter。
- `battle/view`：视图模型投影与 Phaser 表现。
- `battle/input-controller`：键鼠、手柄和移动输入采样。
- `network/combat`：输入同步、预测、确认和回滚协议。
- `network/transport`：WebSocket、浏览器 WebTransport、桌面 WebTransport。

`apps/frontend/src/battle/architecture.test.ts` 自动检查关键依赖禁区。新增模块时应先判断代码是纯应用逻辑、技术 adapter 还是表现层，而不是创建新的通用 `manager` 目录。

## 公共类型所有权

跨包共享的运行时状态位于 `packages/types/src/battle`。`packages/content/src/content/battle-types` 主要是向内容实现重导出这些类型，使内容包不需要了解类型包内部路径。新的跨包契约应先放到 `@repo/types`，包内实现细节则留在所属包。

## 常用命令

```powershell
pnpm test
pnpm check-types
pnpm lint
pnpm build
```

目标包验证：

```powershell
pnpm --filter @repo/raid-logic test
pnpm --filter frontend test
pnpm --filter dedicated-server test
```

## 源码索引

- `pnpm-workspace.yaml`
- `turbo.json`
- 各 workspace 的 `package.json`
- `apps/frontend/src/battle/architecture.test.ts`
- `docs/adr/0001-shared-type-ownership.md`
