import type { BattleInputState, PlayerId } from "@repo/types";
import { APP_BUILD_LABEL } from "@repo/constants";
import type { BattleLoadouts } from "../battle/loadout";
import type { ReplayBattleRecord, ReplayFile, ReplayFrame } from "./types";
import { finalReplayInputHash } from "./input-hash";

export class ReplayRecorder {
  private battles: ReplayBattleRecord[] = [];
  private frames: ReplayFrame[] = [];
  private battleParams: {
    playerName: string;
    opponentName: string;
    mapId: string;
    playerInitPoint: number;
    opponentInitPoint: number;
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
    playerInitPoint?: number;
    opponentInitPoint?: number;
    stageIndex?: number;
    stageTitle?: string;
    /** Per-battle loadouts (used in story mode where loadouts differ per stage). */
    loadouts?: BattleLoadouts;
  }): void {
    this.battleParams = {
      ...params,
      playerInitPoint: normalizeInitPoint(params.playerInitPoint),
      opponentInitPoint: normalizeInitPoint(params.opponentInitPoint),
    };
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
  endBattle(winnerPlayerId?: Exclude<PlayerId, "Neutral">): void {
    if (!this.recording || !this.battleParams) return;
    this.battles.push({
      inputs: this.frames,
      winnerPlayerId,
      stageIndex: this.battleParams.stageIndex,
      stageTitle: this.battleParams.stageTitle,
      playerName: this.battleParams.playerName,
      opponentName: this.battleParams.opponentName,
      mapId: this.battleParams.mapId,
      playerInitPoint: this.battleParams.playerInitPoint,
      opponentInitPoint: this.battleParams.opponentInitPoint,
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
    difficulty?: ReplayFile["difficulty"];
    player1Id: string;
    player2Id: string;
    winnerPlayerId?: Exclude<PlayerId, "Neutral">;
    finalGlobalInputHash: string | null;
    loadouts: BattleLoadouts;
  }): ReplayFile {
    const recordedInputHash = finalReplayInputHash(
      this.battles.flatMap((battle) => battle.inputs),
    );
    return {
      version: 1,
      appVersion: APP_BUILD_LABEL,
      title: metadata.title,
      timestamp: Date.now(),
      mode: metadata.mode,
      difficulty: metadata.difficulty,
      player1Id: metadata.player1Id,
      player2Id: metadata.player2Id,
      winnerPlayerId: metadata.winnerPlayerId,
      finalGlobalInputHash: metadata.finalGlobalInputHash ?? recordedInputHash,
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

function normalizeInitPoint(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}
