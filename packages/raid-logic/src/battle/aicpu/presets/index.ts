import type { FighterState } from "@repo/types";

import { kaguyaReisenPreset } from "./preset_kaguya_reisen";
import { marisaNullPreset } from "./preset_marisa_null";
import { sakuyaCirnoPreset } from "./preset_sakuya_cirno";
import type { CpuPreset } from "./types";

const PRESETS: readonly CpuPreset[] = [
  sakuyaCirnoPreset,
  kaguyaReisenPreset,
  marisaNullPreset,
];

export function resolveCpuPreset(self: FighterState): CpuPreset | undefined {
  return PRESETS.find((preset) => preset.matches(self));
}

export function resetCpuPresets(): void {
  for (const preset of PRESETS) {
    preset.reset();
  }
}

export type { CpuPreset, CpuPresetContext, CpuPresetDecision } from "./types";
