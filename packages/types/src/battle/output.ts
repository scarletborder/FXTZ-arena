import type { BattleModelSnapshot } from "./model-snapshot";
import type { BattleOutputState } from "./runtime-state";

export type BattleOutputEvent =
  | { readonly type: "snapshot_restored"; readonly frame: number }
  | { readonly type: "frame_advanced"; readonly frame: number };

export interface BattleOutputFrame {
  readonly frame: number;
  readonly hash: number;
  readonly hashHex: string;
  readonly state: BattleOutputState;
  readonly snapshot: BattleModelSnapshot;
  readonly events: readonly BattleOutputEvent[];
}
