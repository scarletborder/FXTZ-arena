import Phaser from "phaser";
import type { BattleSceneData } from "../loadout";
import { uiSettings } from "../../store/settings";
import { BattleEvents } from "@repo/constants";
import { BattleRollbackManager, BattleHashBundle } from "./hash-manager";

export class BattleRollbackFacade {
  private rollbackManager: BattleRollbackManager;

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData,
    private getRuntimeFrame: () => number,
    private getConfirmedFrame: () => number | undefined,
    private getIsLiveHashEnabled: () => boolean,
    private getAudioDirector: () => any
  ) {
    this.rollbackManager = new BattleRollbackManager({
      sceneData,
      debug: this.shouldRecordDebugLog(),
    });

    this.scene.events.on(BattleEvents.SYNC_ROLLBACK_MANAGER_STATE, this.syncRollbackManagerState, this);
    this.scene.events.on(BattleEvents.PRINT_DEBUG_HASH_BUNDLE, this.printDebugHashBundle, this);
  }

  getRollbackManager(): BattleRollbackManager {
    return this.rollbackManager;
  }

  recordStepInputs(record: any): void {
    this.rollbackManager.recordStepInputs(record);
  }

  recordConfirmedInputs(record: any): void {
    this.rollbackManager.recordConfirmedInputs(record);
  }

  getRollbackRecord(frame: number): any {
    return this.rollbackManager.getRollbackRecord(frame);
  }

  pruneAfter(frame: number): void {
    this.rollbackManager.pruneAfter(frame);
  }

  pruneBefore(frame: number): void {
    this.rollbackManager.pruneBefore(frame);
  }

  reset(): void {
    this.rollbackManager.reset({
      sceneData: this.sceneData,
      debug: this.shouldRecordDebugLog(),
    });
  }

  recordFrame(outputQueue: any, aimConsumed = false): any {
    this.syncRollbackManagerState();
    const outputs = outputQueue.drainAll();
    let lastOutput: any = null;

    for (const output of outputs) {
      lastOutput = output;
      this.rollbackManager.recordRollbackSnapshot(output.frame, output.snapshot);
      this.getAudioDirector().sync(output.state, {
        eventTypes: output.events.map((event: any) => event.type),
      });

      const confirmedFrame = this.getConfirmedFrame() ?? output.frame;
      const logRecord = this.rollbackManager.recordFrame(output, {
        localConfirmedFrame: confirmedFrame,
        isAimConsuming: aimConsumed,
      });

      if (this.getIsLiveHashEnabled()) {
        console.log(`${output.frame} - ${output.hashHex}`, {
          events: logRecord?.events ?? output.events.map((event: any) => event.type),
          localConfirmedFrame: logRecord?.localConfirmedFrame ?? confirmedFrame,
          isAimConsuming: logRecord?.isAimConsuming ?? false,
          player1Input: logRecord?.player1Input ?? null,
          player2Input: logRecord?.player2Input ?? null,
        });
      }
    }

    this.rollbackManager.pruneOldHistory(this.getRuntimeFrame());
    return lastOutput;
  }

  getFinalDebugHashes(serverConfirmedFrame = this.getRuntimeFrame()) {
    const bundle = this.getDebugHashBundle(serverConfirmedFrame);
    return bundle
      ? {
          finalGlobalHash: bundle.finalGlobalHash,
          finalGlobalInputHash: bundle.finalGlobalInputHash,
        }
      : undefined;
  }

  getDebugHashBundle(serverConfirmedFrame = this.getRuntimeFrame()): BattleHashBundle | null {
    this.syncRollbackManagerState();
    const localConfirmedFrame = this.getConfirmedFrame() ?? serverConfirmedFrame;
    const targetFrame =
      this.sceneData.mode === "online" || this.sceneData.mode === "local" ? serverConfirmedFrame : localConfirmedFrame;
    const authoritativeFrame =
      this.sceneData.mode === "online" || this.sceneData.mode === "local"
        ? Math.min(targetFrame, localConfirmedFrame, serverConfirmedFrame)
        : targetFrame;

    return this.rollbackManager.getBundle({
      localConfirmedFrame,
      serverConfirmedFrame,
      targetFrame,
      authoritativeFrame,
    });
  }

  saveDebugLog(targetFrame = this.getRuntimeFrame()): string | null {
    if (!this.shouldRecordDebugLog()) {
      return null;
    }
    this.syncRollbackManagerState();
    const localConfirmedFrame = this.getConfirmedFrame() ?? targetFrame;
    const authoritativeFrame =
      this.sceneData.mode === "online" || this.sceneData.mode === "local"
        ? Math.min(targetFrame, localConfirmedFrame)
        : targetFrame;

    const bundle = this.rollbackManager.getBundle({
      localConfirmedFrame,
      serverConfirmedFrame: targetFrame,
      targetFrame,
      authoritativeFrame,
    });
    if (!bundle) {
      return null;
    }
    return this.rollbackManager.writeDebugLog(bundle, {
      winnerPlayerId: null,
      localPlayerId: this.sceneData.localPlayerId ?? null,
      runtimeFrame: this.getRuntimeFrame(),
      targetFrame,
      serverConfirmedFrame: null,
      authoritativeFrame,
      localConfirmedFrame,
      sampledConfirmedFrames: {
        from: 0,
        to: bundle.sampledUpTo,
        count: bundle.sampledCount,
        complete: bundle.sampled,
      },
    });
  }

  private printDebugHashBundle(winnerPlayerId: any, serverConfirmedFrame = this.getRuntimeFrame()): void {
    // 【修复 3】非调试模式不打印日志
    if (!this.shouldRecordDebugLog()) {
      return;
    }

    const bundle = this.getDebugHashBundle(serverConfirmedFrame);
    if (!bundle) return;

    const label = `FXTZ Debug Hash Bundle (mode=${this.sceneData.mode ?? "offline"}, winner=${
      winnerPlayerId ?? "local"
    }, runtimeFrame=${this.getRuntimeFrame()}, localConfirmedFrame=${bundle.localConfirmedFrame}, serverConfirmedFrame=${
      bundle.serverConfirmedFrame
    }, authoritativeFrame=${bundle.authoritativeFrame}, sampledUpTo=${bundle.sampledUpTo}, cachedRows=${
      bundle.rows.length
    })`;

    console.group(label);
    console.log(`finalGlobalHash(BLAKE3)\t${bundle.finalGlobalHash ?? "<incomplete>"}`);
    console.log(`finalGlobalInputHash(BLAKE3)\t${bundle.finalGlobalInputHash ?? "<incomplete>"}`);
    console.log(`sampledConfirmedFrames\t0-${bundle.sampledUpTo} (${bundle.sampledCount})`);
    if (!bundle.sampled) {
      console.warn(
        `Unable to sample all frames through ${bundle.authoritativeFrame}; sampled up to ${bundle.sampledUpTo}.`
      );
    }

    for (const row of bundle.rows) {
      console.log(`${row.frame}\t${row.hash}\t${row.inputHash}`);
    }
    console.groupEnd();

    this.rollbackManager.writeDebugLog(bundle, {
      winnerPlayerId,
      localPlayerId: this.sceneData.localPlayerId ?? null,
      runtimeFrame: this.getRuntimeFrame(),
      targetFrame: bundle.targetFrame,
      serverConfirmedFrame: bundle.serverConfirmedFrame,
      authoritativeFrame: bundle.authoritativeFrame,
      localConfirmedFrame: bundle.localConfirmedFrame,
      sampledConfirmedFrames: {
        from: 0,
        to: bundle.sampledUpTo,
        count: bundle.sampledCount,
        complete: bundle.sampled,
      },
    });
  }

  // 【修复 2】防止在 BattleDebugController 实例化之前评估导致的未定义读取异常
  private shouldRecordDebugLog(): boolean {
    try {
      return (
        Boolean(this.sceneData.debug) ||
        uiSettings.debug ||
        this.getIsLiveHashEnabled()
      );
    } catch {
      return Boolean(this.sceneData.debug) || uiSettings.debug;
    }
  }

  private syncRollbackManagerState(): void {
    this.rollbackManager.setDebugEnabled(this.shouldRecordDebugLog());
  }
}