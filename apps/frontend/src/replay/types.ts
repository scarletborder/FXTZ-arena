import type { BattleInputState, EnumDifficulty } from "@repo/types";
import type { BattleLoadouts } from "../battle/loadout";

export interface ReplayFrame {
  readonly frame: number;
  readonly player1: BattleInputState;
  readonly player2: BattleInputState;
}

export interface ReplayBattleRecord {
  readonly inputs: ReplayFrame[];
  readonly stageIndex?: number;
  readonly stageTitle?: string;
  readonly playerName: string;
  readonly opponentName: string;
  readonly mapId: string;
  readonly playerInitPoint: number;
  readonly opponentInitPoint: number;
  /**
   * Per-battle loadouts. For story mode replays, each stage may have a
   * different player loadout (rewards gained between battles) and opponent.
   * Falls back to ReplayFile.loadouts when absent.
   */
  readonly loadouts?: BattleLoadouts;
}

export interface ReplayFile {
  readonly version: 1;
  readonly appVersion?: string;
  readonly title: string;
  readonly timestamp: number;
  readonly mode: "ai" | "online" | "local" | "story";
  readonly difficulty?: EnumDifficulty;
  readonly player1Id: string;
  readonly player2Id: string;
  readonly finalGlobalInputHash: string | null;
  readonly loadouts: BattleLoadouts;
  readonly battles: ReplayBattleRecord[];
}

export interface ReplaySlotInfo {
  readonly slotIndex: number;
  readonly title: string;
  readonly timestamp: number;
  readonly mode: ReplayFile["mode"];
  readonly battleCount: number;
  readonly player1Id: string;
  readonly player2Id: string;
}

export const SLOTS_PER_PAGE = 16;

export interface ReplayRecordData {
  readonly replay: ReplayFile;
  readonly currentPage?: number;
  /** Scene to return to when cancelling save. Defaults to "battle-start". */
  readonly returnScene?: import("../menu/shared").SceneKey;
}

export interface ReplayPlayData {
  readonly replay: ReplayFile;
  readonly battleIndex: number;
  readonly speed: number;
}
