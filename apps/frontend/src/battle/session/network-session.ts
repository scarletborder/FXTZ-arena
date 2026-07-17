import { t } from "@repo/i18n";
import type { RaidLogicRuntime } from "@repo/raid-logic";
import type { BattleInputState } from "@repo/types";
import type { PlayerId } from "@repo/types";

import type { BattleSceneData } from "../loadout";
import {
  CombatSyncManager,
  type CombatConfirmedFrameInputRecord,
  type CombatConnection,
  type CombatFrameInputRecord,
  type CombatRollbackRecord,
} from "../../network/combat";

export interface BattleNetworkHost {
  showStatus(text: string): void;
  hideStatus(): void;
  delay(ms: number, callback: () => void): void;
  finishBattle(winnerPlayerId: PlayerId, serverConfirmedFrame?: number): void;
}

export interface BattleNetworkSessionOptions {
  readonly sceneData: BattleSceneData;
  readonly runtime: RaidLogicRuntime;
  readonly connection: CombatConnection;
  readonly host: BattleNetworkHost;
  readonly recordStepInputs: (record: CombatFrameInputRecord) => void;
  readonly recordConfirmedInputs: (
    record: CombatConfirmedFrameInputRecord,
  ) => void;
  readonly recordFrame: (aimConsumed: boolean) => void;
  readonly getRollbackRecord: (frame: number) => CombatRollbackRecord | null;
  readonly pruneAfter: (frame: number) => void;
  readonly pruneBefore: (frame: number) => void;
  readonly onRollback: () => void;
}

export class BattleNetworkSession {
  private readonly sceneData: BattleSceneData;
  private readonly connection: CombatConnection;
  private readonly host: BattleNetworkHost;
  private readonly p2p: BattleSceneData["p2p"];
  private combatSync: CombatSyncManager | undefined;

  constructor(options: BattleNetworkSessionOptions) {
    this.sceneData = options.sceneData;
    this.connection = options.connection;
    this.host = options.host;
    this.p2p = options.sceneData.p2p;

    if (!this.shouldStartSync()) return;

    this.installPeerHandlers();
    this.combatSync = new CombatSyncManager(
      options.runtime,
      options.connection,
      {
        sceneData: options.sceneData,
        p2p: this.p2p,
        callbacks: {
          recordStepInputs: (record) => {
            options.recordStepInputs(record);
            this.forwardSpectatorInputs(record);
          },
          recordConfirmedInputs: options.recordConfirmedInputs,
          recordFrame: options.recordFrame,
          getRollbackRecord: options.getRollbackRecord,
          pruneRollbackHistoryAfter: options.pruneAfter,
          pruneRollbackHistoryBefore: options.pruneBefore,
          onRollback: options.onRollback,
          setStatusText: (text) => this.host.showStatus(text),
          hideStatusText: () => this.host.hideStatus(),
          delay: (ms, callback) => this.host.delay(ms, callback),
          finishBattle: (winnerPlayerId, serverConfirmedFrame) =>
            this.host.finishBattle(winnerPlayerId, serverConfirmedFrame),
        },
      },
    );

    this.p2p?.setMessageHandler((message) =>
      this.combatSync?.receivePeerMessage(message),
    );
    this.p2p?.start();
  }

  isSyncRunning(): boolean {
    return this.combatSync !== undefined;
  }

  step(input: BattleInputState): void {
    this.combatSync?.step(input);
  }

  localFighterKey(): "Player1" | "Player2" {
    return this.combatSync?.localFighterKey() ?? "Player1";
  }

  getLocalPlayerId(): PlayerId | null {
    return (
      this.combatSync?.localPlayerId ?? this.sceneData.localPlayerId ?? null
    );
  }

  getConfirmedFrame(): number | undefined {
    return this.combatSync?.getConfirmedFrame();
  }

  destroy(): void {
    this.combatSync?.destroy();
    this.combatSync = undefined;
  }

  private shouldStartSync(): boolean {
    return (
      this.sceneData.mode === "online" ||
      (this.sceneData.mode === "local" && !this.sceneData.localSingleDevice)
    );
  }

  private installPeerHandlers(): void {
    const isLocalBattle = this.sceneData.mode === "local";
    this.p2p?.setStatusHandler((status) => {
      if (status === "connecting") {
        this.host.showStatus(
          isLocalBattle
            ? t("battle.p2p_attempt_local")
            : t("battle.p2p_attempt_online"),
        );
      } else if (status === "connected") {
        this.host.showStatus(
          isLocalBattle
            ? t("battle.p2p_connected_local")
            : t("battle.p2p_connected_online"),
        );
        this.host.delay(700, () => this.host.hideStatus());
      } else if (status === "failed") {
        this.host.showStatus(
          isLocalBattle
            ? t("battle.p2p_failed_local")
            : t("battle.p2p_failed_online"),
        );
        this.host.delay(1100, () => this.host.hideStatus());
      }
    });
  }

  private forwardSpectatorInputs(record: CombatFrameInputRecord): void {
    if ((this.sceneData.localPlayerId ?? "Player1") !== "Player1") return;
    const shouldForwardOnline = this.sceneData.mode === "online";
    const shouldForwardLocal =
      this.sceneData.mode === "local" &&
      this.sceneData.spectatorForward !== undefined;
    if (!shouldForwardOnline && !shouldForwardLocal) return;

    const playerMessage = {
      type: "spectator_input_frame",
      playerId: "Player1",
      frame: record.frame,
      ackFrame: record.frame,
      ...record.player,
    } as const;
    const targetMessage = {
      type: "spectator_input_frame",
      playerId: "Player2",
      frame: record.frame,
      ackFrame: record.frame,
      ...record.target,
    } as const;

    if (this.sceneData.mode === "online") {
      this.connection.send(playerMessage);
      this.connection.send(targetMessage);
      return;
    }
    this.sceneData.spectatorForward?.({
      ...playerMessage,
      type: "input_frame",
    });
    this.sceneData.spectatorForward?.({
      ...targetMessage,
      type: "input_frame",
    });
  }
}
