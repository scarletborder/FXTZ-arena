import Phaser from "phaser";
import { createRaidLogicRuntime, type BattleOutputFrame, type RaidLogicRuntime } from "@repo/raid-logic";
import { FIXED_STEP_MS } from "@repo/constants";
import type { BattleConfig, PlayerId, ServerMessage } from "@repo/types";

import { createBattleInput } from "../../battle/input";
import type { BattleKeyMap } from "../../battle/keybind";
import { BattleView } from "../../battle/view";
import { BattlePauseMenuController } from "../../battle/view/pause";
import { BattleAudioDirector } from "../../battle/audio";
import type { BattleLoadouts, BattleSceneData } from "../../battle/loadout";
import { resolveResultWinnerName } from "../../battle/result";
import type { BattleBgmBridge } from "../../sound";
import type { UdpDirectSession } from "../../network/udp-direct-session";
import { connectionManager, type ResultData } from "../../menu/shared";
import { ReplayRecorder } from "../recorder";
import { SpectatorInputBuffer } from "./spectator-buffer";

export interface SpectatorBattleDeps {
  readonly keys: BattleKeyMap;
  readonly bgmBridge?: BattleBgmBridge;
}

export class SpectatorBattleOverride {
  private accumulator = 0;
  private runtime: RaidLogicRuntime;
  private logicReady = false;
  private currentOutput: BattleOutputFrame | undefined;
  private readonly view: BattleView;
  private readonly pauseMenu: BattlePauseMenuController;
  private readonly audioDirector = new BattleAudioDirector();
  private readonly inputBuffer: SpectatorInputBuffer;
  private readonly pointerInput;
  private readonly exitScene: string;
  private readonly udpSession: UdpDirectSession | null | undefined;
  private readonly replayRecorder = new ReplayRecorder();
  private readonly playerName: string;
  private readonly opponentName: string;
  private readonly loadouts: BattleLoadouts;
  private resultScheduled = false;
  private resultStarted = false;
  private frame = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    data: BattleSceneData,
    deps: SpectatorBattleDeps,
  ) {
    const spectatorData = data.spectatorData!;
    const config = spectatorData.battleConfig;
    const playerCfg = config.players[0];
    const targetCfg = config.players[1];
    this.inputBuffer = spectatorData.inputBuffer;
    this.exitScene = spectatorData.exitScene ?? "room-list";
    this.udpSession = spectatorData.udpSession;
    this.playerName = data.playerName ?? playerCfg.username ?? "Player1";
    this.opponentName = data.opponentName ?? targetCfg.username ?? "Player2";
    this.loadouts = data.loadouts ?? createLoadoutsFromConfig(config);

    this.runtime = createRaidLogicRuntime({
      mode: "online",
      loadouts: this.loadouts,
      mapId: config.mapId,
      playerInitPoint: data.playerInitPoint,
      opponentInitPoint: data.opponentInitPoint,
    });
    void this.runtime.initialize().then(() => {
      if (this.scene.scene.isActive()) {
        this.logicReady = true;
      }
    });

    this.view = new BattleView(
      this.scene,
      "online",
      config.mapId,
      config.battleMode ?? "versus",
    );
    this.pointerInput = createBattleInput(this.scene, deps.keys);
    this.pauseMenu = new BattlePauseMenuController(this.scene, {
      restartEnabled: false,
      canOpen: () => !this.resultScheduled,
      onPauseOpened: () => {
        deps.bgmBridge?.pause();
      },
      onResumed: () => {
        deps.bgmBridge?.resume();
      },
      onRestart: () => undefined,
      onMainMenu: () => this.exitSpectating(),
      spectator: true,
    });

    this.replayRecorder.startBattle({
      playerName: this.playerName,
      opponentName: this.opponentName,
      mapId: config.mapId,
      playerInitPoint: data.playerInitPoint,
      opponentInitPoint: data.opponentInitPoint,
      loadouts: this.loadouts,
    });

    if (this.udpSession) {
      this.udpSession.setSpectatorMessageHandler((message) => this.handleServerMessage(message));
    } else {
      connectionManager.setMessageHandler((message) => this.handleServerMessage(message));
    }
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());

    void playerCfg;
    void targetCfg;
  }

  update(delta: number): void {
    this.pauseMenu.update(delta);
    this.accumulator += delta;
    const maxSteps = this.accumulator > 500 ? 16 : 4;
    let steps = 0;

    while (this.logicReady && this.accumulator >= FIXED_STEP_MS && steps < maxSteps) {
      const pair = this.inputBuffer.takePair(this.frame);
      if (!pair) {
        break;
      }
      this.runtime.step({
        mode: "online",
        player: pair.player,
        target: pair.target,
        hostIsPlayer: true,
      });
      this.drainOutput();
      this.replayRecorder.recordFrame(this.runtime.frame, pair.player, pair.target);
      this.frame += 1;
      this.accumulator -= FIXED_STEP_MS;
      steps += 1;
    }

    if (this.runtime.gameOver && !this.resultScheduled) {
      this.scheduleResult(null);
    }

    if (this.currentOutput) {
      this.view.render(
        this.currentOutput.state,
        this.pointerInput,
        "Player1",
        this.accumulator / FIXED_STEP_MS,
        1,
      );
    }
  }

  destroy(): void {
    this.pauseMenu.destroy();
    if (this.udpSession) {
      this.udpSession.setSpectatorMessageHandler(null);
    } else {
      connectionManager.setMessageHandler(null);
    }
  }

  private handleServerMessage(message: ServerMessage): void {
    if (message.type === "input_frame") {
      this.inputBuffer.push(message);
      return;
    }
    if (message.type === "battle_finished") {
      this.scheduleResult(message.winnerPlayerId, message.frame);
      return;
    }
    if (message.type === "room_state" && message.status === "finished") {
      this.scheduleResult(null);
    }
  }

  private drainOutput(): void {
    for (const output of this.runtime.outputQueue.drainAll()) {
      this.currentOutput = output;
      this.audioDirector.sync(output.state, {
        eventTypes: output.events.map((event) => event.type),
      });
    }
  }

  private exitSpectating(): void {
    if (this.udpSession) {
      this.udpSession.close();
    } else {
      connectionManager.send({ type: "leave_room" });
    }
    this.scene.scene.start(this.exitScene);
  }

  private scheduleResult(winnerPlayerId: PlayerId | null, finishFrame?: number): void {
    if (this.resultScheduled) return;
    this.resultScheduled = true;
    this.scene.time.delayedCall(900, () => this.goToResult(winnerPlayerId, finishFrame));
  }

  private goToResult(winnerPlayerId: PlayerId | null, finishFrame?: number): void {
    if (this.resultStarted) return;
    if (finishFrame !== undefined && this.runtime.frame < finishFrame && this.inputBuffer.hasPair(this.frame)) {
      this.scene.time.delayedCall(100, () => this.goToResult(winnerPlayerId, finishFrame));
      return;
    }
    if (!this.currentOutput) {
      this.exitSpectating();
      return;
    }
    this.resultStarted = true;
    this.replayRecorder.endBattle(winnerPlayerId === "Player2" ? "Player2" : "Player1");
    if (this.udpSession) {
      this.udpSession.close();
    }
    this.scene.scene.start("result", this.createResultData(winnerPlayerId));
  }

  private createResultData(winnerPlayerId: PlayerId | null): ResultData {
    const state = this.currentOutput!.state;
    const replay = this.replayRecorder.finalize({
      title: `${this.playerName} vs ${this.opponentName}`,
      mode: "online",
      player1Id: this.playerName,
      player2Id: this.opponentName,
      winnerPlayerId: winnerPlayerId === "Player2" ? "Player2" : "Player1",
      finalGlobalInputHash: null,
      loadouts: this.loadouts,
    });

    return {
      winnerName: resolveResultWinnerName({
        winnerPlayerId,
        localPlayerId: "Player1",
        localPlayerName: this.playerName,
        opponentName: this.opponentName,
        playerDeaths: state.player.deaths,
        targetDeaths: state.target.deaths,
      }),
      durationSeconds: state.stats.elapsedTicks / 60,
      players: [
        createResultPlayerSummary(this.playerName, state.player),
        createResultPlayerSummary(this.opponentName, state.target),
      ],
      returnScene: this.exitScene,
      replay,
    };
  }
}

function createLoadoutsFromConfig(config: BattleConfig): BattleLoadouts {
  return {
    player: {
      primaryCharacterId: config.players[0].loadout.primaryCharacterId,
      alternateCharacterId: config.players[0].loadout.alternateCharacterId,
      cardIds: config.players[0].loadout.abilityCardIds,
      activeCardId: config.players[0].loadout.activeAbilityCardId,
    },
    target: {
      primaryCharacterId: config.players[1].loadout.primaryCharacterId,
      alternateCharacterId: config.players[1].loadout.alternateCharacterId,
      cardIds: config.players[1].loadout.abilityCardIds,
      activeCardId: config.players[1].loadout.activeAbilityCardId,
    },
  };
}

function createResultPlayerSummary(
  name: string,
  fighterState: { shotsFired: number; bombUses: number; hitsTaken: number },
) {
  return {
    name,
    shots: fighterState.shotsFired,
    bombUses: fighterState.bombUses,
    hitsTaken: fighterState.hitsTaken,
  };
}
