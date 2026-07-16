import type { PlayerId } from "@repo/types";
import {
  type BattleInputState,
  type BattleModelSnapshot,
  type BattleOutputFrame,
  ConfirmedFrameHashAccumulator,
} from "@repo/raid-logic";

import type { BattleSceneData } from "../loadout";
import type {
  CombatConfirmedFrameInputRecord,
  CombatFrameInputRecord,
} from "../../network/combat";

const DEBUG_HISTORY_LIMIT = 3600;

interface DebugFrameRecord {
  readonly frame: number;
  readonly hash: string;
  readonly snapshot: BattleModelSnapshot;
}

export interface BattleRollbackLogRecord {
  readonly events: readonly string[];
  readonly localConfirmedFrame: number;
  readonly isAimConsuming: boolean;
  readonly player1Input: BattleInputState | null;
  readonly player2Input: BattleInputState | null;
}

export interface BattleRollbackLogger {
  reset(): void;
  recordStepInputs(record: CombatFrameInputRecord, enabled: boolean): void;
  recordConfirmedInputs(
    record: CombatConfirmedFrameInputRecord,
    enabled: boolean,
  ): void;
  recordFrame(
    output: BattleOutputFrame,
    params: {
      readonly enabled: boolean;
      readonly localConfirmedFrame: number;
      readonly isAimConsuming: boolean;
    },
  ): BattleRollbackLogRecord | null;
  recordConfirmedFrame(params: {
    readonly enabled: boolean;
    readonly frame: number;
    readonly hash: string;
    readonly confirmedThrough: number;
  }): { readonly inputHash: string } | null;
  pruneAfter(frame: number): void;
  getConfirmedRows(targetFrame: number): BattleHashBundle["rows"];
  writeFile(params: BattleDebugLogExportParams): string | null;
}

export interface BattleHashBundle {
  readonly finalGlobalHash: string | null;
  readonly finalGlobalInputHash: string | null;
  readonly sampled: boolean;
  readonly sampledUpTo: number;
  readonly sampledCount: number;
  readonly localConfirmedFrame: number;
  readonly serverConfirmedFrame: number;
  readonly targetFrame: number;
  readonly authoritativeFrame: number;
  readonly rows: Array<{
    readonly frame: number;
    readonly hash: string;
    readonly inputHash: string;
  }>;
}

export interface BattleHashLogContext {
  readonly winnerPlayerId: PlayerId | null;
  readonly localPlayerId: PlayerId | null;
  readonly runtimeFrame: number;
  readonly targetFrame: number;
  readonly serverConfirmedFrame: number | null;
  readonly authoritativeFrame: number;
  readonly localConfirmedFrame: number;
  readonly sampledConfirmedFrames: {
    readonly from: number;
    readonly to: number;
    readonly count: number;
    readonly complete: boolean;
  };
}

export interface BattleDebugLogExportParams extends BattleHashLogContext {
  readonly sceneData: BattleSceneData;
  readonly finalGlobalHash: string | null;
  readonly finalGlobalInputHash: string | null;
}

export interface BattleRollbackHistoryConfig {
  readonly sceneData: BattleSceneData;
  readonly debug: boolean;
  readonly logger: BattleRollbackLogger;
}

export class BattleRollbackHistory {
  private sceneData: BattleSceneData = {};
  private logger!: BattleRollbackLogger;
  private enabled = false;
  private readonly rollbackHistory = new Map<number, DebugFrameRecord>();
  private debugConfirmedHash: ConfirmedFrameHashAccumulator | undefined;
  private debugConfirmedInputHash: ConfirmedFrameHashAccumulator | undefined;
  private debugHashBacklog: Map<number, string> | undefined;
  private debugHistory: Map<number, DebugFrameRecord> | undefined;
  private debugLogger: BattleRollbackLogger | undefined;

  constructor(config: BattleRollbackHistoryConfig) {
    this.reset(config);
  }

  reset(config: BattleRollbackHistoryConfig): void {
    this.sceneData = config.sceneData;
    this.logger = config.logger;
    this.rollbackHistory.clear();
    this.disableDebugState();
    this.setDebugEnabled(config.debug);
  }

  setDebugEnabled(enabled: boolean): void {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;
    if (enabled) {
      this.debugConfirmedHash = new ConfirmedFrameHashAccumulator();
      this.debugConfirmedInputHash = new ConfirmedFrameHashAccumulator();
      this.debugHashBacklog = new Map<number, string>();
      this.debugHistory = new Map<number, DebugFrameRecord>();
      this.logger.reset();
      this.debugLogger = this.logger;
    } else {
      this.disableDebugState();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  recordRollbackSnapshot(frame: number, snapshot: BattleModelSnapshot): void {
    this.rollbackHistory.set(frame, {
      frame,
      hash: "",
      snapshot,
    });
  }

  getRollbackRecord(
    frame: number,
  ): { readonly frame: number; readonly snapshot: BattleModelSnapshot } | null {
    const record = this.rollbackHistory.get(frame);
    return record ? { frame: record.frame, snapshot: record.snapshot } : null;
  }

  recordStepInputs(record: {
    readonly frame: number;
    readonly player: BattleInputState;
    readonly target: BattleInputState;
  }): void {
    this.debugLogger?.recordStepInputs(record, this.enabled);
  }

  recordConfirmedInputs(record: {
    readonly frame: number;
    readonly confirmedThrough: number;
    readonly player: BattleInputState;
    readonly target: BattleInputState;
  }): void {
    this.debugLogger?.recordConfirmedInputs(record, this.enabled);
  }

  recordFrame(
    output: BattleOutputFrame,
    params: {
      readonly localConfirmedFrame: number;
      readonly isAimConsuming: boolean;
    },
  ): BattleRollbackLogRecord | null {
    if (!this.enabled) {
      return null;
    }
    const logger = this.debugLogger;
    if (!logger || !this.debugHistory || !this.debugHashBacklog) {
      return null;
    }

    const logRecord = logger.recordFrame(output, {
      enabled: true,
      localConfirmedFrame: params.localConfirmedFrame,
      isAimConsuming: params.isAimConsuming,
    });
    this.debugHistory.set(output.frame, {
      frame: output.frame,
      hash: output.hashHex,
      snapshot: output.snapshot,
    });
    if (output.frame > this.requireConfirmedHash().lastSampledFrame) {
      this.debugHashBacklog.set(output.frame, output.hashHex);
    }
    return logRecord;
  }

  getRecentDebugHashes(
    count = 50,
  ): Array<{ readonly frame: number; readonly hash: string }> {
    const history = this.debugHistory;
    if (!this.enabled || !history) {
      return [];
    }
    const maxFrame = Math.max(0, this.getLatestFrame(history));
    const startFrame = Math.max(0, maxFrame - count + 1);
    return Array.from(history.values())
      .filter(
        (record) => record.frame >= startFrame && record.frame <= maxFrame,
      )
      .sort((left, right) => left.frame - right.frame)
      .map((record) => ({
        frame: record.frame,
        hash: record.hash,
      }));
  }

  getDebugHash(
    frame: number,
  ): { readonly frame: number; readonly hash: string } | null {
    const history = this.debugHistory;
    if (!this.enabled || !history) {
      return null;
    }
    const record = history.get(frame);
    return record ? { frame: record.frame, hash: record.hash } : null;
  }

  getSnapshot(frame: number): BattleModelSnapshot | null {
    return this.rollbackHistory.get(frame)?.snapshot ?? null;
  }

  pruneAfter(frame: number): void {
    const pruneMap = <T>(map: Map<number, T> | undefined): void => {
      if (!map) {
        return;
      }
      for (const key of map.keys()) {
        if (key > frame) {
          map.delete(key);
        }
      }
    };

    pruneMap(this.rollbackHistory);
    pruneMap(this.debugHashBacklog);
    pruneMap(this.debugHistory);
    this.debugLogger?.pruneAfter(frame);
  }

  pruneBefore(frame: number): void {
    for (const key of this.rollbackHistory.keys()) {
      if (key < frame) {
        this.rollbackHistory.delete(key);
      }
    }
    const history = this.debugHistory;
    if (!this.enabled || !history) {
      return;
    }
    this.recordConfirmedDebugHashesThrough(frame);
    for (const key of history.keys()) {
      if (key < frame) {
        history.delete(key);
      }
    }
  }

  pruneOldHistory(currentFrame: number): void {
    const rollbackMinFrame = currentFrame - DEBUG_HISTORY_LIMIT;
    for (const key of this.rollbackHistory.keys()) {
      if (key < rollbackMinFrame) {
        this.rollbackHistory.delete(key);
      }
    }
    const history = this.debugHistory;
    if (!this.enabled || !history) {
      return;
    }
    for (const key of history.keys()) {
      if (key < rollbackMinFrame) {
        history.delete(key);
      }
    }
  }

  getBundle(params: {
    readonly localConfirmedFrame: number;
    readonly serverConfirmedFrame: number;
    readonly targetFrame: number;
    readonly authoritativeFrame: number;
  }): BattleHashBundle | null {
    if (!this.enabled) {
      return null;
    }

    const sampled = this.recordConfirmedDebugHashesThrough(
      params.authoritativeFrame,
    );
    const sampledUpTo = this.requireConfirmedHash().lastSampledFrame;
    return {
      finalGlobalHash: sampled
        ? this.requireConfirmedHash().digestHex(sampledUpTo)
        : null,
      finalGlobalInputHash: sampled
        ? this.requireConfirmedInputHash().digestHex(sampledUpTo)
        : null,
      sampled,
      sampledUpTo,
      sampledCount: this.requireConfirmedHash().samples,
      localConfirmedFrame: params.localConfirmedFrame,
      serverConfirmedFrame: params.serverConfirmedFrame,
      targetFrame: params.targetFrame,
      authoritativeFrame: params.authoritativeFrame,
      rows: this.debugLogger?.getConfirmedRows(params.authoritativeFrame) ?? [],
    };
  }

  writeDebugLog(
    bundle: BattleHashBundle,
    context: BattleHashLogContext,
  ): string | null {
    if (!this.enabled || !this.debugLogger) {
      return null;
    }

    return this.debugLogger.writeFile({
      sceneData: this.sceneData,
      winnerPlayerId: context.winnerPlayerId,
      localPlayerId: context.localPlayerId,
      runtimeFrame: context.runtimeFrame,
      targetFrame: context.targetFrame,
      serverConfirmedFrame: context.serverConfirmedFrame,
      authoritativeFrame: context.authoritativeFrame,
      localConfirmedFrame: context.localConfirmedFrame,
      finalGlobalHash: bundle.finalGlobalHash,
      finalGlobalInputHash: bundle.finalGlobalInputHash,
      sampledConfirmedFrames: context.sampledConfirmedFrames,
    });
  }

  clear(): void {
    this.disableDebugState();
  }

  private recordConfirmedDebugHashesThrough(frame: number): boolean {
    const confirmedHash = this.requireConfirmedHash();
    const confirmedInputHash = this.requireConfirmedInputHash();
    const hashBacklog = this.requireHashBacklog();
    const history = this.requireHistory();
    const logger = this.requireLogger();

    for (
      let nextFrame = confirmedHash.lastSampledFrame + 1;
      nextFrame <= frame;
      nextFrame += 1
    ) {
      const hash = hashBacklog.get(nextFrame) ?? history.get(nextFrame)?.hash;
      if (!hash) {
        return false;
      }
      confirmedHash.addSample({
        frame: nextFrame,
        hashHex: hash,
      });
      const confirmedRecord = logger.recordConfirmedFrame({
        enabled: true,
        frame: nextFrame,
        hash,
        confirmedThrough: frame,
      });
      confirmedInputHash.addSample({
        frame: nextFrame,
        hashHex: confirmedRecord?.inputHash ?? "00000000",
      });
      hashBacklog.delete(nextFrame);
    }
    return true;
  }

  private disableDebugState(): void {
    this.enabled = false;
    this.debugConfirmedHash = undefined;
    this.debugConfirmedInputHash = undefined;
    this.debugHashBacklog = undefined;
    this.debugHistory = undefined;
    this.debugLogger = undefined;
  }

  private requireConfirmedHash(): ConfirmedFrameHashAccumulator {
    if (!this.debugConfirmedHash) {
      throw new Error("BattleRollbackHistory is not enabled.");
    }
    return this.debugConfirmedHash;
  }

  private requireConfirmedInputHash(): ConfirmedFrameHashAccumulator {
    if (!this.debugConfirmedInputHash) {
      throw new Error("BattleRollbackHistory is not enabled.");
    }
    return this.debugConfirmedInputHash;
  }

  private requireHashBacklog(): Map<number, string> {
    if (!this.debugHashBacklog) {
      throw new Error("BattleRollbackHistory is not enabled.");
    }
    return this.debugHashBacklog;
  }

  private requireHistory(): Map<number, DebugFrameRecord> {
    if (!this.debugHistory) {
      throw new Error("BattleRollbackHistory is not enabled.");
    }
    return this.debugHistory;
  }

  private requireLogger(): BattleRollbackLogger {
    if (!this.debugLogger) {
      throw new Error("BattleRollbackHistory is not enabled.");
    }
    return this.debugLogger;
  }

  private getLatestFrame(history: Map<number, DebugFrameRecord>): number {
    let latest = 0;
    for (const key of history.keys()) {
      if (key > latest) {
        latest = key;
      }
    }
    return latest;
  }
}
