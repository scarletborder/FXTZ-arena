# 定点数使用指南

raid-logic 包使用 `@shaisrc/fixed-point`（Q16.16 格式）进行所有逻辑运算，保证跨平台确定性。

## 核心原则

```
逻辑层全程使用定点数 → 仅在渲染（View 层）转回普通 number
```

```typescript
// ❌ 禁止：原生浮点运算
const dx = target.x - fighter.x;
const dist = Math.sqrt(dx * dx + dy * dy);

// ✅ 正确：fp 链式运算
const fpDx = fp.sub(fp.fromFloat(target.x), fp.fromFloat(fighter.x));
const fpDy = fp.sub(fp.fromFloat(target.y), fp.fromFloat(fighter.y));
const fpDist = fpHypotFp(fpDx, fpDy);
```

## 导入方式

```typescript
import { fp } from "@shaisrc/fixed-point";                 // 基础运算
import { fpAtan2, fpHypot, fpHypotFp, fpClamp, fpMin, fpMax } from "../../fp";  // 扩展运算
```

## 基础运算 API

| 函数 | 说明 | fp 参数 | 返回 |
|------|------|---------|------|
| `fp.fromFloat(n)` | number → Q16.16 | float | fp |
| `fp.fromInt(n)` | int → Q16.16 | int | fp |
| `fp.fromString(s)` | decimal string → Q16.16 | string | fp |
| `fp.toFloat(v)` | Q16.16 → number | fp | float |
| `fp.add(a, b)` | 加法 | fp, fp | fp |
| `fp.sub(a, b)` | 减法 | fp, fp | fp |
| `fp.mul(a, b)` | 乘法 | fp, fp | fp |
| `fp.div(a, b)` | 除法 | fp, fp | fp |
| `fp.cos(a)` | 余弦 | fp(rad) | fp |
| `fp.sin(a)` | 正弦 | fp(rad) | fp |
| `fp.sqrt(a)` | 平方根 | fp | fp |
| `fp.abs(a)` | 绝对值 | fp | fp |
| `fp.negate(a)` | 取反 | fp | fp |
| `fp.gt(a, b)` | > 比较 | fp, fp | boolean |
| `fp.lt(a, b)` | < 比较 | fp, fp | boolean |
| `fp.eq(a, b)` | === 比较 | fp, fp | boolean |
| `fp.gte(a, b)` | >= 比较 | fp, fp | boolean |
| `fp.lte(a, b)` | <= 比较 | fp, fp | boolean |

**重要**：`fp.mul(a, b)` 内部使用 32 位截断。平方值 > 2^31 时溢出，应改用 `fpHypotFp` 或手动 BigInt。

## 扩展运算 API（fp.ts 内）

| 函数 | 说明 | 参数 | 返回 |
|------|------|------|------|
| `fpAtan2(y, x)` | atan2 | fp, fp | **float** |
| `fpHypot(a, b)` | sqrt(a²+b²) | fp, fp | **float** |
| `fpHypotFp(a, b)` | sqrt(a²+b²) | fp, fp | **fp** |
| `fpClamp(v, lo, hi)` | 钳制 | fp, fp, fp | fp |
| `fpMin(a, b)` | 最小值 | fp, fp | fp |
| `fpMax(a, b)` | 最大值 | fp, fp | fp |

`fpAtan2` 和 `fpHypot` 返回普通 float，不可链入 fp 运算。
`fpHypotFp` 返回 fp 值，可链入 `fpMax`、`fp.gt` 等。

## 常见陷阱

### 1. fpAtan2 参数必须是 fp 值

```typescript
// ❌ 错误：传入普通 number
fpAtan2(ctx.opponent.y - fighter.y, ctx.opponent.x - fighter.x);

// ✅ 正确：用 fp.fromFloat 包装
fpAtan2(fp.fromFloat(ctx.opponent.y - fighter.y), fp.fromFloat(ctx.opponent.x - fighter.x));
```

### 2. fpMax/fpMin/fpClamp 参数必须是 fp 值

```typescript
// ❌ 错误：fpHypot 返回 float
fpMax(fp.fromInt(1), fpHypot(fpDx, fpDy));

// ✅ 正确：使用 fpHypotFp 返回 fp 值
fpMax(fp.fromInt(1), fpHypotFp(fpDx, fpDy));
```

### 3. 大数乘法溢出

```typescript
// ❌ 错误：坐标差值平方 > 2^31 时溢出
fp.sqrt(fp.add(fp.mul(fpDx, fpDx), fp.mul(fpDy, fpDy)));

// ✅ 正确：fpHypotFp 内部使用 BigInt
fpHypotFp(fpDx, fpDy);
```

### 4. fpAtan2 返回值已是 float，不要套 fp.toFloat

```typescript
// ❌ 错误：fpAtan2 内部已调用 fp.toFloat，外层再套会把正确弧度值当作 Q16.16 编码
const angle = fp.toFloat(fpAtan2(fp.fromFloat(vy), fp.fromFloat(vx)));

// ✅ 正确：fpAtan2 直接返回 float
const angle = fpAtan2(fp.fromFloat(vy), fp.fromFloat(vx));
```

**原因**：`fpAtan2` 的每个 return 路径都调用了 `fp.toFloat`（将 Q16.16 转回普通 number）。外层再加 `fp.toFloat` 会把已经正确的 float 值（如 `0.785`）当作 Q16.16 整数解码，除以 65536 后趋近于零，导致渲染和物理体方向丢失。

**检查**：如果你看到子弹/物体渲染方向变成水平，但移动速度方向正确，很可能是 `fpAtan2` 的结果被重复 `fp.toFloat`。

### 5. 取整方向

```typescript
// 业务上需要取整到 tick 数时可用 Math.round，但入参必须是 fp 计算后的值
const ticks = Math.round(fp.toFloat(fp.mul(fp.fromFloat(seconds), fp.fromInt(60))));
```

### 6. 网络传输禁止用 Float32 压缩用户输入浮点数

联机输入必须按原样传播。`aimX` / `aimY` 这类来自指针、摇杆或客户端坐标换算的浮点值，不能用 `DataView.setFloat32()` 写入网络包；Float32 会截断 JS number，例如：

```text
845.3833799776838 -> 845.3833618164062
428.8524590163934 -> 428.8524475097656
```

这种差异可能在前几帧没有立刻改变 frame hash，但会改变后续弹幕角度、命中时机或 rollback 重放结果，最终导致 `finalGlobalHash` 不一致。

网络层处理规则：

- `moveX` / `moveY` 这类离散方向仍用 `int8`，因为类型就是 `-1 | 0 | 1`。
- `shootPressed` / `bombPressed` 等布尔输入打包为 bitset。
- `aimX` / `aimY` 等连续数值必须作为 decimal string 写入二进制包，并在解码时通过 `fp.fromString(...)` 校验/解析路径。
- 如果 fixed-point 库提供 `fp.toString(...)`，优先使用 `fp.toString(fp.fromFloat(value))` 作为跨端规范字符串；当前实现用 JS number 的精确 decimal string 作为 payload，并用 `fp.fromString(text)` 校验该字符串能被定点数稳定解析，再恢复原始 number。

```typescript
// ❌ 错误：会截断精度
view.setFloat32(offset, input.aimX, true);

// ✅ 正确：字符串进包，长度前缀分隔字段
const encoded = encoder.encode(input.aimX.toString());
view.setUint16(offset, encoded.byteLength, true);
bytes.set(encoded, offset + 2);

// ✅ 解包时走 fixed-point 字符串解析路径
const text = decoder.decode(encoded);
fp.fromString(text);
const aimX = Number(text);
```

任何新增用户输入中的连续数值字段都必须按这个规则处理。不要为了节省几个字节改成 Float32，也不要把浮点值先乘常数后 `Math.round`，除非 gameplay 类型本身已经定义为整数 tick、整数像素或枚举。

### 7. Hash 不能截断小数

确定性 hash 必须能看到定点小数差异。`Math.trunc(value)` 或 `Math.round(value * 1000)` 会把不同输入折叠成同一个 hash，导致 debug 阶段出现“输入已经不同，但 frame hash 仍然相同”的假象。

当前规则：

- 整数字段走快速 32-bit 写入。
- 非整数字段先转为 fixed-point 表示字符串，再写入 hash。
- snapshot/hash 的 `writeFixed(...)` 不做千分位量化，必须写入 fixed-point 表示。

```typescript
// ❌ 错误：小数被吞掉
hasher.writeNumber(Math.trunc(value));
hasher.writeNumber(Math.round(value * 1000));

// ✅ 正确：小数进入 hash
hasher.writeString(fp.fromFloat(value).toString());
```

如果两端日志里 `aimX` / `aimY` 有任何差异，权威 frame hash 应尽早体现差异，而不是等到最终 hash 才暴露。

## 标准模式

### 距离计算

```typescript
// 浮点结果（判断大小后用）
const dist = fpHypotFp(fpDx, fpDy);
if (fp.gt(dist, fp.fromFloat(radius))) { ... }

// 或链入 fp 运算
const fpDist = fpHypotFp(fpDx, fpDy);
const fpScaled = fp.mul(fpDist, fp.fromFloat(0.5));
```

### 角度计算

```typescript
const angle = fpAtan2(fp.fromFloat(target.y - y), fp.fromFloat(target.x - x));
```

### 归一化向量

```typescript
const fpLen = fpMax(fp.fromInt(1), fpHypotFp(fpDx, fpDy));
const fpNormX = fp.div(fpDx, fpLen);
const fpNormY = fp.div(fpDy, fpLen);
```

### 碰撞体参数

权威命中、shield 阻挡、mob 命中和擦弹由 `BattlePhysics` / Rapier 适配层产出，不应在角色、能力卡或前端里新增一套手写几何判定。定点数规则仍然适用于进入 Rapier 前的位置、尺寸、角度、速度和过滤条件；这些参数必须来自确定性逻辑计算，rollback 后重建 Rapier bodies 应得到同样的碰撞结果。

## 示例：编写一个发射弹幕的角色

以下示范如何用定点数编写一个完整角色，包含普通射击和 bomb。

```typescript
import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "@repo/content";
import type { FighterState } from "../../types";
import type { BattleHitContext } from "../ability-cards";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";
import { fpAtan2 } from "../../fp";
import { Vanilla } from "../../registry";

// 常量用秒定义，转为 tick
const HOMING_TICKS = secondsToTicks(2);

@Vanilla.RegisterCharacter("example_char")
export class ExampleBattleCharacter extends BattleCharacter {
  readonly id = "example_char" as CharacterDefinition["id"];
  readonly name = "示例角色";
  readonly cost = 3;
  readonly roleClass = "suppress" as CharacterDefinition["roleClass"];
  readonly description = "定点数编写示例角色";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/example/portrait.png",
    attackPreviewAsset: "assets/characters/example/attack-preview.png",
  };
  readonly normalAttackId = "example_shot";
  readonly bombId = "example_bomb";
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 5;
  readonly reloadTicksPerAmmo = secondsToTicks(0.8);
  readonly reloadStartPolicy = "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy = "commit_per_ammo" as CharacterDefinition["reloadCommitPolicy"];

  // ── 普通射击 ──────────────────────────────────────────
  shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void {
    // aimAngle 返回 float（角度值最终给渲染和 fp.cos/sin 用）
    const fpAngle = fp.fromFloat(this.aimAngle(fighter, aimX, aimY));

    // 发射 3 发：-45°, 0°, +45°
    // fp 运算链：所有角度偏移在 fp 域完成
    const fpPI4 = fp.fromFloat(Math.PI / 4);
    for (const fpOffset of [fp.negate(fpPI4), fp.fromInt(0), fpPI4]) {
      const fpShotAngle = fp.add(fpAngle, fpOffset);

      // 传给 spawnBullet 的参数可以是 float（内部会再转 fp）
      // 但核心计算（角度、位置）必须用 fp
      ctx.spawnBullet({
        owner: fighter.key,
        kind: "orb",
        x: fighter.x,
        y: fighter.y,
        angle: fp.toFloat(fpShotAngle),
        speedRank: "low",
        width: hitCircleUnits(2),
        height: hitCircleUnits(1),
        homingTicks: HOMING_TICKS,
      });
    }
  }

  // ── Bomb ──────────────────────────────────────────────
  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter);
    this.setInvulnerable(fighter, secondsToTicks(2));

    // 清弹：传入普通 int 即可，clearProjectiles 内部用 fp 计算
    const radius = this.clearProjectiles(ctx, fighter, 6);

    // 生成 12 发环绕弹幕
    // fp 运算：角度 → cos/sin → 位置 → atan2 瞄准
    for (let index = 0; index < 12; index += 1) {
      // 角度：index / 12 * 2π，全部用 fp 链计算
      const fpAngle = fp.mul(
        fp.div(fp.fromInt(index), fp.fromInt(12)),
        fp.mul(fp.fromFloat(Math.PI), fp.fromInt(2)),
      );
      const fpCos = fp.cos(fpAngle);
      const fpSin = fp.sin(fpAngle);

      // 弹幕生成位置：fighter.x + cos * radius
      const x = fp.toFloat(fp.add(
        fp.fromFloat(fighter.x),
        fp.mul(fpCos, fp.fromFloat(radius)),
      ));
      const y = fp.toFloat(fp.add(
        fp.fromFloat(fighter.y),
        fp.mul(fpSin, fp.fromFloat(radius)),
      ));

      // atan2 参数必须用 fp.fromFloat 包装
      const shotAngle = fpAtan2(
        fp.fromFloat(ctx.opponent.y - y),
        fp.fromFloat(ctx.opponent.x - x),
      );

      ctx.spawnBullet({
        owner: fighter.key,
        kind: "orb",
        x,
        y,
        angle: shotAngle, // fpAtan2 返回 float，适合直接传
        speedRank: "low",
        width: hitCircleUnits(2),
        height: hitCircleUnits(1),
        homingTicks: HOMING_TICKS,
        spawnOffset: 0,
      });
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // 受击回调
  }
}
```

## 常见运算对照表

| 原生 JS | 定点数替代 |
|---------|-----------|
| `a * b` | `fp.mul(a, b)` |
| `a / b` | `fp.div(a, b)` |
| `a + b` | `fp.add(a, b)` |
| `a - b` | `fp.sub(a, b)` |
| `Math.sqrt(a)` | `fp.sqrt(a)` |
| `Math.cos(a)` | `fp.cos(a)` |
| `Math.sin(a)` | `fp.sin(a)` |
| `Math.atan2(y, x)` | `fpAtan2(y, x)` |
| `Math.hypot(a, b)` | `fpHypot(a, b)` 或 `fpHypotFp(a, b)` |
| `Math.abs(a)` | `fp.abs(a)` |
| `a > b` | `fp.gt(a, b)` |
| `a >= b` | `fp.gte(a, b)` |
| `a < b` | `fp.lt(a, b)` |
| `a <= b` | `fp.lte(a, b)` |
| `a === b` | `fp.eq(a, b)` |
| `Math.min(a, b)` | `fpMin(a, b)` |
| `Math.max(a, b)` | `fpMax(a, b)` |
| `a > 0 ? a : 0` 等钳制 | `fpClamp(v, lo, hi)` |
| `Math.PI` | `fp.fromFloat(Math.PI)` — 只在初始化时 |
| `-a` | `fp.negate(a)` |

## 文件清单

- 基础 fp 工具：`packages/raid-logic/src/battle/fp.ts`
- Rapier 物理适配：`packages/raid-logic/src/battle/model/physics-adapter.ts`
- 投射物碰撞消费：`packages/raid-logic/src/battle/model/projectile/index.ts`
- 弹幕逻辑：`packages/raid-logic/src/battle/model/projectile/bullet.ts`
- 激光逻辑：`packages/raid-logic/src/battle/model/projectile/laser.ts`
- 角色基类：`packages/raid-logic/src/battle/presets/characters/base.ts`
- CPU 躲避：`packages/raid-logic/src/battle/aicpu/dodger.ts`
