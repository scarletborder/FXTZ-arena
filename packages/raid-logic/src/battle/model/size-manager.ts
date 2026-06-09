import {
  COLLABORATE_ARENA_BOUNDS,
  DEFAULT_ARENA_BOUNDS,
  normalizeArenaBounds,
  type ArenaBounds,
} from "@repo/constants";
import type { BattleRoomMode } from "@repo/types";

export class BattleSizeManager {
  readonly arenaBounds: ArenaBounds;

  constructor(params: {
    readonly battleMode: BattleRoomMode;
    readonly arenaBounds?: Partial<ArenaBounds>;
  }) {
    this.arenaBounds = normalizeArenaBounds(
      params.arenaBounds ??
        (params.battleMode === "collaborate"
          ? COLLABORATE_ARENA_BOUNDS
          : DEFAULT_ARENA_BOUNDS),
    );
  }

  projectileWorldPadding(): number {
    return this.arenaBounds.width * 0.2;
  }
}
