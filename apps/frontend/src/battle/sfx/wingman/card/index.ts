import type { FighterState } from "@repo/raid-logic";

import { multiShotWingmen } from "./multi-shot";
import type { PointPowerTier, WingmanEmitterConfig } from "../types";

const CARD_WINGMEN: Partial<
  Record<
    FighterState["abilityCards"][number]["id"],
    (tier: PointPowerTier) => readonly WingmanEmitterConfig[]
  >
> = {
  multi_shot: multiShotWingmen,
};

export function abilityCardWingmen(
  fighter: FighterState,
  tier: PointPowerTier,
): readonly WingmanEmitterConfig[] {
  return fighter.abilityCards.flatMap(
    (card) => CARD_WINGMEN[card.id]?.(tier) ?? [],
  );
}
