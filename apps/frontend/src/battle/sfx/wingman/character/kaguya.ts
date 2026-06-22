import {
  CharacterWingmanProfile,
  orb,
  type PointPowerTier,
  type WingmanEmitterConfig,
} from "../types";

const TWO_PI = Math.PI * 2;

export class KaguyaWingmanProfile extends CharacterWingmanProfile {
  wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[] {
    return [];
    const count = tier === 1 ? 2 : tier === 2 ? 3 : tier === 3 ? 5 : 9;
    const firstAngle = tier === 1 ? -Math.PI / 2 : Math.PI;
    return Array.from({ length: count }, (_, index) =>
      orb(
        {
          radius: 64,
          angleOffset: firstAngle + (TWO_PI * index) / count,
          angularSpeed: TWO_PI / 90,
        },
        0,
        0xf4d37a,
        0xffffff,
        index,
        1.15,
      ),
    );
  }
}
