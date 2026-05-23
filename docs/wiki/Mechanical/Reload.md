# 装填

角色拥有独立弹药容量和装填策略。装填由角色定义决定，输入只表达“本帧是否按下装填”。

## 策略字段

| 字段 | 说明 |
| --- | --- |
| `ammoCapacity` | 当前角色弹药上限。 |
| `reloadTicksPerAmmo` | 单发或整段装填需要的 tick 数。60 tick = 1 秒。 |
| `reloadStartPolicy` | 开始装填时如何处理已有进度。 |
| `reloadCommitPolicy` | 装填完成时如何提交弹药。 |

## 当前角色装填

| 角色 | 弹容 | 单次装填 | 开始策略 | 生效策略 |
| --- | --- | --- | --- | --- |
| `reimu` | 5 | 48 tick | `keep_current` | `commit_per_ammo` |
| `marisa` | 2 | 90 tick | `reset_to_zero` | `commit_on_finish` |
| `sakuya` | 3 | 60 tick | `keep_current` | `commit_on_finish` |

## 帧同步注意

- 装填进度、弹药数和锁定计时器都会影响战局结果，必须进入 snapshot/hash。
- 不要用真实时间计算装填；只能使用 tick 计数。
- 新增装填策略时，需要补回滚重放测试，确认 snapshot -> step -> hash 稳定。

