import {
  CharacterWingmanProfile,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class EllenWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    void tier;
    return [];
  }
}
