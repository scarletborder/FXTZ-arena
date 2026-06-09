# 合作模式实施计划与测试清单

本文档记录合作模式的分阶段实施计划。合作模式目标是：两名玩家合作，对抗由 mob spawner 按 wave 生成的怪物；在确定性输入、同步和回滚机制下完整复现战局；在 replay 完整支持前不保存合作模式 replay。

## 总体原则

- 合作模式应作为独立 battle mode 接入，避免把对战模式特例散落在 UI、逻辑、回放和内容定义中。
- 能复用现有对战逻辑时，优先抽出模式接口或配置，例如地图池、胜负判定、友军伤害、loadout 规则、spawner 策略、结算统计。
- 不能复用时创建新目录承载合作模式功能，例如 `collaborate/`、`collaborate-spawner/`、`shop/`、`scoring/`。
- 所有影响逻辑结果的合作模式状态必须进入 rollback snapshot；只影响显示的状态留在 frontend view。
- 时间配置使用秒，逻辑内部在内容解析或 spawner 初始化时转换成整数帧。
- 所有随机抽取必须使用战斗确定性 RNG，不能使用 `Math.random()`。

## 现状入口与主要改造点

当前仓库中与本需求最相关的落点：

- 房间列表 UI：`apps/frontend/src/menu/room-list-scene.ts`。
- 创建房间地图选择：`packages/content/src/content/maps/defaults.ts`、`packages/content/src/content/maps/types.ts`。
- 地图 ID 类型：`packages/content/src/content/ids.ts`。
- 战斗数据入口：`packages/raid-logic/src/battle/loadout.ts`。
- 战斗模型与回滚快照：`packages/raid-logic/src/battle/model/index.ts`、`packages/raid-logic/src/battle/model/snapshot.ts`。
- mob spawner 基类：`packages/content/src/content/mob-spawner/base.ts`。
- 现有示例 spawner：`packages/content/src/content/mob-spawner/default-a.ts`。
- mob 状态类型：`packages/types/src/battle/neutral-mob.ts`。
- point 状态与渲染：`packages/content/src/content/battle-types/PointState.ts`、`packages/raid-logic/src/battle/model/points.ts`、`apps/frontend/src/battle/view/points.ts`。
- 场景背景与舞台：`apps/frontend/src/battle/view/stage.ts`。
- 怪物渲染：`apps/frontend/src/battle/view/mobs.ts`。
- 能力卡定义：`packages/content/src/content/ability-cards/base.ts`、`packages/content/src/content/ability-cards/*.ts`。
- 常量包：`packages/constants/src/battle/`。
- replay：`apps/frontend/src/replay/`、`packages/constants/src/replay.ts`。

## 阶段 1：模式与入口

### 计划

1. 新增 battle mode 类型，建议命名为 `"versus"` 和 `"collaborate"`。
2. 在房间摘要、创建房间请求、加入房间、battle scene data 中携带 battle mode。
3. 房间列表标题右侧增加两个矩形按钮：“对战模式”和“合作模式”。
4. 默认保持对战模式；切到合作模式后：
   - 房间列表只请求合作模式房间。
   - 观战 checkbox 隐藏或禁用。
   - 加入房间时不允许 spectator。
   - 创建房间 dialog 使用合作模式地图池。
5. 创建房间 dialog 根据 battle mode 切换地图列表。
6. 地图内容层按模式拆分：
   - `getAvailableVersusMaps()`。
   - `getAvailableCollaborateMaps()`。
   - `getCombatMapDefinition()` 保持可通过 ID 解析所有地图。
7. 新增合作地图“合作测试竞技场”，物理世界尺寸 3200x1920，显示视窗 1600x960。

### 测试清单

- 房间列表默认显示“对战模式”选中。
- 点击“合作模式”后会刷新列表，请求参数包含合作模式。
- 合作模式下观战入口不可用，不能通过密码 dialog 以 spectator 加入。
- 对战模式创建房间只显示对战地图。
- 合作模式创建房间只显示“合作测试竞技场”。
- 创建合作房间后，房间摘要与 lobby 中模式一致。
- 服务端拒绝合作模式 spectator 请求。

## 阶段 2：合作 loadout 规则

### 计划

1. 为 loadout validation 增加 mode 参数。
2. 对战模式保留现有规则。
3. 合作模式规则：
   - 每位玩家只选择两个角色。
   - 不能选择能力卡。
   - `activeCardId` 和 `cardIds` 必须为空。
4. UI 上合作模式隐藏或禁用能力卡选择区域。
5. 进入 battle 前做服务端和客户端双重校验，避免仅依赖 UI。
6. 后续角色初始钱数额应从角色定义或合作模式角色配置中读取；当前阶段先允许 battle 初始化参数传入两位玩家独立初始钱。

### 测试清单

- 合作模式下 loadout 页面不能添加能力卡。
- 合作模式提交带能力卡的 loadout 会被校验拒绝。
- 对战模式 loadout 不受影响。
- 合作模式 battle 初始化后两位玩家各自拥有两个角色。
- 两位玩家初始 money 可独立传入并进入回滚快照。

## 阶段 3：友军伤害与碰撞

### 计划

1. 明确 projectile owner 语义：
   - 玩家弹幕 owner 为 `Player1` 或 `Player2`。
   - 怪物弹幕 owner 为 `Neutral`。
2. 对战模式保留当前玩家互相命中逻辑。
3. 合作模式下：
   - 玩家弹幕不能伤害另一名玩家。
   - 玩家弹幕仍可命中 Neutral mob。
   - Neutral 弹幕可伤害两名玩家。
   - 擦弹计分依然按被擦弹玩家独立结算。
4. 修改碰撞回调时不要只用 owner 判断，建议增加 `BattleRules` 或 `DamagePolicy`，由 mode 决定 `canProjectileDamageTarget()`、`canProjectileGrazeTarget()`。
5. 弹幕互消也需要确认：合作模式下玩家之间弹幕是否互消。建议默认不互消，避免友军火力被另一名玩家清掉；清弹技能按 owner/rules 单独定义。

### 测试清单

- 合作模式 Player1 子弹穿过 Player2 不扣命。
- 合作模式 Player2 子弹穿过 Player1 不扣命。
- 合作模式玩家子弹能击杀 mob。
- Neutral 子弹能击中两位玩家。
- 对战模式玩家互相伤害仍正常。
- 回滚后同一帧碰撞结果一致。

## 阶段 4：更大物理世界与 camera

### 计划

1. 区分逻辑世界尺寸与显示视窗尺寸：
   - 合作逻辑世界：2400x1440。
   - 合作 camera viewport：1200x720。
   - 当前对战模式尺寸保持现状1200x720。
2. 将常量从单一 `ARENA_WIDTH/HEIGHT` 改成 mode/map 驱动的 arena bounds。
3. BattleModel、physics adapter、point outside 判断、spawn point、mob 移动边界都读取当前 map bounds。
4. camera 只显示以本地玩家为中心的 1200x720 视窗：
   - 玩家在地图中央区域时 camera 跟随玩家中心。
   - 玩家贴墙时 camera clamp 到世界边界，不再强行让玩家处于屏幕中心。只有世界边界有边框。
   - 插值移动，避免回滚修正或快速移动造成跳屏。
5. 背景改为可重复瓦片：
   - 新增一张 tileable 背景资源。
   - 可先用程序绘制一个可重复 canvas texture，再视需要替换为真实图。
   - 渲染层使用 camera scroll 或 tile sprite，而不是拉伸单张大图。
6. 所有世界坐标渲染对象统一经过 camera transform；HUD 保持屏幕坐标。

### 测试清单

- 合作地图物理边界为 2400x1440。
- 玩家不能离开世界边界。
- camera 在中心区域平滑跟随本地玩家。
- 玩家靠近左、右、上、下边界时 camera clamp 正确。
- 两名玩家在同一战局中各自客户端以自己的本地玩家为 camera 中心。
- 背景瓦片在 camera 移动时无明显缝隙。
- HUD 不随 camera 移动。
- 对战模式原有显示与碰撞不被合作 camera 改动影响。


## 阶段 5：CollaborateExtraState、阶段就绪同步与回滚

### 计划

1. **扩展快照字段**：
   在 `BattleModelSnapshot` 中增加可选字段 `collaborateExtra?: CollaborateExtraState`。

2. **定义 `CollaborateExtraState` 结构**：
   该状态至少包含：
   - 当前合作状态：`running | transition_sync | victory | defeat`。
   - 转换同步状态（用于进入阶段前的暂停与同步）：
     - `pendingTransitionTarget`: 接下来要进入的目标（`"elite" | "boss" | "shop"`）。
     - `transitionType`: 同步类型（`"auto"` 用于商店，`"manual"` 用于 elite/boss）。
     - `player1TransitionReady: boolean` 和 `player2TransitionReady: boolean`。
   - wave 进度、当前 wave id、wave 开始帧、下一波允许帧、强制下一波帧。
   - shop 状态：是否打开、第几个商店、货物列表、每位玩家购买记录、ready 状态。
   - 两位玩家独立 money 与 score。
   - boss 是否已击败。
   - spawner 内部确定性 RNG 状态或抽卡种子。
   - elite/boss spellCard 阶段、当前符卡剩余帧、符卡血量、非符血量段进度。

3. **细化就绪同步机制（Transition Sync）**：
   当上一波小怪被清空，且下一阶段为特殊阶段时，游戏逻辑的核心循环（如弹幕移动、常规计时器等）暂停，变更为 `transition_sync` 状态：
   
   - **进入商店前（自动同步 - 用户无感）**：
     - `transitionType` 设为 `"auto"`。
     - 客户端检测到该状态后，在逻辑帧中**自动、静默**地向输入队列发送各自的“准备就绪”输入帧。
     - 逻辑层在两名玩家的就绪帧均被处理（`player1TransitionReady` & `player2TransitionReady` 均为 `true`）的下一帧，直接开启商店，用户无任何弹窗干扰。
     
   - **进入 Elite / Boss 前（手动同步 - 弹窗确认）**：
     - `transitionType` 设为 `"manual"`。
     - 客户端渲染层弹出一个 Dialog 提示框，显示内容为：“准备挑战 [精英怪/Boss] (已就绪: X/2)”，并提供一个“准备”按钮。
     - 玩家必须手动点击“准备”按钮，才会向输入队列发送“准备就绪”输入帧。
     - 逻辑层处理输入并更新对应的 ready 状态；当两人均就绪时，关闭 Dialog，正式切换回 `running` 状态并生成对应的精英怪/Boss。

4. **重构特殊子弹（诱导攻击与狙击攻击）**：
   - 确保所有角色的诱导攻击和狙击攻击子弹使用统一的入口，仅通过初始化参数区分。
   - 在合作模式下，这两种子弹的目标不再是另一位玩家，而是改为**距离准心最近的怪物**（通过 `neutral-mob-manager` 提供的接口检索）。
   - 如果场上没有怪物，则子弹朝准心方向发射，并失去诱导/狙击能力。
   - 此目标检索计算必须保证跨端确定性，且支持在回滚后得出一致的计算结果。

### 测试清单

- 对战模式 snapshot 不含 `collaborateExtra`，合作模式 snapshot 包含完整的 `collaborateExtra`。
- 序列化与反序列化后，money、score、wave、过渡就绪状态（类型、目标及双方 ready 标记）、shop 状态完全一致。
- **商店前自动同步测试**：
  - 清空波次且下一阶段为商店时，游戏短暂暂停并迅速自动恢复，直接展现商店界面，玩家不需要进行任何多余的确认点击。
  - 抓包或日志层面确认有基于确定性输入的自动同步帧交互。
- **Elite/Boss 前手动同步测试**：
  - 清空波次且下一阶段为 Elite/Boss 时，游戏暂停，两端屏幕上均弹出 Dialog。
  - Dialog 实时、准确显示当前就绪人数（0/2、1/2、2/2）。
  - 点击“准备”按钮后，本地就绪状态更新，按钮变灰或显示已准备。
  - 只有两名玩家均点击准备后，Dialog 才会消失，战斗逻辑恢复且怪物正式出现。
  - 在就绪 Dialog 开启期间发生网络回滚，Dialog 的显示状态（如已就绪人数、本地按钮状态）能够正确恢复且不产生 desync。
- **子弹导向测试**：
  - 合作模式下，诱导/狙击子弹能正确朝距离准心最近的怪物偏折。
  - 场上无怪物时，子弹直线朝准心方向发射，不产生偏移。
  - 验证回滚后同一帧的子弹目标指向与位置跨端完全一致。

## 阶段 6：wave spawner 机制

### 计划

1. 在现有 `NeutralMobSpawner` 基础上抽象 wave spawner：
   - `WaveDefinition`：一波怪物定义、生成函数、最小下一波秒数、最长下一波秒数。
   - `ShopDefinition`：商店出现点和能力卡稀有度抽取配置。
   - `MobClass`：`minion | elite | boss`。
2. wave 步进规则：
   - 当前 wave 开始后，未到最小下一波时间，不进入下一波。
   - 到最小下一波时间后，如果场上怪物已清空，进入下一波。
   - 到最长下一波时间后，强制进入下一波。
   - elite 或 boss 在场时，计时推进失效；只有场上怪物全部击败才步进。
   - shop 节点也禁用计时推进；必须两位玩家 ready 后立即刷新下一波。
3. wave 定义中的秒数在初始化时换算为 tick。
4. spawner snapshot 必须保存当前 wave index、当前阶段、shop 序号、waveStartFrame、已生成成员等必要状态。
5. 避免 frame-derived spawner 在回滚后重复生成，建议所有 wave 节点记录 spawned member keys。

### 测试清单

- 小怪 wave 未到最小时间时，清空场上怪也不会提前刷下一波。
- 到最小时间后，清空场上怪立即进入下一波。
- 到最长时间后，即使仍有 minion 也强制进入下一波。
- elite 在场时超过最长时间也不进入下一波。
- boss 在场时超过最长时间也不进入下一波。
- shop 在场时超过最长时间也不进入下一波。
- 回滚到 wave 中途不会重复生成同一个 mob。

## 阶段 7：胜负规则

### 计划

原先的胜负规则是一方玩家死亡。现在需要修改

1. 为 mode 增加胜负策略。
2. 合作模式胜利：
   - boss 正式阵亡后立即胜利。result-scene 显示挑战胜利
3. 合作模式失败：
   - boss 未击败时，两位玩家都处于阵亡状态，游戏失败。result-scene显示挑战失败
4. 对战模式保留现有 `BattleFighter.onProjectileHit()` 触发 game over 的逻辑。
5. 输出状态中区分 `gameOver` 和 `result`，便于结果页显示“胜利/失败/对战胜者”。

### 测试清单

- boss 未击败，两位玩家同时阵亡时失败。
- 只有一位玩家阵亡时战局继续。
- boss 正式阵亡时胜利，即使有残留子弹或道具。
- boss 符卡阶段打空不应提前胜利，只有最后符卡结束后胜利。
- 对战模式胜负不变。

## 阶段 8：elite/boss 渲染与 spellCard

### 计划

1. mob 状态增加：
   - `class: "minion" | "elite" | "boss"`。
   - `displayName`。
   - `spellCards` 或当前 spellCard 派生状态。
   - 当前阶段：非符或符卡。
   - 当前阶段血量、最大血量、符卡剩余 tick。
2. elite/boss 周围绘制血量圆环：
   - 红色表示当前阶段剩余血量。
   - 掉血时顺时针减少。
   - 非符阶段在阈值处绘制蓝色标记。
   - 符卡开始时圆环回满。
3. 左上角 spellCard HUD：
   - 每个 elite/boss 一行。
   - 显示“怪物名:星星”。
   - 星星数量等于该怪物剩余或总 spellCard 数量，需先统一语义。建议显示剩余符卡数。
   - 当前符卡进行中时，在右侧显示剩余秒数。
4. spellCard 状态机：
   - 非符 1：血量从满降到蓝色阈值。
   - 符卡 1：血量回满，打空或时间到后进入下一非符。
   - 非符 2：同上。
   - 最后一步始终为符卡。
   - 最后符卡打空或时间到后，怪物正式阵亡。
5. 每个 elite/boss 独立推进 spellCard，不共享计时或血量。

### 测试清单

- elite/boss 出现时有圆环，minion 无圆环。
- 非符阶段圆环显示蓝色阈值。
- 到阈值后进入符卡，圆环瞬间回满。
- 符卡血量打空会进入下一阶段或死亡。
- 符卡时间到会进入下一阶段或死亡。
- 多个 elite 同时存在时，左上角显示多行且独立倒计时。
- 回滚后圆环比例、星星、倒计时一致。

## 阶段 9：money 道具、HUD 与计分

### 计划

1. 新增 money 道具，可复用 point 道具结构，也可抽象为 collectible：
   - `point_small | point_medium | point_large`。
   - `money_small | money_medium | money_large`。
2. money 视觉：
   - 金色主体。
   - 字符显示 `M`。
   - 小中大三种尺寸与当前 point 道具一致。
   - 金额常量先与 point 数值独立定义，当前可等同于 point。
3. 两位玩家独立 money，战局初始化时传入。
4. 新增合作计分常量目录，建议 `packages/constants/src/battle/collaborate-scoring.ts`：
   - 击败 minion/elite/boss 分数。
   - 拾取 point/money 分数。
   - 擦弹分数。
5. 右上角显示当前本玩家得分，在玩家得分下方显示本玩家money的数量。

### 测试清单

- money 道具显示为金色 `M`。
- money 小中大尺寸正确。
- Player1 拾取 money 只增加 Player1 money。
- Player2 拾取 money 只增加 Player2 money。
- 击败不同 class 怪物加不同分。
- 拾取道具和擦弹加分。
- 右上角得分和money数量随事件更新并进入回滚快照。

## 阶段 10：商店

### 计划

1. shop 由 mob spawner 定义出现时机。
2. 只有场上怪物全部击败后才显示商店；即使最长刷新下一波时间到达，也要等待清场。
3. 商店打开时战斗逻辑暂停用于购物：
   - 玩家、怪物、弹幕、道具、计时器不推进。
   - shop UI 输入仍然可用。
4. shop UI 三段结构：
   - 上：居中“商店#x”，居右显示两位玩家金额，高亮本地玩家金额。
   - 中：货物列表，包含基础物资和能力卡物资。
   - 下：就绪按钮和两个 checkbox。
   商店Ui应该定义在目录apps\frontend\src\battle\view\ui
5. 基础物资：
   - `+1命`。
   - `+1bomb`。
   - `+80 Point`。
6. 能力卡物资：
   - 给能力卡定义合作模式字段，例如 `collaborateShop`。
   - 字段包含重载效果、稀有度。
   - 稀有度：`common | uncommon | rare | disabled`。
   - 当前所有能力卡先设为 `common`。
   - 生命卡牌和符咒卡牌设为 `disabled`，不可出现。
7. 单次商店最多出现 3 个能力卡物资。
8. 按 spawner 配置的稀有度数量，从可选池随机不放回抽取。
9. 所有物资初始价格为 46。
10. 每种物资每名玩家只能购买一次。
11. 货物显示为上 icon、下金额；购买后翻牌，不可再次购买。
12. 鼠标悬浮货物时，本地玩家金额旁显示 `xx(-yy)`：
   - 买得起为绿色。
   - 买不起为红色。
13. 一位玩家购物完成后点击 ready，自己的 checkbox 勾选。
14. 两位玩家同时 ready 后退出商店，并立即刷新下一波。
15. 已经死亡的玩家进入商店后不得购买任何物品，而是恢复1命，立刻强制ready。

### 测试清单

- shop 节点到达后，如果场上仍有怪，不显示商店。
- 清场后显示商店，并暂停战斗逻辑。
- 商店暂停期间弹幕不移动、倒计时不减少、怪物不行动。
- 基础物资全部显示，价格为 46。
- 能力卡最多 3 个，disabled 卡不会出现。
- 能力卡随机抽取可回滚复现。
- 同一玩家不能重复购买同一货物。
- 两名玩家购买记录互不影响。
- 买得起和买不起的 hover 金额颜色正确。
- 单人 ready 不退出商店。
- 双人 ready 后退出商店并立即进入下一波。

## 阶段 11：replay 策略

### 计划

1. replay metadata 显示模式名：
   - 对战模式。
   - 合作模式。
2. 在合作 replay 完整实现前：
   - 合作模式不写入 replay。
   - UI 上提示“合作模式暂不保存回放”。
3. 未来完整支持时，replay 需要记录：
   - battle mode。
   - map id。
   - 两名玩家 loadout。
   - 初始 money。
   - spawner id 和初始配置。
   - 确定性 RNG 初始状态。
   - 每帧两位玩家输入。
   - 合作 extra snapshot 版本。

### 测试清单

- 对战模式 replay 保存不受影响。
- 合作模式结束后不保存 replay。
- replay 列表不会出现不完整合作 replay。
- 如果未来手动构造合作 replay，校验阶段能识别 metadata。

## 阶段 12：example-collaborate-mob-spawner

### 计划

新增 `example-collaborate-mob-spawner`，推荐文件：

- `packages/content/src/content/mob-spawner/collaborate/example-collaborate-mob-spawner.ts`。
- `packages/content/src/content/mob-spawner/collaborate/wave-types.ts`。
- `packages/content/src/content/mob-spawner/collaborate/spell-card.ts`。

整体流程：

1. 6 wave 小怪。
2. 商店 #1。
3. 1 elite：`笨蛋小精英`。
4. 6 wave 小怪。
5. 商店 #2。
6. 2 elite 同时出现：`朴实精英`、`开心精英`。
7. 商店 #3。
8. boss：`疯狂boss`。
9. 击败 boss 后胜利。

材质：

- minion：`example-fairy`、`horizontal-fairy`。
- elite：`elite-fairy`。
- boss：`elite-fairy`。

掉落规划建议：

- minion：小 point + 小 money；每 wave 最后一只掉中 point 或中 money。
- elite：大 point + 大 money，并额外掉若干中型道具。
- boss：大量大 point + 大 money；胜利触发时仍允许显示掉落或直接进入结算，需二选一。建议先直接进入结算，避免胜利后拾取状态复杂化。

弹幕设计建议：

- `笨蛋小精英`：
  - 非符 1：慢速扇形弹，按玩家位置轻微修正。
  - 符卡 1“冰晶玩笑”：环形弹加交错延迟，持续 20 秒。
  - 最后符卡“冻结星屑”：径向星形弹，间隔收紧，持续 24 秒。
- `朴实精英`：
  - 非符 1：规则三向散射。
  - 符卡“规整弹幕”：固定角度旋转环，持续 22 秒。
- `开心精英`：
  - 非符 1：左右横移并发射弧形弹。
  - 符卡“快乐扩散”：从自身和两侧虚拟点交替发射，持续 22 秒。
- `疯狂boss`：
  - 非符 1：大范围慢速压制弹。
  - 符卡 1“狂乱开幕”：多层旋转环，持续 25 秒。
  - 非符 2：瞄准两名玩家的交替狙击弹。
  - 符卡 2“失控乐园”：随机感弹幕，但必须由确定性 RNG 生成，持续 30 秒。
  - 最后符卡“疯狂终局”：环形弹、狙击弹、横向扫射组合，持续 35 秒。

### 测试清单

- spawner 流程严格为 6 wave -> shop -> elite -> 6 wave -> shop -> 2 elite -> shop -> boss。
- 每个 wave 的 mob id 稳定且回滚后不重复。
- 三个商店编号分别为 #1、#2、#3。
- 两个 elite 能同时存在并独立 spellCard。
- boss 最后符卡结束后触发胜利。
- 掉落 point 和 money 数量符合配置。
- 所有弹幕生成使用确定性 frame/RNG。

## 建议实施顺序

1. 模式类型、地图池、房间入口。
2. loadout 校验与合作地图进入战斗。
3. 友军伤害策略。
4. 大世界与 camera。
5. `CollaborateExtraState` 和 snapshot/hash。
6. wave spawner 抽象。
7. money、score、HUD。
8. elite/boss spellCard 状态机和渲染。
9. shop 逻辑与 UI。
10. example spawner 内容。
11. replay 禁保存与 metadata 展示。
12. 端到端联机、回滚、重连和回放补全。

## 端到端验收清单

- 两名玩家可以创建并进入合作模式房间。
- 合作模式下不能观战。
- 两名玩家各自选择两个角色，无能力卡进入战斗。
- 合作测试竞技场为 2400x1440 世界，camera 为本地玩家中心视窗并正确 clamp。
- 玩家之间子弹不互相伤害。
- Neutral 弹幕能伤害玩家。
- 小怪、elite、boss 按 wave 与 shop 流程出现。
- elite/boss 圆环、蓝色阈值、符卡星星、倒计时显示正确。
- money、point、score、graze 均按玩家独立结算。
- 商店暂停逻辑，双人 ready 后继续。
- boss 被击败后胜利。
- boss 未击败且双人阵亡后失败。
- 合作模式战局不保存 replay。
- 双端同输入下 hash 稳定，无新增 desync。
