import {
  CharacterWingmanProfile,
  diamond,
  hitCircleUnits,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class CirnoWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    void tier;
    return [
      diamond({ forward: -hitCircleUnits(15), side: -hitCircleUnits(10) }, 0, 0x9be8ff, 0xffffff, 0),
      diamond({ forward: -hitCircleUnits(15), side: hitCircleUnits(10) }, 0, 0x9be8ff, 0xffffff, 1),
    ];
  }
}
