import type { PlayerId } from "@repo/types";
import type { BattleInputState, BattleModelSnapshot } from "@repo/raid-logic";

import type { BattleSceneData } from "../../battle/loadout";

export type CanonicalFighterKey = "player" | "target";

export interface CombatRollbackRecord {
  readonly frame: number;
  readonly snapshot: BattleModelSnapshot;
}

export interface ReceivedSceneInput {
  readonly playerId: PlayerId;
  readonly frame: number;
  readonly ackFrame: number;
  readonly input: BattleInputState;
}

export interface PendingSceneInput {
  readonly frame: number;
  readonly input: BattleInputState;
}

export interface CombatSyncCallbacks {
  recordFrame(): void;
  getRollbackRecord(frame: number): CombatRollbackRecord | null;
  pruneRollbackHistoryAfter(frame: number): void;
  pruneRollbackHistoryBefore(frame: number): void;
  onRollback(): void;
  setStatusText(text: string): void;
  hideStatusText(): void;
  delay(ms: number, callback: () => void): void;
  finishBattle(winnerPlayerId: PlayerId): void;
}

export interface CombatSyncManagerOptions {
  readonly sceneData: BattleSceneData;
  readonly callbacks: CombatSyncCallbacks;
}
