import Phaser from "phaser";
import { createRaidLogicRuntime, type BattleInputState, type BattleOutputFrame, type RaidLogicRuntime } from "@repo/raid-logic";
import { FIXED_STEP_MS, BattleEvents } from "@repo/constants";
import type { BattleSceneData } from "./loadout";

export class BattleRuntimeAdapter {
  private accumulator = 0;
  private runtime!: RaidLogicRuntime;
  private logicReady = false;
  private autoReloadObservedShotsFired = 0;
  private currentOutput!: BattleOutputFrame;

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData,
    private getKeys: () => any,
    private getIsInputLocked: () => boolean,
    private createInput: (fighter: any, prevShots: number) => any,
    private isSyncRunning: () => boolean,
    private stepSync: (input: any) => void,
    private recordFrame: () => void
  ) {
    this.runtime =
      sceneData.runtime ??
      createRaidLogicRuntime({
        mode:
          sceneData.mode === "ai"
            ? "ai"
            : sceneData.mode === "online" || sceneData.mode === "local"
              ? "online"
              : "training",
        loadouts: sceneData.loadouts,
        mapId: sceneData.mapId ?? sceneData.battleConfig?.mapId,
        battleMode: sceneData.battleMode ?? sceneData.battleConfig?.battleMode,
        seed: sceneData.battleConfig?.seed,
        playerInitPoint: sceneData.playerInitPoint,
        opponentInitPoint: sceneData.opponentInitPoint,
        ai: sceneData.ai,
      });

    this.logicReady = sceneData.runtime?.physicsReady === true;
    if (!this.logicReady) {
      this.runtime.initialize().then(() => {
        if (!this.scene.scene.isActive()) return;
        this.logicReady = true;
      });
    }

    this.scene.events.on(BattleEvents.RESET_ACCUMULATOR, () => {
      this.accumulator = 0;
    });
  }

  isLogicReady(): boolean {
    return this.logicReady;
  }

  getRuntime(): RaidLogicRuntime {
    return this.runtime;
  }

  getAccumulator(): number {
    return this.accumulator;
  }

  getCurrentOutput(): BattleOutputFrame {
    return this.currentOutput;
  }

  setCurrentOutput(output: BattleOutputFrame): void {
    this.currentOutput = output;
  }

  localFighterState(localFighterKey: "Player1" | "Player2") {
    return localFighterKey === "Player1"
      ? this.runtime.state.player
      : this.runtime.state.target;
  }

  update(delta: number, localFighterKey: "Player1" | "Player2"): void {
    this.accumulator += delta;
    const keys = this.getKeys();

    while (this.accumulator >= FIXED_STEP_MS) {
      if (!this.getIsInputLocked()) {
        const fighter = this.localFighterState(localFighterKey);
        const lastInput = this.createInput(fighter, this.autoReloadObservedShotsFired);

        if (this.isSyncRunning() && this.logicReady) {
          this.stepSync(lastInput);
        } else if (this.runtime.gameOver && Phaser.Input.Keyboard.JustDown(keys.enter)) {
          this.scene.events.emit(BattleEvents.GO_TO_RESULT);
        } else if (this.logicReady) {
          this.stepRuntimeWithInput(lastInput);
        }
        this.updateAutoReloadObservation(localFighterKey, lastInput);

        if (this.logicReady && !this.getIsInputLocked()) {
          const p1Input = this.runtime.lastPlayerInput ?? lastInput;
          const p2Input = this.runtime.lastTargetInput ?? lastInput;
          this.scene.events.emit(BattleEvents.RECORD_FRAME, this.runtime.frame, p1Input, p2Input);
        }
      }
      this.accumulator -= FIXED_STEP_MS;
    }
  }

  stepRuntimeWithInput(input: BattleInputState): void {
    this.runtime.step({
      mode: this.sceneData.mode === "ai" ? "ai" : "training",
      player: input,
    });
    this.recordFrame();
  }

  fastForward(elapsedMs: number, localFighterKey: "Player1" | "Player2", lastInput: any): void {
    if (!this.logicReady || elapsedMs <= 0) return;

    const framesToCatchUp = Math.floor(elapsedMs / FIXED_STEP_MS);
    if (framesToCatchUp <= 0) {
      this.accumulator = elapsedMs;
      return;
    }

    for (let frame = 0; frame < framesToCatchUp; frame += 1) {
      if (this.isSyncRunning()) {
        this.stepSync(lastInput);
      } else {
        this.stepRuntimeWithInput(lastInput);
      }
      this.updateAutoReloadObservation(localFighterKey, lastInput);
    }

    this.accumulator = elapsedMs - framesToCatchUp * FIXED_STEP_MS;
  }

  private updateAutoReloadObservation(localFighterKey: "Player1" | "Player2", lastInput: BattleInputState): void {
    // 【防御性修复】防止极端情况下上层传递 undefined 导致崩溃
    if (!lastInput) return;

    const fighter = this.localFighterState(localFighterKey);
    if (
      lastInput.reloadPressed ||
      fighter.reloadRemaining > 0 ||
      fighter.ammo > 0 ||
      fighter.shotsFired <= this.autoReloadObservedShotsFired
    ) {
      this.autoReloadObservedShotsFired = fighter.shotsFired;
    }
  }
}