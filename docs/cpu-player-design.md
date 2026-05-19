# CPU 玩家设计

## 总览

人机对战中 CPU 使用的角色为 **博丽灵梦（常驻）+ 魔理沙（特殊）**，携带一张 `spirit_strike_card`。
CPU 的目标是提供有压迫感、有一定智能但又能被玩家击败的对手。

## 自爆计时器

每一条命，CPU 都有明确的"智能阶段"循环：

| 阶段 | 时长 | 行为 |
|------|------|------|
| **聪明 (Smart)** | 35 秒 (2100 ticks) | CPU 完美躲避所有弹幕 |
| **钝化 (Dulling)** | 20 秒 (1200 ticks) | 逐渐变得无法躲避，每帧精度下降 |
| **愚钝 (Dumb)** | 持续到受击 | 几乎不躲避，随机移动；每隔 3 秒有 8% 概率（累加）直接撞向子弹 |

**重置条件**：任意一方（玩家或 CPU）受击时，CPU 的智能阶段立即重置到"聪明"。
这意味着每次攻防转换后 CPU 都会重新变得危险。

### 钝化阶段精度曲线

钝化阶段的 1200 ticks 内，以下参数从"聪明值"线性变化到"愚钝值"：

| 参数 | 聪明值 | 愚钝值 |
|------|--------|--------|
| `dodgeAccuracy` | 1.0 | ~0 |
| `reactionDelay` | 0 ticks | 20 ticks |
| `aimNoise` | 0 rad | 0.3 rad |

## 弹幕躲避算法

### 威胁评估

每帧对所有活跃弹幕进行评估。只有满足以下条件的弹幕才被视为威胁：

1. **方向检测**：弹幕朝向 CPU 方向（夹角 < 45° cone）
2. **最近距离**：弹幕轨迹与 CPU 的最短距离 < 阈值（弹幕半高 + 判定半径 × 安全系数）
3. **未来可达**：弹幕尚未经过 CPU

对激光类弹幕（`kind === "laser" 或 "spark"`）：
- 直接检测 CPU 是否在激光扇形/矩形范围内
- 如果是，按弹幕速度方向垂直逃逸

对诱导弹（`kind === "orb"`）：
- 考虑诱导开始时间（0.5s 后），预测弹道弯曲方向

### 逃逸向量合成

每个威胁产生一个逃逸向量（垂直于弹幕轨迹），权重为：
```
danger = (threatRadius - closestDist) / max(1, timeToClosest)
```

- `closestDist`：弹幕轨迹与 CPU 的最短距离
- `threatRadius`：危险判定半径
- `timeToClosest`：到达最近点的预估 tick 数

所有逃逸向量按 danger 加权求和，生成最终的期望移动方向。

### 墙壁回避

当 CPU 距离竞技场边界 < 48px 时，产生反推墙壁的逃逸向量。

### 精度退化应用

在钝化和愚钝阶段：
- **延迟反应**：CPU 的移动指令基于 `frame - reactionDelay` 帧的状态计算
- **随机扰动**：在最终逃逸方向上叠加随机角度偏移
- **忽略阈值**：danger 值低于某个阈值时随机忽略威胁

## 进攻策略

### 射击

- **有弹药且冷却就绪时持续射击**
- 瞄准：朝向玩家的方向加少量随机偏移（随钝化程度增加）
- 灵梦（5 发，中速射速）：持续压制
- 魔理沙（2 发，慢速射速）：高爆发但需要频繁装填

### 装弹

- **弹药为 0 时立即装弹**
- 弹药较少时选择安全时机（附近威胁少）装弹
- 装弹期间不执行攻击指令

### Bomb

- **威胁数量 > 3 且 bomb 可用时释放**
- **即将被命中（closestDist < 核心半径）时紧急释放**
- 保留至少 1 个 bomb，避免完全耗尽

### 切换角色

- 默认使用灵梦（常驻模式）
- 当前角色弹药耗尽且另一角色有弹药时切换
- 魔理沙用于近距离爆发

### 距离控制

- **最小距离**：与玩家保持至少 150px
- **最大距离**：不超过 500px
- **理想距离**：250-350px
- 在躲避弹幕和距离控制之间取加权平均
  - 聪明阶段：躲弹权重 0.8，距离控制 0.2
  - 愚钝阶段：躲弹权重 0.2，距离控制 0.8

## 文件组织

所有 AI 代码集中在 `apps/frontend/src/battle/aicpu/` 下：

```
aicpu/
  index.ts          -- CpuPlayer 主类，整合各模块，对外暴露 getAction()
  intelligence.ts   -- IntelligenceManager：自爆计时器、阶段管理、命中检测
  dodger.ts         -- Dodger：弹幕威胁评估、逃逸向量合成
  strategy.ts       -- StrategyManager：进攻决策（射击、bomb、装弹、切换）
```

## BattleModel 集成

`BattleModel` 在人机对战模式 (`endOnTargetDefeat === true`) 下创建 `CpuPlayer` 实例，
在 `stepTarget()` 中调用 `cpuPlayer.getAction()` 获取 CPU 的移动和攻击指令，
替代现有的正弦波简单移动逻辑。

```typescript
// stepTarget 中：
if (this.cpuPlayer) {
  const action = this.cpuPlayer.getAction({
    frame: this.frame,
    self: this.target,
    opponent: this.player,
    projectiles: this.projectiles,
    effects: this.effects,
  });
  // 应用 action 到 targetFighter
} else {
  // 靶场模式：现有简单逻辑
}
```

CPU Loadout 从现有咲夜+灵梦改为 **灵梦+魔理沙**。
