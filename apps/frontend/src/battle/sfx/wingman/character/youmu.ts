import {
  CharacterWingmanProfile,
  hitCircleUnits,
  knife,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class YoumuWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    void tier;
    return [
      knife({ forward: -hitCircleUnits(5), side: 0 }, 0, 0xbfffea, 0xffffff, 0),
    ];
  }
}
