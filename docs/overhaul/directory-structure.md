# 目标目录结构

目录结构以“修改原因相同的代码放在一起”为原则。领域能力优先于技术名称；只有 adapter 目录按 Phaser 等具体技术命名。

```text
apps/frontend/src/
├─ battle/
│  ├─ session/                 # 无 Phaser 的战斗应用层模块
│  │  ├─ battle-session.ts     # 运行时、帧管线与同步会话的统一入口
│  │  ├─ frame-pipeline.ts     # 固定战斗帧推进
│  │  ├─ network-session.ts    # 同步会话与网络状态编排
│  │  └─ rollback-history.ts   # 回滚快照与确定性调试哈希历史
│  ├─ adapters/
│  │  └─ phaser/               # Phaser 生命周期、输入、文本、计时 adapter
│  │     ├─ network-host.ts
│  │     └─ rollback-adapter.ts
│  ├─ input-controller/        # 输入设备采样与按键映射
│  ├─ view/                    # Phaser 战斗渲染
│  │  ├─ model.ts              # 无 Phaser 的领域输出到视图模型投影
│  │  └─ layout.ts             # 战斗画布与 arena 布局计算
│  ├─ sfx/                     # 战斗表现效果与声音触发
│  └─ loadout.ts               # 战斗入口数据；后续收敛为 session 配置
├─ network/
│  ├─ combat/                  # 战斗同步协议、队列与连接接口
│  ├─ transport/               # WebSocket/WebTransport adapter
│  ├─ local-lan/               # 局域网发现与信令
│  └─ client.ts                # 全局服务器连接；后续拆分生命周期与状态
├─ menu/                       # Phaser 菜单场景与菜单 UI
├─ replay/                     # 回放存储、校验与播放 adapter
└─ store/                      # 配置和档案持久化
```

## 放置规则

1. 能在 Node 测试中运行且不需要 Phaser mock 的战斗编排代码放入 `battle/session`。
2. 导入 `phaser` 且实现 session 接口的代码放入 `battle/adapters/phaser`。
3. 只绘制或更新 Phaser 对象的代码放入 `battle/view`；不得发送网络消息或推进运行时。
4. 战斗协议、输入队列和连接接口放入 `network/combat`；具体传输放入 `network/transport`。
5. 旧 `battle/manager` 已完成迁移；不得重新创建通用 manager 目录或兼容转发文件。
6. 测试与被测模块同目录，验证公开接口；跨模块端到端测试保留在功能入口附近。

## 迁移顺序

| 来源                                 | 目标                                                                           | 条件                        |
| ------------------------------------ | ------------------------------------------------------------------------------ | --------------------------- |
| `battle/manager/network-manager.ts`  | `battle/session/network-session.ts` + `battle/adapters/phaser/network-host.ts` | 已完成                      |
| `battle/runtime-adapter.ts`          | `battle/session/battle-session.ts`                                             | 已完成并删除中间 adapter    |
| `battle/manager/rollback-manager.ts` | `battle/session/rollback-history.ts` + `battle/adapters/phaser/rollback-adapter.ts` | 已完成                  |
| `battle/manager/replay-manager.ts`   | `battle/adapters/phaser/replay-controller.ts`                                  | 已完成                      |
| `battle/manager/debug-manager.ts`    | `battle/adapters/phaser/debug-controller.ts`                                   | 已完成                      |
| `battle/manager/layout-manager.ts`   | `battle/view/layout.ts`                                                        | 已完成                      |
| `battle/view/controller/*`           | `battle/adapters/phaser/*` 或 `battle/view/*`                                  | 按是否只负责渲染判断        |

旧 `battle/manager` 已清空；后续文件按 session、Phaser adapter、view 和输入等实际职责放置。每次移动必须伴随接口收敛、调用者迁移、旧文件删除和测试，避免只改变路径而不改善耦合。
