import {
  CharacterWingmanProfile,
  hitCircleUnits,
  knife,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

export class SakuyaWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    if (tier < 2) return [];

    const sideOffset = hitCircleUnits(3);
    const sideGap = (8 + hitCircleUnits(1)) / 4;
    return [
      knife({ forward: hitCircleUnits(1), side: -sideOffset - sideGap }, -Math.PI / 6, 0x9fc7ff, 0xffffff, 2, 0.82),
      knife({ forward: hitCircleUnits(1), side: -sideOffset + sideGap }, -Math.PI / 6, 0x9fc7ff, 0xffffff, 3, 0.82),
      knife({ forward: hitCircleUnits(1), side: sideOffset - sideGap }, Math.PI / 6, 0x9fc7ff, 0xffffff, 4, 0.82),
      knife({ forward: hitCircleUnits(1), side: sideOffset + sideGap }, Math.PI / 6, 0x9fc7ff, 0xffffff, 5, 0.82),
    ];
  }
}
