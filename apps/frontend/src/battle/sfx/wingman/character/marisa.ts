import {
  CharacterWingmanProfile,
  hitCircleUnits,
  laser,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class MarisaWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    if (tier < 2) return [];
    return [
      laser({ forward: -hitCircleUnits(16), side: -hitCircleUnits(8) }, 0, 0xfff06a, 0x72e8ff, 0),
      laser({ forward: -hitCircleUnits(16), side: hitCircleUnits(8) }, 0, 0xfff06a, 0x72e8ff, 1),
    ];
  }
}
