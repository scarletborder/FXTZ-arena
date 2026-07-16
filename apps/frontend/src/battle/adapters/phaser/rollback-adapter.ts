import Phaser from "phaser";
import type { BattleOutputFrame } from "@repo/raid-logic";
import type { PlayerId } from "@repo/types";
import type { BattleSceneData } from "../../loadout";
import { settingsRepository } from "../../../store/settings";
import { BattleEvents } from "@repo/constants";
import {
  BattleRollbackHistory,
  type BattleHashBundle,
  type BattleRollbackLogRecord,
} from "../../session/rollback-history";
import type { BattleAudioDirector } from "../../sfx/audio";
import { BattleDebugLogger } from "../../logger";

export class PhaserBattleRollbackAdapter {
  readonly logger = new BattleDebugLogger();

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData,
    private getRollbackHistory: () => BattleRollbackHistory | null,
    private getRuntimeFrame: () => number,
    private getConfirmedFrame: () => number | undefined,
    private getIsLiveHashEnabled: () => boolean,
    private getAudioDirector: () => BattleAudioDirector,
  ) {
    this.scene.events.on(
      BattleEvents.SYNC_ROLLBACK_MANAGER_STATE,
      this.syncRollbackManagerState,
      this,
    );
    this.scene.events.on(
      BattleEvents.PRINT_DEBUG_HASH_BUNDLE,
      this.printDebugHashBundle,
      this,
    );
  }

  getRollbackManager(): BattleRollbackHistory {
    return this.requireRollbackHistory();
  }

  isDebugEnabled(): boolean {
    return this.shouldRecordDebugLog();
  }

  present(
    output: BattleOutputFrame,
    logRecord: BattleRollbackLogRecord | null,
    confirmedFrame: number,
  ): void {
    this.getAudioDirector().sync(output.state, {
      eventTypes: output.events.map((event) => event.type),
    });

    if (this.getIsLiveHashEnabled()) {
      console.log(`${output.frame} - ${output.hashHex}`, {
        events: logRecord?.events ?? output.events.map((event) => event.type),
        localConfirmedFrame: logRecord?.localConfirmedFrame ?? confirmedFrame,
        isAimConsuming: logRecord?.isAimConsuming ?? false,
        player1Input: logRecord?.player1Input ?? null,
        player2Input: logRecord?.player2Input ?? null,
      });
    }
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

  getDebugHashBundle(
    serverConfirmedFrame = this.getRuntimeFrame(),
  ): BattleHashBundle | null {
    this.syncRollbackManagerState();
    const localConfirmedFrame =
      this.getConfirmedFrame() ?? serverConfirmedFrame;
    const targetFrame =
      this.sceneData.mode === "online" || this.sceneData.mode === "local"
        ? serverConfirmedFrame
        : localConfirmedFrame;
    const authoritativeFrame =
      this.sceneData.mode === "online" || this.sceneData.mode === "local"
        ? Math.min(targetFrame, localConfirmedFrame, serverConfirmedFrame)
        : targetFrame;

    return this.requireRollbackHistory().getBundle({
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

    const bundle = this.requireRollbackHistory().getBundle({
      localConfirmedFrame,
      serverConfirmedFrame: targetFrame,
      targetFrame,
      authoritativeFrame,
    });
    if (!bundle) {
      return null;
    }
    return this.requireRollbackHistory().writeDebugLog(bundle, {
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

  private printDebugHashBundle(
    winnerPlayerId: PlayerId | null,
    serverConfirmedFrame = this.getRuntimeFrame(),
  ): void {
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
    console.log(
      `finalGlobalHash(BLAKE3)\t${bundle.finalGlobalHash ?? "<incomplete>"}`,
    );
    console.log(
      `finalGlobalInputHash(BLAKE3)\t${bundle.finalGlobalInputHash ?? "<incomplete>"}`,
    );
    console.log(
      `sampledConfirmedFrames\t0-${bundle.sampledUpTo} (${bundle.sampledCount})`,
    );
    if (!bundle.sampled) {
      console.warn(
        `Unable to sample all frames through ${bundle.authoritativeFrame}; sampled up to ${bundle.sampledUpTo}.`,
      );
    }

    for (const row of bundle.rows) {
      console.log(`${row.frame}\t${row.hash}\t${row.inputHash}`);
    }
    console.groupEnd();

    this.requireRollbackHistory().writeDebugLog(bundle, {
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

  private shouldRecordDebugLog(): boolean {
    try {
      return (
        Boolean(this.sceneData.debug) ||
        settingsRepository.get().debug ||
        this.getIsLiveHashEnabled()
      );
    } catch {
      return Boolean(this.sceneData.debug) || settingsRepository.get().debug;
    }
  }

  private syncRollbackManagerState(): void {
    this.getRollbackHistory()?.setDebugEnabled(this.shouldRecordDebugLog());
  }

  private requireRollbackHistory(): BattleRollbackHistory {
    const history = this.getRollbackHistory();
    if (!history) {
      throw new Error("Battle rollback history is unavailable");
    }
    return history;
  }
}
