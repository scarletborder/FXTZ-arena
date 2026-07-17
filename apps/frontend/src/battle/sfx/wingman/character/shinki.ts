import {
  CharacterWingmanProfile,
  orb,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

const REAR_OFFSET = -48;
const TIER1_SIDE_OFFSETS = [-32, 32] as const;
const TIER3_SIDE_OFFSETS = [-72, -24, 24, 72] as const;

export class ShinkiWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    const sideOffsets =
      tier >= 3 ? TIER3_SIDE_OFFSETS : TIER1_SIDE_OFFSETS;
    return sideOffsets.map((side, index) =>
      orb(
        { forward: REAR_OFFSET, side },
        side < 0 ? Math.PI / 3 : -Math.PI / 3,
        0xd9a7ff,
        0xfff2a8,
        index,
        1.1,
      ),
    );
  }
}
