# 添加 Mob 与弹幕

## 添加 Mob

1. 在 `packages/content/src/content/mob-spawner/mobs` 或对应协作目录创建类。
2. 选择 `NeutralMob` 或 `FamiliarMob`，定义唯一 `kind` 和具体 state interface。
3. 实现 `move`、`fire`、`switchForm`、`die`、`onProjectileHit`、`onDeath`。
4. 使用 context 的 `spawnBullet` / `spawnLaser`，不要持有模型集合。
5. 把创建逻辑接入 spawner，并让 `createMobFromSnapshot` 能按 kind 恢复。
6. 为前端补 texture、动画、生命环或 Boss 表现映射。

Mob 的可变状态必须全部在 `state` 中；类实例的临时字段在 restore 后不会自动恢复。

## 添加 Spawner/波次

Spawner 需要稳定 ID 和完整状态：

- `step` 只依据 frame、上下文和自身 state；
- `snapshot` 返回 JSON 风格可序列化值；
- `restore` 不遗漏已生成成员、阶段和下一触发帧；
- `reset` 回到确定初态；
- `createMobFromSnapshot` 覆盖所有可能存活的 kind。

新增地图 spawner 时，在 mob-spawner registry/resolve 路径注册，并在 map definition 设置 `mobSpawnerId`。

## 添加普通弹

从内容 context 调用 `spawnBullet`，设置 owner、kind、位置、angle、speed rank、hit size 和 homing。按需求选择 retarget、follow、polar、clear/pierce 字段，避免同时开启互相冲突的运动模式。

若使用新 texture：

1. 加入资源；
2. 在 `bullet-assets.ts` 配置源矩形、hitbox/中心偏移；
3. 在 projectile view 检查 visual spec/frame；
4. 验证渲染尺寸和物理尺寸。

## 添加激光/线段

激光通过 `spawnLaser`，需要明确：

- 是否 pinned/anchored/ray-like；
- 逻辑 width/height 与 render height；
- visible/damage window；
- 长度/厚度增长；
- follow owner 与穿透/消弹规则。

瞬时近战或有限线段攻击优先使用 `spawnSegment`，不要用超高速普通弹模拟。

## 确定性检查

- 角度和运动使用 fixed-point helper。
- pattern 随机使用 context random。
- ID 由 context/manager 分配。
- 遍历顺序固定，不使用 wall clock。
- Mob、spawner、projectile 新字段进入 snapshot/hash。
- 延迟 aim 重定向正确标记 aim consumption。

## 测试

- Mob 出生、运动、开火、形态切换、死亡和掉落；
- spawner snapshot -> restore -> 后续波次一致；
- projectile hitbox、生命周期、clear/pierce；
- rollback consistency 和最终 hash；
- 前端 projectile/mob visual 不泄漏旧 ID 对象。
