import {
  CharacterWingmanProfile,
  hitCircleUnits,
  orb,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class ReisenWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    void tier;
    return [
      orb({ forward: hitCircleUnits(5), side: -hitCircleUnits(2) }, 0, 0xff6de7, 0x82f7ff, 0),
      orb({ forward: hitCircleUnits(5), side: hitCircleUnits(2) }, 0, 0xff6de7, 0x82f7ff, 1),
    ];
  }
}
