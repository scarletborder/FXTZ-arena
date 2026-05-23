# Welcome to the FXTZ-arena wiki!

这里是 FXTZ-arena 的游戏 wiki 根目录，面向玩家说明游戏规则，也面向开发者记录战局逻辑、回滚同步和内容扩展方式。

## 游戏性

- [操作说明](./Button-Control.md)：说明游戏基本操作、快捷键和鼠标操作。
- 配装说明
  - [配装 cost](./Select/Select-Cost.md)：介绍选择配装阶段的 cost 上限机制。
  - [角色](./Select/Character.md)：介绍不同职业的角色。
  - [能力卡](./Select/Ability-Card.md)：介绍能力卡的种类和作用。
- 战局机制
  - [装填](./Mechanical/Reload.md)：介绍战局中不同类型的装填机制。
  - [中立怪物](./Mechanical/Mobs.md)：介绍中立怪物的生成机制。
  - Other More...
- 游戏数据
  - [机体说明](./Data/PC/index.md)：介绍每一种机体的数据，包括移动速度、普通攻击、bomb、cost 和职业等。
  - [能力卡说明](./Data/Ability-Card/index.md)：介绍每一种卡片的 cost、种类和效果。

## 开发相关

- 开发概念介绍
  - [战局循环介绍](./Core/Game-Step.md)：当前 `raid-logic` 的更新逻辑和步进方式，包括各阶段职责，以及帧同步和回滚注意事项。
  - [回滚和状态恢复](./Core/rollback.md)：说明回滚机制、状态恢复、确认帧 hash 的内容，以及未来扩展方式。
  - [Fixed-point、数学计算和移动处理](./Core/Fixed-Point-and-Math.md)：说明 fixed-point 使用边界、浮点数注意事项、移动处理和常见数学计算模式。
- 拓展内容
  - [如何创建战局 Entity](./Expansion/how-to-create-entity.md)：如何创建 bullet、laser、character、mob 等战局实体，以及帧同步注意事项。
  - [如何开发新角色](./Expansion/how-to-create-new-character.md)：如何定义角色、设置 cost/名称/id、普通射击和 bomb 效果，以及回滚注意事项。
  - [如何创建和应用 sfx](./Expansion/how-to-create-new-sfx.md)：如何创建和调用 sfx。
