# Fixed-point、数学计算和移动处理

战局逻辑必须保持跨平台确定性。FXTZ-arena 的核心规则是：会影响战局结果的数学计算尽量使用 fixed-point 工具完成，只在输入/输出边界保留普通 `number`。

## 基本原则

- 战局逻辑以固定 tick 推进，不能依赖真实时间、渲染帧率或系统时钟。
- 位置、距离、角度偏移、归一化、碰撞判断等核心计算优先使用 `@shaisrc/fixed-point` 的 `fp.*`。
- `Math.random()` 禁止出现在战局逻辑中；需要随机性时，应使用可 snapshot 的确定性种子。
- `Math.sin`、`Math.cos`、`Math.sqrt`、`Math.hypot`、`Math.atan2` 不要直接用于会影响结果的逻辑，使用项目封装。
- 渲染层、UI 层、纯视觉 sfx 可以使用普通浮点数，但不能反向影响 `raid-logic`。

## 常用工具

基础 fixed-point API：

| 用途 | API |
| --- | --- |
| number -> fp | `fp.fromFloat(n)` |
| int -> fp | `fp.fromInt(n)` |
| fp -> number | `fp.toFloat(v)` |
| 加减乘除 | `fp.add` / `fp.sub` / `fp.mul` / `fp.div` |
| 三角函数 | `fp.sin` / `fp.cos` |
| 比较 | `fp.gt` / `fp.gte` / `fp.lt` / `fp.lte` / `fp.eq` |
| 绝对值/取反 | `fp.abs` / `fp.negate` |

项目封装工具位于 `packages/content/src/content/fp.ts`：

| 用途 | API | 返回 |
| --- | --- | --- |
| 确定性 atan2 | `fpAtan2(y, x)` | 普通 `number` 角度 |
| 距离，返回 number | `fpHypot(a, b)` | 普通 `number` |
| 距离，继续参与 fp 链式计算 | `fpHypotFp(a, b)` | fp |
| 限制范围 | `fpClamp(v, lo, hi)` | fp |
| 最小/最大 | `fpMin(a, b)` / `fpMax(a, b)` | fp |

## 浮点数边界

当前状态结构里很多字段仍以普通 `number` 存储，例如 fighter 的 `x`、`y`、`facing`。这不代表可以在逻辑里随意用原生浮点计算。

推荐模式：

1. 读取状态中的 `number`。
2. 用 `fp.fromFloat` 转入 fixed-point。
3. 在 fp 域完成计算。
4. 用 `fp.toFloat` 写回状态或传给 spawn 参数。

```ts
const fpDx = fp.fromFloat(target.x - self.x);
const fpDy = fp.fromFloat(target.y - self.y);
const angle = fpAtan2(fpDy, fpDx);
```

不要把 `fpAtan2` 的结果再传给 `fp.toFloat`。`fpAtan2` 已经返回普通弧度值，适合直接写入 `angle` 或 `facing`。

## 移动处理

角色移动在 `BattleFighter.moveBy` 中处理。当前流程是：

1. 如果 `movementLockedUntil > 0`，本帧不能移动。
2. 通过 `speedRankToPixelsPerTick` 取得每 tick 速度。
3. 用输入方向 `moveX` / `moveY` 乘以速度。
4. 将结果加到当前位置。
5. 使用 `fpClamp` 限制在战场边界内。

简化后的模式如下：

```ts
const speed = speedRankToPixelsPerTick(state.moveSpeedOverride ?? activeCharacter.moveSpeed);
state.x = fp.toFloat(fpClamp(
  fp.add(fp.fromFloat(state.x), fp.mul(fp.fromFloat(input.moveX), fp.fromFloat(speed))),
  fp.fromFloat(PLAYER_CORE_RADIUS),
  fp.fromFloat(ARENA_WIDTH - PLAYER_CORE_RADIUS),
));
```

新增移动效果时应接入同一套规则：

- 加速、减速、禁足、击退等都应表现为状态字段或 tick 计时器。
- 不要在不同系统中重复移动同一个实体，除非明确规定顺序。
- 边界限制必须在逻辑层完成，不能只依赖渲染层挡住画面。
- 如果移动方向需要归一化，使用 `fpHypotFp` 计算长度，避免原生 `Math.hypot`。

## 距离和归一化

距离判断推荐使用 fp 链：

```ts
const fpDx = fp.fromFloat(target.x - self.x);
const fpDy = fp.fromFloat(target.y - self.y);
const fpDist = fpHypotFp(fpDx, fpDy);

if (fp.lte(fpDist, fp.fromFloat(radius))) {
  // in range
}
```

归一化向量时，长度至少夹到 1，避免除以 0：

```ts
const fpLen = fpMax(fp.fromInt(1), fpHypotFp(fpDx, fpDy));
const fpNormX = fp.div(fpDx, fpLen);
const fpNormY = fp.div(fpDy, fpLen);
```

## 角度和三角函数

角度通常以普通弧度 `number` 存在于状态或 spawn 参数中，但角度计算过程应走 fixed-point：

```ts
const angle = fpAtan2(
  fp.fromFloat(aimY - fighter.y),
  fp.fromFloat(aimX - fighter.x),
);
```

如果需要做角度偏移，先转入 fp：

```ts
const fpAngle = fp.fromFloat(angle);
const fpOffset = fp.fromFloat(Math.PI / 4);
const leftAngle = fp.toFloat(fp.sub(fpAngle, fpOffset));
```

`Math.PI` 作为常量边界可以使用，但参与计算前应转为 `fp.fromFloat(Math.PI)`。

## 常见问题

- `fp.mul(a, b)` 对很大的 fp 数平方可能溢出。计算大范围距离时使用 `fpHypotFp`，它内部使用 BigInt 规避平方溢出。
- `fpAtan2(y, x)` 的入参必须是 fp 值，返回值是普通 `number`。
- `fpClamp`、`fpMin`、`fpMax` 的入参必须是 fp 值。
- `ammoDisplay` 这类展示型数值可以是小数，但如果它会进入 hash 或影响后续逻辑，也要保持确定性计算来源。

## 新增逻辑检查清单

- 这段计算是否会影响命中、移动、弹幕生成、伤害、胜负或后续输入解释？
- 是否使用了原生 `Math.*`、真实时间、随机数或渲染状态？
- 是否把 fp 值和普通 `number` 混用了？
- 是否有除以 0、距离平方溢出、数组遍历顺序不稳定的风险？
- 回滚后重放是否能得到完全相同的位置、角度、id 和 hash？

如果有疑问，把逻辑放进 `raid-logic` 的 replay/hash 测试里验证。

