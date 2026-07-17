# 实体与状态模型

## 当前模型不是统一 Entity 树

生产战斗由 `BattleModel` 聚合多个状态集合和专用系统：

| 概念         | 运行时表示                                | 行为所有者                                          |
| ------------ | ----------------------------------------- | --------------------------------------------------- |
| Fighter      | 两个 `BattleFighter`，公开 `FighterState` | fighter、controller、character/card hooks           |
| Projectile   | `ProjectileState[]`                       | `ProjectileSystem`、bullet/laser functions、referee |
| Mob/Familiar | `Mob` 子类，内部持有 `MobState`           | `NeutralMobManager` + 内容类                        |
| Point/掉落物 | `PointState[]`                            | `PointManager`                                      |
| Effect       | `EffectState[]`                           | `EffectSystem`                                      |
| Clear ring   | `ClearRingState[]`                        | `ClearRingManager`                                  |
| Shield       | 从角色/能力卡即时收集的 `ShieldState[]`   | 内容 hook + 碰撞层                                  |

这是一种“状态数据 + 深模块系统 + 内容行为 hook”的混合模型。不要假设所有对象都有统一 `Entity.step/serialize/hash` 生命周期。

## Fighter

`BattleFighter` 持有主要/副角色实例、卡牌实例和 `FighterState`。状态包含位置、资源、弹药/装填、角色选择、卡牌次数与 cooldown、统计、角色特有扩展字段，以及无敌/动作锁/弹幕暂停等通用扩展字段。

角色与能力卡不是独立放进世界集合的实体。它们是挂在 fighter 上的行为对象，通过上下文修改 fighter 或请求生成 projectile、effect、clear ring、mob。

## Projectile

投射物是纯状态记录，按 `kind` 和字段组合支持子弹、刀、菱形、激光和 spark。创建、移动、碰撞、擦弹、清除和销毁由 `ProjectileSystem` 统一编排。表现层根据同一状态的 texture/尺寸/laser 字段选择视觉实现。

## Mob 与 Familiar

`Mob` 是当前模型中明确的多态实体基类。`NeutralMob` 的 owner 是 `Neutral`，`FamiliarMob` 归 Player1/Player2。两者都进入 `neutralMobs` 输出集合和 `NeutralMobManager`，但阵营、受击目标和内容用途不同。

Mob 每帧按 `move -> fire -> switchForm -> die` 调用，状态通过 `snapshot/restore` 保存。Spawner 负责何时创建 Mob 以及自身波次游标的快照。

## 遗留兼容 Entity API

`packages/raid-logic/src/entities.ts` 还定义 `FighterEntity`、`ProjectileEntity`、`AbilityCardEntity`；`sync/state.ts` 和 `game.ts` 组成 `RaidState/RaidBattle` 路径。这些类型仍公开、仍测试，但不被当前前端 `BattleSession` 使用。

因此：

- 修改当前角色、卡牌、投射物或 Mob，请改 `battle/model` 与 `packages/content`；
- 只有明确维护兼容 API 或相关测试时，才改 `entities.ts`/`sync/state.ts`；
- 不要按旧 Wiki 的“继承一个通用 Entity 即接入当前战局”来新增内容。

## ID 与集合顺序

模型为 projectile、effect、mob、point、clear ring 分别维护 next ID，并将其写入快照。新实体类型必须提供确定性 ID 分配、稳定遍历/哈希顺序和完整恢复策略。

## 源码索引

- `packages/raid-logic/src/battle/model/index.ts`
- `packages/raid-logic/src/battle/model/battle-fighter.ts`
- `packages/types/src/battle/runtime-state.ts`
- `packages/types/src/battle/neutral-mob.ts`
- `packages/raid-logic/src/entities.ts`
- `packages/raid-logic/src/sync/state.ts`
