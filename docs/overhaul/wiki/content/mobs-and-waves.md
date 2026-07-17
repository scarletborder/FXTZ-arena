# Mob 与波次

## Mob 分类

`MobState` 同时覆盖 neutral mob 和 familiar：

- `NeutralMob`：`key: "Neutral"`，可为 minion、elite、boss；
- `FamiliarMob`：归属 Player1/Player2，由角色或能力卡创建。

状态包含位置、hit shape、wave/form、生命、掉落、伤害反馈、物理攻击、roll、SFX flags 和可选 spell-card 阶段。

## 生命周期

`Mob.step(ctx)` 的固定顺序是：

```text
capture previous position
-> ageTicks + 1
-> move
-> fire
-> switchForm
-> die
-> clear one-frame SFX flags
```

受 projectile 命中走 `onProjectileHit`，死亡来源通过 `onDeath(source)` 记录，表现性死亡效果可放在 `onDeathEffect`。`active = false` 后由 manager 在适当阶段移出集合和物理世界。

## NeutralMobManager

Manager 负责：

- 调用 spawner；
- 分配确定性 mob ID；
- step 当前 Mob；
- 将 fighter/敌方 mob 投影成 target context；
- 同步物理状态；
- 快照/恢复 Mob 与 spawner；
- 移除 inactive Mob。

Spawner 必须能通过 `createMobFromSnapshot` 按 `kind` 重建对应类，否则回滚只能恢复数据，无法恢复后续行为。

## Spawner

`NeutralMobSpawner` 必须实现 `step`、`snapshot`、`restore`、`reset` 和 snapshot factory。普通模式默认使用 `default-a`，训练模式默认不生成，地图可通过 `mobSpawnerId` 指定生成器。

Spawner 自身状态必须是可序列化的 `NeutralMobSpawnerState`，例如波次索引、阶段、wave start frame、下一波允许帧、已生成成员 key。

## 协作波次

协作模式的 wave spawner 按节点编排普通波、精英、Boss 与商店转场。`CollaborateExtraState` 向 UI 暴露当前 run state、波次、Boss spell、商店和双方 ready 状态。

Boss 可包含 non-spell 与多个 spell-card 阶段。spell state 保存阶段、索引、剩余符卡、当前/最大生命和剩余 ticks；转换必须由确定性帧与状态驱动。

## 掉落与计分

Mob 可配置 point、money、power 掉落及多组 drop。`BattleModel` 在死亡结算时创建 collectible，并按协作常量累计分数/货币。新增掉落种类要同时考虑输出、物理收集、快照、UI 和 hash。

## 表现边界

逻辑状态只存 `textureKey`、display/i18n 信息、SFX flags 和运动状态。Phaser sprite、生命环、伤害数字、Boss 方位提示与动画位于 `battle/view/mobs`，不能反向影响 Mob 行为。

## 源码索引

- `packages/types/src/battle/neutral-mob.ts`
- `packages/content/src/content/mob-spawner/base.ts`
- `packages/content/src/content/mob-spawner/collaborate/`
- `packages/raid-logic/src/battle/model/manager/neutral-mob-manager.ts`
- `apps/frontend/src/battle/view/mobs/`
