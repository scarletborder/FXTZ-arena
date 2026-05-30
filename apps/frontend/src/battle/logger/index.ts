import type { PlayerId } from "@repo/types";
import type { BattleInputState, BattleOutputFrame } from "@repo/raid-logic";

import type { BattleSceneData } from "../loadout";
import type {
  CombatConfirmedFrameInputRecord,
  CombatFrameInputRecord,
} from "../../network/combat";

export interface DebugFrameLogRecord {
  readonly sequence: number;
  readonly frame: number;
  readonly hash: string;
  readonly events: readonly string[];
  readonly localConfirmedFrame: number;
  readonly player1Input: BattleInputState | null;
  readonly player2Input: BattleInputState | null;
}

export interface AuthoritativeFrameLogRecord extends DebugFrameLogRecord {
  readonly authoritative: true;
  readonly confirmedThrough: number;
}

export interface DebugHashLogRow {
  readonly frame: number;
  readonly hash: string;
}

export interface DebugLogExportParams {
  readonly sceneData: BattleSceneData;
  readonly winnerPlayerId: PlayerId | null;
  readonly localPlayerId: PlayerId | null;
  readonly runtimeFrame: number;
  readonly targetFrame: number;
  readonly serverConfirmedFrame: number | null;
  readonly authoritativeFrame: number;
  readonly localConfirmedFrame: number;
  readonly finalGlobalHash: string | null;
  readonly sampledConfirmedFrames: {
    readonly from: number;
    readonly to: number;
    readonly count: number;
    readonly complete: boolean;
  };
}

export class BattleDebugLogger {
  private readonly stepInputs = new Map<number, CombatFrameInputRecord>();
  private readonly confirmedInputs = new Map<number, CombatConfirmedFrameInputRecord>();
  private readonly frameLog = new Map<number, DebugFrameLogRecord>();
  private readonly confirmedFrameLog = new Map<number, AuthoritativeFrameLogRecord>();
  private readonly frameRevisions: DebugFrameLogRecord[] = [];
  private sequence = 0;
  private confirmedSequence = 0;

  reset(): void {
    this.stepInputs.clear();
    this.confirmedInputs.clear();
    this.frameLog.clear();
    this.confirmedFrameLog.clear();
    this.frameRevisions.length = 0;
    this.sequence = 0;
    this.confirmedSequence = 0;
  }

  recordStepInputs(record: CombatFrameInputRecord, enabled: boolean): void {
    if (!enabled) {
      return;
    }

    this.stepInputs.set(record.frame, {
      frame: record.frame,
      player: cloneDebugInput(record.player),
      target: cloneDebugInput(record.target),
    });
  }

  recordConfirmedInputs(record: CombatConfirmedFrameInputRecord, enabled: boolean): void {
    if (!enabled) {
      return;
    }

    this.confirmedInputs.set(record.frame, {
      frame: record.frame,
      confirmedThrough: record.confirmedThrough,
      player: cloneDebugInput(record.player),
      target: cloneDebugInput(record.target),
    });
  }

  recordFrame(
    output: BattleOutputFrame,
    params: {
      readonly enabled: boolean;
      readonly localConfirmedFrame: number;
    },
  ): DebugFrameLogRecord | null {
    if (!params.enabled) {
      return null;
    }

    const inputRecord = this.stepInputs.get(output.frame) ?? null;
    const logRecord: DebugFrameLogRecord = {
      sequence: this.sequence,
      frame: output.frame,
      hash: output.hashHex,
      events: output.events.map((event) => event.type),
      localConfirmedFrame: params.localConfirmedFrame,
      player1Input: inputRecord ? cloneDebugInput(inputRecord.player) : null,
      player2Input: inputRecord ? cloneDebugInput(inputRecord.target) : null,
    };
    this.sequence += 1;
    this.frameLog.set(output.frame, logRecord);
    this.frameRevisions.push(logRecord);
    return logRecord;
  }

  recordConfirmedFrame(params: {
    readonly enabled: boolean;
    readonly frame: number;
    readonly hash: string;
    readonly confirmedThrough: number;
  }): void {
    if (!params.enabled) {
      return;
    }
    if (params.confirmedThrough < params.frame) {
      return;
    }

    const source = this.frameLog.get(params.frame) ?? null;
    const inputRecord = this.confirmedInputs.get(params.frame) ?? null;
    this.confirmedFrameLog.set(params.frame, {
      sequence: this.confirmedSequence,
      frame: params.frame,
      hash: params.hash,
      events: source?.events ?? ["confirmed"],
      localConfirmedFrame: params.confirmedThrough,
      authoritative: true,
      confirmedThrough: params.confirmedThrough,
      player1Input: inputRecord ? cloneDebugInput(inputRecord.player) : null,
      player2Input: inputRecord ? cloneDebugInput(inputRecord.target) : null,
    });
    this.confirmedSequence += 1;
  }

  pruneAfter(frame: number): void {
    for (const key of this.stepInputs.keys()) {
      if (key > frame) {
        this.stepInputs.delete(key);
      }
    }
    for (const key of this.confirmedInputs.keys()) {
      if (key > frame) {
        this.confirmedInputs.delete(key);
      }
    }
    for (const key of this.frameLog.keys()) {
      if (key > frame) {
        this.frameLog.delete(key);
      }
    }
  }

  getConfirmedRows(targetFrame: number): DebugHashLogRow[] {
    return Array.from(this.confirmedFrameLog.values())
      .filter((record) => record.frame >= 0 && record.frame <= targetFrame)
      .sort((left, right) => left.frame - right.frame)
      .map((record) => ({
        frame: record.frame,
        hash: record.hash,
      }));
  }

  writeFile(params: DebugLogExportParams): string | null {
    const frames = Array.from(this.confirmedFrameLog.values())
      .filter((record) => record.authoritative && record.frame >= 0 && record.frame <= params.authoritativeFrame)
      .sort((left, right) => left.frame - right.frame);
    const payload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      mode: params.sceneData.mode ?? "offline",
      battleId: params.sceneData.battleConfig?.battleId ?? null,
      localPlayerId: params.localPlayerId,
      winnerPlayerId: params.winnerPlayerId,
      runtimeFrame: params.runtimeFrame,
      localConfirmedFrame: params.localConfirmedFrame,
      serverConfirmedFrame: params.serverConfirmedFrame,
      targetFrame: params.targetFrame,
      authoritativeFrame: params.authoritativeFrame,
      finalGlobalHash: params.finalGlobalHash,
      sampledConfirmedFrames: params.sampledConfirmedFrames,
      frames,
    };
    const filename = createDebugLogFilename(params.sceneData, params.localPlayerId, params.targetFrame);
    const text = `${JSON.stringify(payload, null, 2)}\n`;

    if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
      console.warn(`[FXTZ] Debug log file is unavailable in this runtime: ${filename}`);
      console.log(text);
      return null;
    }

    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log(`[FXTZ] Debug log file: ${filename}`);
    return filename;
  }
}

function cloneDebugInput(input: BattleInputState): BattleInputState {
  return {
    moveX: input.moveX,
    moveY: input.moveY,
    aimX: input.aimX,
    aimY: input.aimY,
    shootPressed: input.shootPressed,
    bombPressed: input.bombPressed,
    activeCardPressed: input.activeCardPressed,
    reloadPressed: input.reloadPressed,
    alternateHeld: input.alternateHeld,
    infoHeld: input.infoHeld,
  };
}

function createDebugLogFilename(sceneData: BattleSceneData, localPlayerId: PlayerId | null, targetFrame: number): string {
  const battleId = sanitizeFilenamePart(sceneData.battleConfig?.battleId ?? "local");
  const playerId = sanitizeFilenamePart(localPlayerId ?? sceneData.localPlayerId ?? "offline");
  return `fxtz-debug-${battleId}-${playerId}-frame-${targetFrame}-${Date.now()}.json`;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 80) || "unknown";
}
