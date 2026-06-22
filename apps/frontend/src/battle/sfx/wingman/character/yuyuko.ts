import {
  CharacterWingmanProfile,
  orb,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

const REAR_FORWARD = -80;
const REAR_SIDE = 40;
const INNER_FORWARD = -50;
const INNER_SIDE = 70;
const OUTER_SHOT_ANGLE = Math.PI / 12;

export class YuyukoWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    if (tier < 2) return [];
    const wingmen: WingmanEmitterConfig[] = [
      orb({ forward: REAR_FORWARD, side: -REAR_SIDE }, tier >= 3 ? -OUTER_SHOT_ANGLE : 0, 0xffb7ef, 0xb996ff, 0, 1.05),
      orb({ forward: REAR_FORWARD, side: REAR_SIDE }, tier >= 3 ? OUTER_SHOT_ANGLE : 0, 0xffb7ef, 0xb996ff, 1, 1.05),
    ];
    if (tier >= 4) {
      wingmen.push(
        orb({ forward: INNER_FORWARD, side: -INNER_SIDE }, -OUTER_SHOT_ANGLE, 0xdcc1ff, 0xff8ed8, 2, 0.95),
        orb({ forward: INNER_FORWARD, side: INNER_SIDE }, OUTER_SHOT_ANGLE, 0xdcc1ff, 0xff8ed8, 3, 0.95),
      );
    }
    return wingmen;
  }
}
