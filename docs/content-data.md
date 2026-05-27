# 内容数据规格

## 设计目标

内容数据应能同时服务：

- 图鉴展示。
- 选择页面 cost 校验。
- 战局逻辑初始化。
- 房间协议同步。
- 测试用例生成。

建议所有静态内容放在 `packages/types` 或独立 `packages/content`。如果内容会包含大量资源路径，可后续拆出 `packages/content`。

## 枚举

```ts
export type RoleClass = "assault" | "suppress" | "scout" | "sniper";
export type SpeedRank = "low" | "medium" | "high";
export type AbilityCardKind = "active" | "passive";
export type ReloadStartPolicy = "reset_to_zero" | "keep_current";
export type ReloadCommitPolicy = "commit_on_finish" | "commit_per_ammo";
```

## 角色数据

```ts
export interface CharacterDefinition {
  id: string;
  name: string;
  cost: number;
  roleClass: RoleClass;
  moveSpeed: SpeedRank;
  ammoCapacity: number;
  reloadTicksPerAmmo: number;
  reloadStartPolicy: ReloadStartPolicy;
  reloadCommitPolicy: ReloadCommitPolicy;
  fireRate: SpeedRank;
  bulletSpeed: SpeedRank;
  description: string;
  normalAttackId: string;
  bombId: string;
  gallery: {
    portraitAsset: string;
    attackPreviewAsset: string;
  };
}
```

首批角色：

| id | 名字 | cost | 职业 | 移速 | 弹容 | 单发装填 | 起始 | 生效 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `reimu` | 博丽灵梦 | 4 | 压制 | 中 | 5 | 48 tick | 当前数目 | 一发一发 |
| `marisa` | 魔理沙 | 5 | 狙击 | 高 | 2 | 90 tick | 归零 | 全部完成后 |
| `sakuya` | 咲夜 | 4 | 突击 | 中 | 3 | 60 tick | 当前数目 | 全部完成后 |

装填策略：

- 起始装填数目：
  - `reset_to_zero`：舍弃全部子弹，从 0 开始装填。
  - `keep_current`：从当前数目子弹开始装填。
- 装填行为：
  - `commit_on_finish`：全部装填好后才全部生效。
  - `commit_per_ammo`：装填一发是一发。
- `reimu`：`keep_current` + `commit_per_ammo`。
- `marisa`：`reset_to_zero` + `commit_on_finish`。
- `sakuya`：`keep_current` + `commit_on_finish`。

## 能力卡数据

```ts
export interface AbilityCardDefinition {
  id: string;
  name: string;
  cost: number;
  kind: AbilityCardKind;
  useLimit: "infinite" | number;
  cooldownTicks: number;
  description: string;
  gallery: {
    iconAsset: string;
    previewAsset: string;
  };
  effectIds: string[];
}
```

首批能力卡：

| id | 名字 | 分类 | cost | 使用限制 | 冷却 | 效果摘要 |
| --- | --- | --- | --- | --- | --- | --- |
| `extra_life` | 余命 | 被动 | 3 | 无限 | 0 tick | 初始命变为 3 |
| `ember` | 余烬 | 被动 | 2 | 无限 | 0 tick | 默认 bomb 变为 4，死亡复活也恢复到 4 |
| `backdoor` | 后门 | 被动 | 1 | 无限 | 0 tick | 角色后方追加可消除普通子弹的矩形护盾 |
| `multi_shot` | 多射 | 被动 | 1 | 无限 | 0 tick | 每次左键发射额外追加 1 个低速诱导普通矩形子弹 |
| `spirit_strike_card` | 灵击符 | 主动使用 | 1 | 3 次 | 1200 tick | 清除周围 4 倍判定点圆圈直径范围内的全部弹幕 |
| `graze_lover` | 擦弹爱好者 | 被动 | 1 | 无限 | 0 | 擦弹范围提升到 150% |

## 玩家配装

```ts
export interface PlayerLoadout {
  primaryCharacterId: string;
  alternateCharacterId: string;
  abilityCardIds: string[];
  activeAbilityCardId?: string;
}
```

校验规则：

- `primaryCharacterId` 和 `alternateCharacterId` 必须存在。
- 两个角色 id 不能相同。
- 所有能力卡 id 必须存在。
- 主动能力卡最多只能选择 1 张。
- 如果选择了主动能力卡，`activeAbilityCardId` 必须指向该卡；如果没有选择主动能力卡，该字段为空。
- 普通模式下总 cost 必须小于 cost 上限。
- 靶场模式跳过 cost 上限，但仍校验 id 有效性和角色不重复。

## 输入帧

```ts
export interface PlayerFrameInput {
  frame: number;
  moveX: -1 | 0 | 1;
  moveY: -1 | 0 | 1;
  aimX: number;
  aimY: number;
  shootPressed: boolean;
  bombPressed: boolean;
  activeCardPressed: boolean;
  reloadPressed: boolean;
  alternateHeld: boolean;
  infoHeld: boolean;
}
```

`aimX` 和 `aimY` 建议是定点数或整数归一化方向，不直接使用浮点。

## 战局配置

```ts
export interface BattleConfig {
  battleId: string;
  mapId: string;
  seed: number;
  fps: 60;
  lifeCount: number;
  defaultBombCount: number;
  costLimit: number;
  players: [BattlePlayerConfig, BattlePlayerConfig];
}

export interface BattlePlayerConfig {
  playerId: string;
  username: string;
  loadout: PlayerLoadout;
  spawnPointId: string;
}
```

## 房间数据

```ts
export interface RoomSummary {
  id: string;
  name: string;
  hasPassword: boolean;
  mapId: string;
  lifeCount: number;
  costLimit: number;
  playerCount: number;
  maxPlayers: 2;
  status: "waiting" | "selecting" | "loading" | "fighting" | "finished";
}
```

## 战局状态快照

状态快照必须纯数据化，便于复制、序列化、hash 和回滚。

```ts
export interface BattleSnapshot {
  frame: number;
  rngState: string;
  players: PlayerBattleState[];
  projectiles: ProjectileState[];
  effects: EffectState[];
  timers: TimerState[];
  stats: BattleStats;
}
```

排序要求：

- `players` 按 player index 固定顺序。
- `projectiles` 按稳定 id 排序。
- `effects` 按稳定 id 排序。
- `timers` 按稳定 id 排序。

## Hash 字段规范

参与 hash：

- frame。
- rngState。
- 玩家位置、朝向、角色模式、命数、bomb、弹夹、装弹状态、无敌状态、动作锁定状态。
- 子弹和效果的位置、速度、方向、剩余 tick、归属、形状参数。
- 所有会影响后续战局的计时器。

不参与 hash：

- Phaser sprite id。
- 粒子、音效、屏幕震动。
- UI 展示透明度。
- 本地用户名颜色等纯显示设置。

## 资源命名建议

```text
assets/
  characters/
    reimu/
      portrait.png
      attack-preview.png
    marisa/
    sakuya/
  ability-cards/
  maps/
  ui/
```

测试版角色可先不使用人物贴图，图鉴预览可用 Phaser 几何预览 scene 或占位图。
