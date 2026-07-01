import {
  CharacterWingmanProfile,
  hitCircleUnits,
  laser,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class IkuWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    if (tier < 2) return [];

    const sideOffsets =
      tier >= 4
        ? [
            -hitCircleUnits(16),
            -hitCircleUnits(8),
            hitCircleUnits(8),
            hitCircleUnits(16),
          ]
        : [-hitCircleUnits(8), hitCircleUnits(8)];

    return sideOffsets.map((side, index) =>
      laser(
        { forward: -hitCircleUnits(16), side },
        0,
        0xf6f0ff,
        0x7fe7ff,
        index,
        0.92,
      ),
    );
  }
}
