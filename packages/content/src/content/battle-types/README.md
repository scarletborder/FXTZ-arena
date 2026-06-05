# FighterState 扩展指南

`FighterState` 被拆成多个小接口后，新增状态时应先判断它属于哪一类，再放到对应接口中。这样可以避免所有字段继续堆在一个大接口里。

## 分类

`FighterState.ts` 中的主要分组如下：

- `FighterMetaState`：元信息，例如 `key`。
- `FighterPositionState`：方位信息，例如 `x`、`y`、`facing`、`previousX`。
- `FighterResourceState`：资源属性，例如 `lives`、`bombs`、`pointCount`。
- `FighterAmmoState`：弹药和装填属性，例如 `ammo`、`ammoDisplay`、`ammoCapacity`、`reloadRemaining`。
- `FighterCharacterState`：角色选择属性，例如 `primaryCharacter`、`activeCharacter`。
- `FighterAbilityCardState`：能力卡属性，例如 `activeCard`、`abilityCards`、`activeCardCooldownUntil`。
- `FighterStatsState`：统计信息，例如 `shotsFired`、`hits`、`bombUses`。
- `*ExtraFighterState`：角色专属状态，例如 `YoumuExtraFighterState`。
- `FighterExtensionState`：不能归入上述分类的扩展状态，例如锁定、无敌、显示、擦弹记录等。

## 新增通用状态

如果字段对所有角色或战斗系统都有通用意义：

1. 在 `FighterState.ts` 中找到最合适的分组接口。
2. 将字段加入该接口。
3. 在 `packages/raid-logic/src/battle/model/fighter.ts` 的 `createFighter` 中添加默认值。
4. 如果该字段会随时间变化，在 `tickFighterTimers` 或对应战斗逻辑中维护它。
5. 如果该字段会影响回放、同步或确定性校验，检查并更新：
   - `packages/raid-logic/src/battle/model/hash.ts`
   - `packages/raid-logic/src/battle/model/snapshot.ts`
6. 增加或更新相关测试。

## 新增角色专属状态

每个角色都应有自己的 extra interface，即使当前还没有专属字段，也可以保留为空接口作为扩展点。

例如新增妖梦状态：

```ts
export interface YoumuExtraFighterState {
  youmuBombDashDelayRemaining: number;
  youmuBombDashStartX: number | undefined;
  youmuBombDashStartY: number | undefined;
  youmuBombDashAimX: number | undefined;
  youmuBombDashAimY: number | undefined;
}
```

新增角色专属字段时：

1. 将字段加入对应的 `CharacterNameExtraFighterState`。
2. 如果是新角色，先创建 `CharacterNameExtraFighterState`，再让 `FighterExtraState` 继承它。
3. 字段名应带角色前缀，例如 `youmuBombDashDelayRemaining`，避免不同角色字段语义冲突。
4. 在 `createFighter` 中添加默认值。
5. 在角色实现文件中读写这些字段，例如 `characters/youmu.ts`。
6. 如果字段需要存档、回放、同步或哈希校验，更新 `snapshot.ts` 和 `hash.ts`。
7. 为该角色补测试，尤其是技能结束、角色切换、快照恢复后的状态。

## 字段放置建议

优先选择最具体的分类：

- 和生命、炸弹、点数有关，放 `FighterResourceState`。
- 和弹药、换弹、角色弹药缓存有关，放 `FighterAmmoState`。
- 和主动/备用角色有关，放 `FighterCharacterState`。
- 和能力卡使用次数、冷却有关，放 `FighterAbilityCardState`。
- 只服务某个角色技能，放该角色的 `*ExtraFighterState`。
- 仍然无法归类，再放 `FighterExtensionState`。

不要为了方便把角色专属字段放进 `FighterExtensionState`。角色越多，这会让通用状态再次膨胀。

## 提交前检查

至少运行：

```bash
pnpm --filter @repo/content check-types
```

如果改动影响战斗逻辑，也运行：

```bash
pnpm --filter @repo/raid-logic check-types
```
