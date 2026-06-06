import type { FighterState } from "@repo/content";

import { marisaNullPreset } from "./preset_marisa_null";
import type { CpuPreset } from "./types";

const PRESETS: readonly CpuPreset[] = [marisaNullPreset];

export function resolveCpuPreset(self: FighterState): CpuPreset | undefined {
  return PRESETS.find((preset) => preset.matches(self));
}

export function resetCpuPresets(): void {
  for (const preset of PRESETS) {
    preset.reset();
  }
}

export type { CpuPreset, CpuPresetContext, CpuPresetDecision } from "./types";
