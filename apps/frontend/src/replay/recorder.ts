import type { BattleInputState } from "@repo/types";
import type { BattleLoadouts } from "../battle/loadout";
import type { ReplayBattleRecord, ReplayFile, ReplayFrame } from "./types";

export class ReplayRecorder {
  private battles: ReplayBattleRecord[] = [];
  private frames: ReplayFrame[] = [];
  private battleParams: {
    playerName: string;
    opponentName: string;
    mapId: string;
    stageIndex?: number;
    stageTitle?: string;
    loadouts?: BattleLoadouts;
  } | null = null;
  private recording = false;

  /** Start a new battle recording within the current session. */
  startBattle(params: {
    playerName: string;
    opponentName: string;
    mapId: string;
    stageIndex?: number;
    stageTitle?: string;
    /** Per-battle loadouts (used in story mode where loadouts differ per stage). */
    loadouts?: BattleLoadouts;
  }): void {
    this.battleParams = params;
    this.frames = [];
    this.recording = true;
  }

  /** Record input for both fighters on a single frame. */
  recordFrame(
    frame: number,
    player1Input: BattleInputState,
    player2Input: BattleInputState,
  ): void {
    if (!this.recording) return;
    this.frames.push({
      frame,
      player1: { ...player1Input },
      player2: { ...player2Input },
    });
  }

  /** End the current battle recording and store it. */
  endBattle(): void {
    if (!this.recording || !this.battleParams) return;
    this.battles.push({
      inputs: this.frames,
      stageIndex: this.battleParams.stageIndex,
      stageTitle: this.battleParams.stageTitle,
      playerName: this.battleParams.playerName,
      opponentName: this.battleParams.opponentName,
      mapId: this.battleParams.mapId,
      loadouts: this.battleParams.loadouts,
    });
    this.recording = false;
    this.frames = [];
    this.battleParams = null;
  }

  /** Build the final ReplayFile from all recorded battles. */
  finalize(metadata: {
    title: string;
    mode: ReplayFile["mode"];
    player1Id: string;
    player2Id: string;
    finalGlobalInputHash: string | null;
    loadouts: BattleLoadouts;
  }): ReplayFile {
    return {
      version: 1,
      title: metadata.title,
      timestamp: Date.now(),
      mode: metadata.mode,
      player1Id: metadata.player1Id,
      player2Id: metadata.player2Id,
      finalGlobalInputHash: metadata.finalGlobalInputHash,
      loadouts: metadata.loadouts,
      battles: this.battles,
    };
  }

  /** True if any battles have been recorded. */
  hasData(): boolean {
    return this.battles.length > 0 || this.frames.length > 0;
  }

  /** Reset all recorded data. */
  reset(): void {
    this.battles = [];
    this.frames = [];
    this.battleParams = null;
    this.recording = false;
  }

  /** Return the number of battles recorded so far. */
  battleCount(): number {
    return this.battles.length;
  }
}

/** Global singleton that persists across scenes (especially for story mode campaigns). */
export const globalReplayRecorder = new ReplayRecorder();
