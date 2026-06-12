import Phaser from "phaser";
import type { BattleSceneData } from "../loadout";
import { type PlayerId, type BattleInputState } from "@repo/types";
import { CombatSyncManager } from "../../network/combat";
import { PeerConnection } from "../../network/p2p";
import { createLocalBattleConnectionManager } from "../utils/battle-helpers";
import { connectionManager } from "../../menu/shared";
import { t } from "@repo/i18n";
import { Depth } from "../../utils/depth";
import { BattleEvents } from "@repo/constants";

export class BattleNetworkManager {
  private combatSync: CombatSyncManager | undefined;
  private onlineStatusText: Phaser.GameObjects.Text | undefined;
  private p2p: PeerConnection | undefined;

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData,
    private getRuntime: () => any,
    private recordStepInputs: (record: any) => void,
    private recordConfirmedInputs: (record: any) => void,
    private recordFrame: (aimConsumed: boolean) => void,
    private getRollbackRecord: (frame: number) => any,
    private pruneAfter: (frame: number) => void,
    private pruneBefore: (frame: number) => void,
    private onRollback: () => void
  ) {
    if (sceneData.mode !== "online" && sceneData.mode !== "local") return;
    const isLocalBattle = sceneData.mode === "local";

    this.onlineStatusText = scene.add
      .text(24, 24, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#ffcf6e",
        backgroundColor: "#101820cc",
        padding: { x: 10, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(Depth.OnlineStatus)
      .setVisible(false);

    const battleConnectionManager =
      sceneData.mode === "local" ? createLocalBattleConnectionManager() : connectionManager;

    this.p2p = sceneData.p2p;

    this.p2p?.setStatusHandler((status) => {
      if (status === "connecting") {
        this.onlineStatusText
          ?.setText(isLocalBattle ? t("battle.p2p_attempt_local") : t("battle.p2p_attempt_online"))
          .setVisible(true);
      } else if (status === "connected") {
        this.onlineStatusText
          ?.setText(isLocalBattle ? t("battle.p2p_connected_local") : t("battle.p2p_connected_online"))
          .setVisible(true);
        scene.time.delayedCall(700, () => this.onlineStatusText?.setVisible(false));
      } else if (status === "failed") {
        this.onlineStatusText
          ?.setText(isLocalBattle ? t("battle.p2p_failed_local") : t("battle.p2p_failed_online"))
          .setVisible(true);
        scene.time.delayedCall(1100, () => this.onlineStatusText?.setVisible(false));
      }
    });

    this.p2p?.setMessageHandler((message) => this.combatSync?.receivePeerMessage(message));

    this.combatSync = new CombatSyncManager(this.getRuntime(), battleConnectionManager, {
      sceneData,
      p2p: this.p2p,
      callbacks: {
        recordStepInputs: (record) => {
          this.recordStepInputs(record);
          this.forwardSpectatorInputs(record);
        },
        recordConfirmedInputs: (record) => this.recordConfirmedInputs(record),
        recordFrame: (aimConsumed) => this.recordFrame(aimConsumed),
        getRollbackRecord: (frame) => this.getRollbackRecord(frame),
        pruneRollbackHistoryAfter: (frame) => this.pruneAfter(frame),
        pruneRollbackHistoryBefore: (frame) => this.pruneBefore(frame),
        onRollback: () => {
          this.onRollback();
        },
        setStatusText: (text) => this.onlineStatusText?.setText(text).setVisible(true),
        hideStatusText: () => this.onlineStatusText?.setVisible(false),
        delay: (ms, callback) => {
          scene.time.delayedCall(ms, callback);
        },
        finishBattle: (winnerPlayerId, serverConfirmedFrame) => {
          this.scene.events.emit(BattleEvents.GO_TO_ONLINE_RESULT, winnerPlayerId, serverConfirmedFrame);
        },
      },
    });

    this.p2p?.start();
  }

  isSyncRunning(): boolean {
    return this.combatSync !== undefined;
  }

  step(lastInput: any): void {
    this.combatSync?.step(lastInput);
  }

  localFighterKey(): "Player1" | "Player2" {
    return this.combatSync?.localFighterKey() ?? "Player1";
  }

  getLocalPlayerId(): PlayerId | null {
    return this.combatSync?.localPlayerId ?? this.sceneData.localPlayerId ?? null;
  }

  getConfirmedFrame(): number | undefined {
    return this.combatSync?.getConfirmedFrame();
  }

  destroy(): void {
    if (this.sceneData.mode === "online" || this.sceneData.mode === "local") {
      this.combatSync?.destroy();
    }
    this.combatSync = undefined;
  }

  private forwardSpectatorInputs(record: {
    readonly frame: number;
    readonly player: BattleInputState;
    readonly target: BattleInputState;
  }): void {
    if ((this.sceneData.localPlayerId ?? "Player1") !== "Player1") return;
    const shouldForwardOnline = this.sceneData.mode === "online";
    const shouldForwardLocal = this.sceneData.mode === "local" && this.sceneData.spectatorForward !== undefined;
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
      connectionManager.send(playerMessage);
      connectionManager.send(targetMessage);
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