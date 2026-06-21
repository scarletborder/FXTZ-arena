import {
  CharacterWingmanProfile,
  hitCircleUnits,
  orb,
  polar,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class ReimuWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    void tier;
    return [
      orb(polar(hitCircleUnits(8), -Math.PI / 4), -Math.PI / 4, 0xff4f8f, 0xffffff, 0),
      orb(polar(hitCircleUnits(8), Math.PI / 4), Math.PI / 4, 0xff4f8f, 0xffffff, 1),
    ];
  }
}
