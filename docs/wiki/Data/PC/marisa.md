# Marisa

| 字段 | 值 |
| --- | --- |
| id | `marisa` |
| cost | 5 |
| 职业 | `sniper` |
| 移速 | `high` |
| 射速 | `low` |
| 弹容 | 2 |
| 装填 | 90 tick，`reset_to_zero` + `commit_on_finish` |
| 弹速 | `high` |

## 普通攻击

`marisa_laser`：朝瞄准方向生成高速 `laser`，初始长度较短并逐 tick 增长，单 tick 伤害 5。

## Bomb

`marisa_master_spark`：4 秒 bomb。先清除周围 8 倍判定点半径内的弹幕，生成 1 秒清弹环；随后有 1 秒预告/前摇，再释放持续 3 秒的 `spark` 光束，单 tick 伤害 10。施放期间包含动作锁定、移速降低和延迟无敌。

