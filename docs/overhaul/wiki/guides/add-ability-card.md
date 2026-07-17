# 添加能力卡

## 1. 定义与注册

1. 在 `packages/types/src/core/ids.ts` 增加 `AbilityCardId`。
2. 在中英文 locale 增加名称和描述。
3. 新建 `packages/content/src/content/ability-cards/<id>.ts`。
4. 继承 `BattleAbilityCard`，提供 ID、cost、kind、use limit、cooldown、gallery。
5. 使用 `@Vanilla.registerCard("<id>")`。
6. 在 `ability-cards/index.ts` 增加 side-effect import。

## 2. 选择 Hook

只实现需要的最小 hook：

| 需求                  | Hook             |
| --------------------- | ---------------- |
| 初始生命/Bomb/guard   | `onInitialize`   |
| 改写受击结算          | `onHit`          |
| 擦弹收益或免疫        | `onGraze`        |
| 每次普通攻击追加效果  | `onAfterFire`    |
| 每帧维护被动/familiar | `onPostUpdate`   |
| 主动按键效果          | `onUse`          |
| 改变收点/擦弹范围     | radius getter    |
| 提供碰撞护盾          | `collectShields` |

故事模式与普通模式初始化不同才使用 `storyModeOverride`，不要在普通 hook 中隐式读取场景类型。

## 3. 主动卡

主动卡要明确：`useLimit`、`cooldownTicks`、重复按键行为、商店切换后的状态。使用次数与 cooldown 应由 fighter/ticker 管理，不要使用 `setTimeout`。

协作商店默认 rarity 由基类生成；需要禁用、rare 或 override effect 时，在 definition 设计中显式配置并补商店测试。

## 4. Familiar 与护盾

需要持续存在的召唤物应实现 `FamiliarMob`：

- state 包含完整行为所需字段；
- `kind` 唯一；
- 可由当前 spawner/manager snapshot factory 重建；
- 阵营和 projectile owner 使用卡牌 owner；
- 回收、死亡或换卡后的清理规则明确。

护盾通过 `collectShields` 每帧投影，碰撞规则由 raid-logic 处理，不在 Phaser 中判定。

## 5. 确定性与测试

- 随机只用 context random。
- 延迟行为使用 frame/ticker。
- 新状态进入 snapshot/hash。
- `onPostUpdate` 消费 aim 时声明 `consumesAimOnPostUpdate`。
- 增加卡牌单测和 `network/combat/rollback-consistency/ability-cards.test.ts` 用例。

运行：

```powershell
pnpm --filter @repo/raid-logic test
pnpm --filter frontend test
pnpm check-types
pnpm lint
```
