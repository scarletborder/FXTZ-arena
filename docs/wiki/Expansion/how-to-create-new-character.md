# 如何开发新角色

新角色位于 `packages/content/src/content/characters`，并通过角色库注册后供图鉴、选择页面和战局逻辑读取。

## 基本步骤

1. 新建角色文件，例如 `example.ts`。
2. 继承 `BattleCharacter`。
3. 使用 `@Vanilla.RegisterCharacter("example")` 注册。
4. 定义基础字段：`id`、`name`、`cost`、`roleClass`、`moveSpeed`、`fireRate`、`ammoCapacity`、装填策略、`bulletSpeed`。
5. 实现 `shoot(ctx, fighter, aimX, aimY)`。
6. 实现 `useBomb(ctx, fighter)`。
7. 在角色 index 中引入该文件，确保装饰器执行。
8. 更新类型、测试和 wiki 数据页。

## 普通射击

普通射击只应通过 action context 生成弹幕，例如 `ctx.spawnBullet` 或 `ctx.spawnLaser`。不要直接操作全局数组，避免绕过延迟生成和 id 分配。

## Bomb

Bomb 通常会调用 `startBomb`，然后组合以下效果：

- 清弹：`clearProjectiles` 或 `ctx.clearProjectilesAround`。
- 无敌或锁定：修改 fighter 的计时器字段。
- 生成效果：`spawnClearRing`。
- 生成弹幕或激光。

## 帧同步注意事项

- 所有持续时间使用 `secondsToTicks` 或明确 tick 数。
- 角度、移动、几何计算尽量使用固定点工具。
- 不要在角色逻辑中读取渲染对象、声音状态、真实时间或随机数。
- 新角色至少补一条回滚稳定性测试：snapshot -> step -> hash -> restore -> step -> hash 相同。

