# Battle Contexts

战斗逻辑里的角色、能力卡、碰撞、弹幕和视觉效果不应该直接依赖 `BattleModel`、`ProjectileSystem` 或 `EffectSystem` 的内部结构。它们通过标准化 ctx 读取状态并执行允许的操作。

## Ctx 分类

### 战局信息 ctx

提供与整场战斗有关的只读信息：

- 当前帧 `frame`。
- 训练/对战统计 `stats`。
- 当前弹幕集合 `projectiles`。
- 当前逻辑视觉效果集合 `effects`。

### 单角色 ctx

描述一个角色自身：

- `self`：当前执行逻辑的角色。

适用于只关心自身状态的被动效果、局部状态修正和 UI 派生逻辑。

### 双角色 ctx

描述一次角色与对手的交互：

- `self`：动作发起方或当前处理方。
- `opponent`：对手。

适用于射击、bomb、主动能力卡、追踪弹目标选择、行动锁定等逻辑。

### 操作 ctx

提供战斗对象的受控操作，而不是暴露系统实例：

- `spawnBullet`：生成普通弹幕。
- `spawnLaser`：生成激光/魔炮类弹幕。
- `clearProjectilesAround`：按圆形范围清弹，并返回清除数量。
- `spawnClearRing`：生成纯视觉清弹圈。
- `spawnEffectRing`：生成通用 ring effect。

角色和能力卡只能通过这些操作改变弹幕/effect 集合。

### 主动动作 ctx

组合战局信息、双角色状态和操作 ctx。用于：

- 普通射击。
- bomb。
- 主动能力卡 `onUse`。
- 需要读取双方状态并释放弹幕/effect 的角色技能。

### 受击 ctx

组合主动动作 ctx，并额外提供一次命中结算的信息：

- `owner`：攻击方 key。
- `victim`：受击方。
- `attacker`：攻击方。
- `damage`：本次伤害。
- `before.victim` / `before.attacker`：命中结算前双方状态快照。
- `cards.victim` / `cards.attacker`：双方携带的卡。
- `resolution`：中间件可修改的受击结算结果，例如 `defaultBombs`。

角色和能力卡通过 `onHit(ctx)` 作为中间件修改 `resolution`，最后由核心命中结算消费结果。

### 碰撞 ctx

描述一次弹幕命中检测产生的事件：

- `projectile`：发生碰撞的弹幕。
- `owner`：弹幕拥有者。
- `victim`：被命中的角色。
- `damage`：弹幕伤害。

ProjectileSystem 只负责产出碰撞 ctx；是否接受命中、如何扣命、如何触发角色/卡牌 `onHit` 由上层战斗模型处理。

## 当前落地

- 共享接口定义在 `packages/types/src/battle/ctx/`。
- raid-logic 在 `BattleModel` 中构造具体 ctx。
- 角色 preset 实现 `shoot(ctx)`、`useBomb(ctx)`、`onHit(ctx)`。
- 能力卡 preset 实现 `onUse(ctx)`、`onHit(ctx)`。
- 弹幕和 effect 生成通过 ctx 操作完成。
