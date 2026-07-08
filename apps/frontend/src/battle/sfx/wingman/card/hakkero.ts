import type { WingmanEmitterConfig } from "../types";
import { laser } from "../types";

export function hakkeroWingmen(): readonly WingmanEmitterConfig[] {
  return [laser({ forward: -36, side: 0 }, 0, 0xfff06a, 0x72e8ff, 0, 1)];
}
