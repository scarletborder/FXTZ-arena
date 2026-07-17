# 客户端战斗会话与视图

## BattleSession

`BattleSession` 是 Phaser 场景与 raid-logic 之间的应用层入口。它统一拥有：

- `RaidLogicRuntime`；
- 前端固定帧 `BattleFramePipeline`；
- `BattleNetworkSession`；
- `BattleRollbackHistory`。

Scene 向 session 注入输入、输出和生命周期 host。Session 初始化物理、推进固定帧、记录 runtime 输出、协调网络回滚，并提供当前输出、本地 fighter、确认帧和调试查询。

`getRuntime()` 和 `getRollbackHistory()` 仍为部分 Phaser rollback adapter 提供兼容访问；新代码应优先使用 session 的窄查询/命令方法，避免再次穿透会话所有权。

## 组合根

`BattleScene` 负责装配 input、session、network host、rollback/replay/debug adapter、view 与结果处理。它应只保留 Phaser 生命周期、输入采样、session update 和 view submit，不应重新实现帧循环或碰撞规则。

## 表现模型

`createBattleViewModel` 把 `BattleOutputState` 和场景上下文投影为稳定模型，包括：

- 本地/远端 fighter 选择；
- frame interpolation 和 rollback alpha；
- 准星危险/弹药/主动卡状态；
- Youmu 等表现派生状态；
- 协作 HUD、商店和转场子模型。

`BattleView.render` 只接收 `BattleViewModel`。Replay、spectator 和普通战斗都应走相同投影，避免各自解释领域状态。

## 视图模块

- `view/fighter.ts`：fighter sprite/status；
- `view/projectile`：projectile visual spec、frame 与生命周期；
- `view/mobs`：Mob sprite、生命环、Boss 指示、伤害标签；
- `view/crosshair`：准星和资源 marker；
- `view/effects.ts` / `points.ts` / `stage.ts`：其他战场对象；
- `sfx`：从输出变化与 flags 触发表现效果。

视图对象可以 tween、插值和播放声音，但不能写回 runtime state。

## 回滚表现

回滚恢复后 session 重新发布输出，Phaser adapter 负责同步音频/视觉临时状态。纯视觉缓存必须以稳定 ID 对齐，并删除输出中已不存在的对象；不能假设 frame 永远单调递增。

## 源码索引

- `apps/frontend/src/battle-scene.ts`
- `apps/frontend/src/battle/session/battle-session.ts`
- `apps/frontend/src/battle/view/model.ts`
- `apps/frontend/src/battle/view/index.ts`
- `apps/frontend/src/battle/adapters/phaser/`
- `apps/frontend/src/battle/architecture.test.ts`
