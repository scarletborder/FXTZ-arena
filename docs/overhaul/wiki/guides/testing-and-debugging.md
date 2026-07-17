# 测试与排错

## 分层验证

| 修改范围                           | 最低验证                                               |
| ---------------------------------- | ------------------------------------------------------ |
| types/constants/content definition | 对应 `check-types`、lint、查询/校验测试                |
| 角色/卡牌/投射物/Mob 逻辑          | raid-logic 单测 + snapshot/rollback 测试               |
| 前端 session/view/input            | frontend 目标测试 + typecheck + lint                   |
| netcode/protocol                   | frontend combat 测试 + server 测试 + types binary 测试 |
| 跨包接口                           | 根 `pnpm test`、`pnpm check-types`、`pnpm lint`        |

## 命令

```powershell
pnpm --filter @repo/raid-logic test
pnpm --filter frontend test
pnpm --filter dedicated-server test
pnpm test
pnpm check-types
pnpm lint
```

测试单文件可在目标 workspace 使用 Vitest 路径过滤，提交前仍应运行受影响 workspace 的完整测试。

## 战斗逻辑排错

先固定 seed、loadout、map 和输入序列，再比较：

1. 首个不同 frame；
2. `hashComponentsDebug()` 的首个不同分量；
3. 该帧双方实际输入与 aim-consuming 标志；
4. 恢复点 snapshot 是否含新增隐藏状态；
5. 集合 ID、顺序和 timer 是否一致。

不要从最终画面倒推全部逻辑；首个不同帧通常比最终全局 hash 更有定位价值。

## 回滚一致性矩阵

`apps/frontend/src/network/combat/rollback-consistency` 提供角色和能力卡矩阵，使用延迟 profile 驱动两端模拟并比较最终结果。新增内容应进入枚举查询后自动覆盖，特殊输入序列则需要扩充 harness/case。

重点检查：

- 预测输入被真实输入替换后能重演；
- snapshot restore 不遗漏 familiar/spawner/ticker；
- aim 只在消费帧参与比较；
- confirmed hash 连续且双方一致。

## 日志与哈希

开启战斗 debug 后，`BattleRollbackHistory` 和 logger 保存帧 snapshot、局部 hash、输入与 confirmed BLAKE3 摘要。日志只能用于诊断，不应改变模拟分支。

若双方最终 hash 不同：先比 confirmed frame 是否相同，再比 confirmed input hash。输入 hash 已不同意味着网络/规范化/确认边界问题；输入相同而状态 hash 不同则更可能是确定性状态或恢复遗漏。

## 架构守卫

`apps/frontend/src/battle/architecture.test.ts` 防止纯 session 导入 Phaser、combat 导入 Phaser，以及 view 穿透网络/可变 runtime。测试失败时应调整模块归属或注入窄接口，不要放宽规则来迁就一次导入。

## 文档校验

本 Wiki 的链接和源码路径应在重构同一提交中更新。删除生产代码时，也要检查是否只剩兼容 API，并在[实体与状态模型](../domain/entity-and-state-model.md)更新边界说明。
