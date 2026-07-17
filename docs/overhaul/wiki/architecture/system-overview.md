# 系统总览

## 系统边界

FXTZ Arena 是 pnpm/Turborepo monorepo。浏览器或桌面客户端采集输入并呈现战斗，`@repo/raid-logic` 在固定 tick 上执行确定性模拟，专用服务器组织房间并转发协议消息。

```text
                     +----------------------+
                     | dedicated-server     |
                     | room / relay / verdict|
                     +----------+-----------+
                                | typed protocol
                                v
+-------------+   input   +-----+------------------+
| Phaser UI   +---------->+ frontend BattleSession|
| and views   |<----------+ CombatSyncManager     |
+-------------+  view VM  +----------+------------+
                                      |
                                      | runtime API
                                      v
                           +----------+------------+
                           | @repo/raid-logic      |
                           | BattleModel + Rapier  |
                           +----------+------------+
                                      |
                                      | definitions/hooks
                                      v
                           +----------+------------+
                           | @repo/content         |
                           +-----------------------+
```

## 主要职责

| 模块                    | 职责                                               | 不应承担                       |
| ----------------------- | -------------------------------------------------- | ------------------------------ |
| `packages/types`        | 跨包 ID、配置、输入、输出、快照、协议类型          | 具体战斗行为                   |
| `packages/constants`    | 跨包常量、尺寸、tick 和同步配置                    | 可变状态                       |
| `packages/content`      | 角色、能力卡、地图、Mob、波次的定义和行为 hook     | 物理世界、网络传输             |
| `packages/raid-logic`   | 战斗状态推进、碰撞、裁判、快照和哈希               | Phaser、浏览器 API、服务器房间 |
| `apps/frontend`         | 输入、战斗会话、回滚编排、网络 adapter、渲染、菜单 | 重复实现领域规则               |
| `apps/dedicated-server` | 会话、房间、匹配、消息校验/转发、结束裁决          | 权威逐帧战斗模拟               |
| `apps/desktop`          | Tauri 容器和桌面 WebTransport/文件能力             | 战斗规则                       |

## 数据流

每个战斗 tick 的输入是 `BattleInputState`。逻辑运行时产生 `BattleOutputFrame`，其中同时包含：

- `state`：供表现层读取的 `BattleOutputState`；
- `snapshot`：可恢复的 `BattleModelSnapshot`；
- `hash` / `hashHex`：当前确定性状态摘要；
- `events`：当前只有帧推进和快照恢复事件。

前端不会直接让 Phaser 对象成为战斗真相。`BattleViewModel` 从输出状态投影本地角色、插值参数、准星状态及协作模式 UI 数据，然后交给视图更新 Phaser 对象。

## 对战模式

- `training`：单人输入，通常无中立怪生成器。
- `ai`：本地输入加 `CpuPlayer` 产生的目标输入。
- `online`：显式提供 Player1/Player2 两份输入；本地双端联机也复用此模式。
- `battleMode: versus`：双方互为敌人。
- `battleMode: collaborate`：双方合作处理波次、精英、Boss、转场和商店。

`RaidLogicMode` 决定输入来源，`BattleRoomMode` 决定规则分支，两者不是同一个概念。

## 源码索引

- `packages/raid-logic/src/battle/runtime.ts`
- `packages/raid-logic/src/battle/model/index.ts`
- `apps/frontend/src/battle/session/battle-session.ts`
- `apps/frontend/src/battle/view/model.ts`
- `apps/dedicated-server/src/protocol/handler.ts`
- `packages/types/src/battle/runtime-state.ts`
