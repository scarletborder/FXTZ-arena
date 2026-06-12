import Phaser from "phaser";
import type { BattleSceneData } from "../../loadout";
import { BattleEvents } from "@repo/constants";
import { BattlePauseMenuController } from "../pause";

export class BattlePauseController {
  private pauseMenu: BattlePauseMenuController | undefined;

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData,
    private getResultScheduled: () => boolean,
    private resetAccumulator: () => void,
    private bgmBridge: any
  ) {
    if (this.isPausableLocalMode()) {
      this.pauseMenu = new BattlePauseMenuController(scene, {
        restartEnabled: sceneData.mode !== "training",
        canOpen: () => !this.getResultScheduled(),
        onPauseOpened: () => {
          this.resetAccumulator();
          this.bgmBridge?.pause();
        },
        onResumed: () => this.bgmBridge?.resume(),
        onRestart: () => this.scene.events.emit(BattleEvents.RESTART_LOCAL),
        onMainMenu: () => this.scene.events.emit(BattleEvents.MAIN_MENU),
      });
    }
  }

  isPaused(): boolean {
    return this.pauseMenu?.isPaused() ?? false;
  }

  update(delta: number): void {
    this.pauseMenu?.update(delta);
  }

  destroy(): void {
    this.pauseMenu?.destroy();
  }

  private isPausableLocalMode(): boolean {
    return (
      this.sceneData.story !== undefined ||
      this.sceneData.mode === "ai" ||
      this.sceneData.mode === "training"
    );
  }
}