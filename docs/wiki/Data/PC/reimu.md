# Reimu

| 字段 | 值 |
| --- | --- |
| id | `reimu` |
| cost | 4 |
| 职业 | `suppress` |
| 移速 | `medium` |
| 射速 | `medium` |
| 弹容 | 5 |
| 装填 | 48 tick/发，`keep_current` + `commit_per_ammo` |
| 弹速 | `low` |

## 普通攻击

`reimu_homing_shot`：朝瞄准方向发射 3 枚 `orb`，角度为 -45 度、0 度、+45 度。每枚弹为低速诱导弹，诱导 2 秒，伤害 15。

## Bomb

`reimu_clear_bomb`：进入 bomb 状态，获得 2 秒无敌，清除周围 6 倍判定点半径内的弹幕，生成清弹环，并额外生成 12 枚围绕自身的诱导弹。

