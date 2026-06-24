import {
  CharacterWingmanProfile,
  hitCircleUnits,
  orb,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class YukariWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    if (tier < 3) return [];
    return [
      orb(
        { forward: -hitCircleUnits(16), side: -hitCircleUnits(8) },
        0,
        0xcaa6ff,
        0xffffff,
        0,
        0.9,
      ),
      orb(
        { forward: -hitCircleUnits(16), side: hitCircleUnits(8) },
        0,
        0xcaa6ff,
        0xffffff,
        1,
        0.9,
      ),
    ];
  }
}
