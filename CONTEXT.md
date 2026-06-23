# FXTZ Arena

FXTZ Arena is a deterministic bullet-hell battle game with local, online, training, and collaborate battle modes.

## Language

**Battle frame**:
One fixed-tick advance of a battle. A battle frame consumes the relevant player inputs and advances deterministic battle state exactly once.
_Avoid_: render frame, animation frame

**Battle frame pipeline**:
The battle concept that decides how one battle frame advances through transition sync, shop handling, running battle phases, and deterministic side effects.
_Avoid_: update loop, step wrapper
