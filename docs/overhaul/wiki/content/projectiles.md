# 投射物

## 统一状态

当前 projectile 以 `ProjectileState` 表示，`kind` 为 `orb | knife | diamond | laser | spark`。视觉 kind、texture、物理宽高和 render 宽高是不同概念，不能互相代替。

主要字段组：

- 身份：`id`、owner、source character、texture；
- 运动：当前位置/上一位置、速度、angle；
- 尺寸：碰撞 width/height、render size、center offset；
- 生命周期：visible、expire、damage window、pause；
- 制导：homing、retarget、follow aim/owner、polar motion；
- 激光：anchor、增长、render mode/style、spawn/despawn ticks；
- 规则：damage、could clear、clears projectiles、pierces targets。

## 创建路径

内容代码调用 context 的 `spawnBullet`、`spawnLaser` 或角色扩展的 `spawnSegment`。`ProjectileSystem` 分配单调 ID 并调用：

- `createBulletProjectile`：普通弹、刀、菱形、spark；
- `createLaserProjectile`：移动/固定/锚定/射线型激光；
- segment 路径：用矩形/线段语义表达近战或瞬时攻击。

创建时使用 fixed-point 三角函数计算出生偏移和速度。

## 子弹运动

普通子弹支持：

- 固定速度直线；
- 有限持续时间的逐 tick 转向 homing；
- 指定帧重定向到目标、固定坐标或 owner aim；
- 跟随 owner/aim；
- 极坐标径向/角向运动；
- roll 与暂停时间线。

发生 retarget 后会清理不再适用的极坐标/重定向字段，避免同一 projectile 同时受两套运动模型控制。

## 激光

激光可移动、pinned、anchored 或 ray-like。`width` 表示沿射线方向的长度，`height` 表示碰撞厚度，`renderHeight` 可独立控制视觉厚度。锚定激光每 tick 根据 anchor、angle 和当前长度重算中心。

ray-like 激光可使用无限 width 表示几何射线，相关 hash/碰撞/渲染代码必须显式处理非有限值。

## 碰撞与裁判

每帧先处理 projectile clash，再由 `ProjectileSystem` 推进并请求 Rapier 碰撞结果。裁判层处理：目标可受击性、护盾、clear ring、擦弹、伤害、piercing 和 projectile 清除。投射物不自行直接扣 fighter 生命。

## 资源尺寸

`bullet-assets.ts` 保存源纹理矩形、hitbox 和中心偏移。`createBulletProjectile` 会根据请求 hit size 计算物理尺寸和渲染尺寸。新增弹图时若漏掉 metrics，可能出现视觉与碰撞不一致。

## 源码索引

- `packages/types/src/battle/runtime-state.ts`
- `packages/raid-logic/src/battle/model/projectile/`
- `packages/raid-logic/src/battle/model/referee.ts`
- `packages/content/src/content/characters/base.ts`
- `packages/content/src/content/bullet-assets.ts`
- `apps/frontend/src/battle/view/projectile/`
