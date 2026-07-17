# 能力卡

## 分类与挂载

能力卡继承 `BattleAbilityCard`，分 `active` 与 `passive`。fighter 保存 loadout 中所有卡牌和一个当前主动卡，状态包括使用次数、主动 cooldown、部分卡牌专用 guard/cooldown 字段。

主动卡通过 `onUse` 执行；被动卡主要使用初始化、受击、擦弹、开火后、每帧更新、护盾收集等 hook。卡牌行为不是独立世界 Entity。

## 当前卡牌

| ID                   | 类型    | 主要 hook/形态     |
| -------------------- | ------- | ------------------ |
| `extra_life`         | passive | 初始化生命修正     |
| `ember`              | passive | 受击/资源相关修正  |
| `backdoor`           | passive | 防御 familiar      |
| `ufo_helper`         | passive | 防御 familiar/护盾 |
| `multi_shot`         | passive | 开火后追加弹幕     |
| `hakkero`            | active  | 主动光束           |
| `spirit_strike_card` | active  | 消弹/环效果        |
| `invisibility_cloth` | active  | 无敌相关状态       |
| `extension`          | passive | 资源修正           |
| `graze_lover`        | passive | 擦弹半径/收益      |
| `danmaku_ghost`      | passive | 弹幕行为修正       |
| `sakura_charm`       | passive | 受击防护           |
| `whitecat`           | active  | familiar/阶段行为  |
| `tanuki_helper`      | passive | 点数收集范围       |
| `doll`               | active  | 可回收 familiar    |

表格只说明系统形态，精确效果与数值以对应实现和 i18n 描述为准。

## Hook 顺序和上下文

常用 hook：

- `onInitialize`：创建/reset fighter 时应用初始状态；故事模式可通过 `storyModeOverride` 改写。
- `onHit`：裁判解析受击时参与 `HitResolution`。
- `onGraze`：擦弹事件，可决定是否消费特定行为。
- `onAfterFire`：角色完成普通攻击后追加效果。
- `onPostUpdate`：每帧动作后维护被动状态。
- `onUse`：主动卡按键通过使用次数与 cooldown 检查后调用。
- `collectShields`：投影当前碰撞护盾。

卡牌通过 `BattleCardContext` 请求生成 projectile/effect/mob 等，不能直接操作 raid-logic 的集合。

## 使用次数与冷却

Definition 提供 `useLimit` 和 `cooldownTicks`。`ActiveCardCooldownManager` 与 ticker 同步主动卡冷却；商店可切换主动卡。新增 cooldown 状态时必须可快照，并在回滚恢复后得到相同的可用帧。

## Familiar 卡牌

Backdoor、UFO helper、Whitecat、Doll 等会创建 `FamiliarMob`。卡牌负责确保/创建 familiar，Mob 类负责跨帧 move/fire/form/death。不要把 familiar 状态只保存在卡牌实例字段中。

## 源码索引

- `packages/content/src/content/ability-cards/base.ts`
- `packages/content/src/content/ability-cards/index.ts`
- `packages/content/src/content/ability-cards/card-library.ts`
- `packages/raid-logic/src/battle/model/manager/active-card-cooldown-manager.ts`
- `packages/raid-logic/src/battle/model/referee.ts`
