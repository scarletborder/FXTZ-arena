# 内容模型

## 包边界

`@repo/content` 保存可枚举定义和会在模拟中执行的内容行为，包括角色、能力卡、地图、Mob、Spawner 与协作波次。它依赖共享 types/constants 和 fixed-point，但不依赖 raid-logic 内部类。

为避免反向依赖，内容行为通过上下文接口请求操作：生成 bullet/laser/effect/clear ring/mob、读取双方状态、使用确定性 random 等。raid-logic 的 `BattleActionContextManager` 实现这些操作。

## 定义与行为

角色和能力卡同时提供两层信息：

- definition：ID、i18n key、cost、分类、速度、资源、gallery 等供选择/UI使用；
- behavior object：`shoot`、`useBomb`、`onHit`、`onUse`、`onPostUpdate` 等在模拟中执行的 hook。

`CharacterLibrary` 和 `CardLibrary` 保存构造器。`Vanilla.registerCharacter` / `registerCard` 装饰器在模块 side-effect import 时注册类型，query API 则枚举 definition。

## ID 与 i18n

- 角色/卡牌/地图 ID 联合类型位于 `packages/types/src/core/ids.ts`。
- 显示文本字段保存 i18n key，而不是直接写玩家可见文本。
- 中文与英文资源位于 `packages/i18n/src/locales`。
- gallery 字段保存资源键；实际加载和渲染由前端处理。

新增内容时，ID、注册、入口 side-effect import、i18n、资源、测试缺一不可。

## 战斗上下文

`packages/types/src/battle/ctx` 定义可复用的 action、hit、collision、state 和 operation 上下文。内容包在其上增加与当前 fighter/projectile 类型绑定的 `CharacterActionContext` 和 `BattleCardContext`。

上下文是内容与引擎的边界。不要从内容实现中导入 `BattleModel`、`ProjectileSystem` 或 Phaser Scene；需要新能力时，先判断是否应向上下文增加一个窄操作。

## 数值来源

- 通用帧率、尺寸、出生点、规则常量：`@repo/constants` / `@repo/types` rules。
- 单个角色/卡牌/Mob 数值：对应内容文件顶部的常量。
- 秒转 tick：`secondsToTicks`。
- 弹图资源尺寸和 hitbox：`bullet-assets.ts`。

Wiki 不复制完整平衡数值，避免下一次调整后再次过期。

## 源码索引

- `packages/content/src/content/index.ts`
- `packages/content/src/content/decorators.ts`
- `packages/content/src/content/characters/`
- `packages/content/src/content/ability-cards/`
- `packages/content/src/content/mob-spawner/`
- `packages/types/src/battle/ctx/`
