# 角色

## 角色契约

每个角色继承 `BattleCharacter`，必须提供 definition 字段和三个核心行为：

- `shoot(ctx, fighter, aimX, aimY)`：普通攻击；
- `useBomb(...)`：Bomb/符卡；
- `onHit(ctx)`：该角色作为当前角色受击时的处理 hook。

可选 hook 包括 `onAfterFire` 和 `onPostUpdate`。如果 `onPostUpdate` 会读取 aim 并影响状态，应把 `consumesAimOnPostUpdate` 设为 `true`。

## 当前角色

`CharacterId` 当前包含：

| ID        | 角色         | 实现文件                |
| --------- | ------------ | ----------------------- |
| `reimu`   | 博丽灵梦     | `characters/reimu.ts`   |
| `marisa`  | 雾雨魔理沙   | `characters/marisa.ts`  |
| `sakuya`  | 十六夜咲夜   | `characters/sakuya.ts`  |
| `cirno`   | 琪露诺       | `characters/cirno.ts`   |
| `youmu`   | 魂魄妖梦     | `characters/youmu.ts`   |
| `ellen`   | 爱莲         | `characters/ellen.ts`   |
| `kaguya`  | 蓬莱山辉夜   | `characters/kaguya.ts`  |
| `reisen`  | 铃仙         | `characters/reisen.ts`  |
| `yuyuko`  | 西行寺幽幽子 | `characters/yuyuko.ts`  |
| `yukari`  | 八云紫       | `characters/yukari.ts`  |
| `flandre` | 芙兰朵露     | `characters/flandre.ts` |
| `iku`     | 永江衣玖     | `characters/iku.ts`     |

具体 cost、role、弹药、装填和技能数值以对应文件为准。

## Definition 字段

`CharacterDefinition` 包含 ID、i18n name、cost、`roleClass`、移动/射速/弹速等级、弹容量、每发装填 ticks、装填开始/提交策略、描述、攻击/Bomb ID 和 gallery 资源。

装填有两个正交策略：

- `reloadStartPolicy`：开始装填时清零还是保留当前弹药；
- `reloadCommitPolicy`：全部完成后提交，还是每完成一发就提交。

角色切换、动作打断和 UI 弹药显示必须尊重这两个策略。

## Fighter 上的角色状态

一名 fighter 同时持有 primary、alternate 与 active character。`FighterState` 保存每角色弹药映射、当前装填所属角色，以及部分角色专用扩展字段。新增需要跨帧延续的角色机制时，应优先设计可快照的明确状态，而不是把可变字段藏在角色实例中。

角色可以生成 familiar；familiar 进入 Mob 系统并必须完整 snapshot。例如 Iku、Kaguya、Yukari 等内容会维护自己的 familiar 状态或行为。

## 点数与 Bomb

基类默认允许用 Bomb 资源或达到阈值的 point 触发 Bomb；默认阈值/消耗由基类常量管理。`pointPowerTier` 将 point 分成四档，多个角色据此调整弹量或伤害。个别角色可覆盖相关行为，但必须保持确定性。

## 源码索引

- `packages/content/src/content/characters/base.ts`
- `packages/content/src/content/characters/index.ts`
- `packages/content/src/content/characters/character-library.ts`
- `packages/types/src/core/definitions.ts`
- `packages/raid-logic/src/battle/model/battle-fighter.ts`
- `packages/raid-logic/src/battle/model/controller.ts`
