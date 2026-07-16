import Phaser from "phaser";
import type { BattleSceneData } from "../../loadout";
import { ReplayBattleOverride } from "../../../replay/replay-battle-override";
import { SpectatorBattleOverride } from "../../../replay/spectator/spectator-battle-override";
import { ReplayRecorder, globalReplayRecorder } from "../../../replay/recorder";
import type { BattleKeyMap } from "../../input-controller";
import type { BattleBgmBridge } from "../../../sound";
import { BattleEvents } from "@repo/constants";

export class BattleReplayManager {
  private replayOverride: ReplayBattleOverride | null = null;
  private spectatorOverride: SpectatorBattleOverride | null = null;
  private replayRecorder: ReplayRecorder | undefined = undefined;

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData
  ) { }

  initialize(keys: BattleKeyMap, bgmBridge: BattleBgmBridge | undefined): void {
    if (this.sceneData.replayData) {
      this.replayOverride = new ReplayBattleOverride(this.scene, this.sceneData, {
        keys,
        bgmBridge,
      });
    } else if (this.sceneData.spectatorData) {
      this.spectatorOverride = new SpectatorBattleOverride(this.scene, this.sceneData, {
        keys,
        bgmBridge,
      });
    } else {
      // 初始化常规战斗录像机
      if (this.sceneData.mode !== "training" && !this.sceneData.story) {
        this.replayRecorder = new ReplayRecorder();
        this.replayRecorder.startBattle({
          playerName: this.sceneData.playerName ?? "Player",
          opponentName: this.sceneData.opponentName ?? "Opponent",
          mapId: this.sceneData.mapId ?? this.sceneData.battleConfig?.mapId ?? "hakurei_shrine",
          playerInitPoint: this.sceneData.playerInitPoint,
          opponentInitPoint: this.sceneData.opponentInitPoint,
        });
      } else if (this.sceneData.mode !== "training" && this.sceneData.story) {
        this.replayRecorder = globalReplayRecorder;
        this.replayRecorder.startBattle({
          playerName: this.sceneData.playerName ?? "Player",
          opponentName: this.sceneData.opponentName ?? "Opponent",
          mapId: this.sceneData.mapId ?? this.sceneData.battleConfig?.mapId ?? "hakurei_shrine",
          playerInitPoint: this.sceneData.playerInitPoint,
          opponentInitPoint: this.sceneData.opponentInitPoint,
          stageIndex: this.sceneData.story.stageIndex,
          stageTitle: this.sceneData.story.story.stages[this.sceneData.story.stageIndex]?.title,
          loadouts: this.sceneData.loadouts,
        });
      }

      this.scene.events.on(BattleEvents.RECORD_FRAME, this.recordFrame, this);
    }
  }

  get isReplayMode(): boolean {
    return this.replayOverride !== null;
  }

  get isSpectatorMode(): boolean {
    return this.spectatorOverride !== null;
  }

  update(delta: number): void {
    if (this.replayOverride) {
      this.replayOverride.update(delta);
    } else if (this.spectatorOverride) {
      this.spectatorOverride.update(delta);
    }
  }

  recordFrame(frame: number, p1Input: any, p2Input: any): void {
    if (this.replayRecorder) {
      this.replayRecorder.recordFrame(frame, p1Input, p2Input);
    }
  }

  endBattle(winnerPlayerId: "Player1" | "Player2"): void {
    if (this.replayRecorder) {
      this.replayRecorder.endBattle(winnerPlayerId);
    }
  }

  getRecorder(): ReplayRecorder | undefined {
    return this.replayRecorder;
  }
}
