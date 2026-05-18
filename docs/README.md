# 肥乡天则: ARENA 开发文档索引

本文档集把当前策划稿拆成可执行的开发计划、规则规格与实现约束。后续实现时，优先保持 `types` 中的数据结构、`raid-logic` 中的确定性战局逻辑、`frontend` 中的 Phaser 渲染、`dedicated-server` 中的房间与联机协议互相解耦。

## 文档列表

- [开发路线图](./development-plan.md)：里程碑、任务拆分、验收标准。
- [游戏规则规格](./rules.md)：战局规则、输入、角色、能力卡、数值单位。
- [技术架构与网络同步](./architecture-and-netcode.md)：monorepo、Lockstep/Rollback、mock server、确定性约束。
- [Scene 与 UI 规格](./scenes-and-ui.md)：首页、设置、图鉴、战斗入口、选择、加载、战局、结算。
- [内容数据规格](./content-data.md)：角色、能力卡、地图、房间等共享数据建模建议。

## 核心原则

1. 游戏逻辑必须完全基于 frame tick 推进，默认 60fps。
2. 所有可影响战局结果的计算必须确定性，禁止依赖真实时间、浮点随机或渲染状态。
3. 前端只负责输入采集、渲染和 UI；权威战局状态由 `raid-logic` 的模拟结果产生。
4. 联机、人机、靶场共用同一套输入队列和输出队列，只替换生产者与消费者。
5. 测试版渲染全部由 Phaser 完成，不使用 React。
