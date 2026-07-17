# 添加角色

## 1. 定义 ID 与文本

1. 在 `packages/types/src/core/ids.ts` 的 `CharacterId` 增加稳定 ID。
2. 在 `packages/i18n/src/locales/zh_cn.json` 和 `en_us.json` 增加角色名、描述及需要展示的攻击/Bomb 文本。
3. 准备 gallery 和战斗资源，并确认前端资源构建脚本能收集它们。

不要把显示文本直接写进角色类；`name` 和 `description` 应是 i18n key。

## 2. 实现 BattleCharacter

在 `packages/content/src/content/characters/<id>.ts`：

1. 定义平衡常量，持续时间使用 `secondsToTicks`。
2. 继承 `BattleCharacter`，填写完整 definition 字段。
3. 实现 `shoot`、`useBomb`、`onHit`。
4. 需要时实现 `onAfterFire` / `onPostUpdate`。
5. 用 context 生成 bullet、laser、segment、effect、clear ring 或 familiar。
6. 使用 `@Vanilla.registerCharacter("<id>")` 注册。

不要从角色文件导入 `BattleModel` 或直接 push 到 projectile 数组。

## 3. 设计状态

如果机制跨帧持续：

- 能复用通用 fighter 字段时优先复用；
- 角色特有状态加入 `FighterExtraState` 或明确的 familiar state；
- 同步更新默认初始化、reset、snapshot/restore 和 hash；
- 不把可变战斗状态仅放在角色实例属性中。

若每帧被动逻辑消费 aim，设置 `consumesAimOnPostUpdate = true` 并增加回滚测试。

## 4. 注册与查询

在 `characters/index.ts` 增加 side-effect import，确保 decorator 真正执行。确认：

- `characterLibrary.has(id)` 为真；
- `getAllCharacterDefinitions()` 包含新角色；
- loadout 校验和 cost/role UI 能识别该 definition。

## 5. 表现

按机制补充：

- `battle/sfx/wingman/character/<id>.ts`；
- projectile texture/metrics；
- familiar Mob sprite；
- 特殊 fighter 状态在 `BattleViewModel` 的投影和表现。

纯视觉状态不要加入逻辑 hash；影响判定的尺寸/时间必须由逻辑状态提供。

## 6. 测试

至少增加：

- `packages/raid-logic/src/battle/model/test/<id>.test.ts` 的普通攻击、Bomb 和关键被动测试；
- snapshot/restore 后持续机制一致；
- frontend rollback consistency character matrix 覆盖；
- i18n key 和资源存在性检查。

运行：

```powershell
pnpm --filter @repo/raid-logic test
pnpm --filter frontend test
pnpm check-types
pnpm lint
```
