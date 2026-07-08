import type { WingmanEmitterConfig } from "../types";
import { orb } from "../types";

export function multiShotWingmen(): readonly WingmanEmitterConfig[] {
  return [orb({ forward: -36, side: 0 }, 0, 0xff4f8f, 0xffffff, 2, 1)];
}
