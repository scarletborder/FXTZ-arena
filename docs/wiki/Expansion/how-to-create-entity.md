# 如何创建战局 Entity

战局实体需要优先服从确定性、snapshot 和回滚要求。不要只考虑实时运行下是否看起来正确。

## Bullet

普通弹通过 `ctx.spawnBullet` 创建，常见字段包括：

- `owner`：`Player1`、`Player2` 或 `Neutral`。
- `kind`：例如 `orb`、`knife`。
- `x`、`y`、`angle`、`speedRank`。
- `width`、`height`、`damage`。
- `homingTicks`、`spawnOffset`、`pausedUntil` 等可选行为字段。

普通弹命中后通常会被移除。

## Laser

激光通过 `ctx.spawnLaser` 创建，常见字段包括：

- `kind`：默认 `laser`，也可为 `spark`。
- `initialLength`、`maxLength`、`lengthGrowthPerTick`。
- `height`、`damage`、`expireTicks`。
- `pinned`、`anchored`、`rayLike`、`visibleFrom`、`pausedUntil`。

激光和 spark 可以持续存在，并按 tick 造成伤害。

## Character

角色继承 `BattleCharacter`，通过 `@Vanilla.RegisterCharacter("id")` 注册。必须定义 id、名称、cost、职业、移动/射击/装填数据、普通攻击和 bomb。

## Mob

中立怪物需要：

- 可序列化 state。
- `step(ctx)` 行为。
- `restore(snapshot)` 状态恢复。
- `onProjectileHit`、`onDeath`、`onDeathEffect` 等事件。
- mob spawner 能从 snapshot 重新创建对应 mob。

## 回滚注意事项

- 生成实体不要手写非稳定 id；使用系统分配的 next id。
- 所有影响未来的隐藏字段都要 snapshot。
- 遍历实体时保持稳定顺序。
- 避免 `Math.random()`、真实时间和依赖渲染帧率的逻辑。

