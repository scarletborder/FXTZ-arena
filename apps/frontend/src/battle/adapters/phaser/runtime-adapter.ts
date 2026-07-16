import Phaser from "phaser";
import {
  createRaidLogicRuntime,
  type BattleInputState,
  type BattleOutputFrame,
  type RaidLogicRuntime,
} from "@repo/raid-logic";
import { FIXED_STEP_MS, BattleEvents } from "@repo/constants";

import type { BattleSceneData } from "../../loadout";
import { BattleFramePipeline } from "../../session/frame-pipeline";

export class BattleRuntimeAdapter {
  private readonly runtime: RaidLogicRuntime;
  private readonly framePipeline: BattleFramePipeline;
  private logicReady = false;
  private currentOutput!: BattleOutputFrame;

  constructor(
    private scene: Phaser.Scene,
    sceneData: BattleSceneData,
    private getKeys: () => any,
    private getIsInputLocked: () => boolean,
    private createInput: (fighter: any, prevShots: number) => any,
    private createTargetInput: (fighter: any, prevShots: number) => any,
    private isSyncRunning: () => boolean,
    private stepSync: (input: any) => void,
    private recordFrame: () => void,
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

    this.framePipeline = new BattleFramePipeline(this.runtime, {
      fixedStepMs: FIXED_STEP_MS,
      mode: sceneData.mode,
      localSingleDevice: sceneData.localSingleDevice === true,
      isLogicReady: () => this.logicReady,
      isInputLocked: this.getIsInputLocked,
      createInput: this.createInput,
      createTargetInput: this.createTargetInput,
      isSyncRunning: this.isSyncRunning,
      stepSync: this.stepSync,
      recordOutputFrame: this.recordFrame,
      recordInputFrame: (frame, player, target) => {
        this.scene.events.emit(
          BattleEvents.RECORD_FRAME,
          frame,
          player,
          target,
        );
      },
      shouldFinishBattle: () =>
        Phaser.Input.Keyboard.JustDown(this.getKeys().enter),
      finishBattle: () => this.scene.events.emit(BattleEvents.GO_TO_RESULT),
    });

    this.logicReady = sceneData.runtime?.physicsReady === true;
    if (!this.logicReady) {
      this.runtime.initialize().then(() => {
        if (!this.scene.scene.isActive()) return;
        this.logicReady = true;
      });
    }

    this.scene.events.on(BattleEvents.RESET_ACCUMULATOR, () => {
      this.framePipeline.resetAccumulator();
    });
  }

  isLogicReady(): boolean {
    return this.logicReady;
  }

  getRuntime(): RaidLogicRuntime {
    return this.runtime;
  }

  getAccumulator(): number {
    return this.framePipeline.getAccumulator();
  }

  getCurrentOutput(): BattleOutputFrame {
    return this.currentOutput;
  }

  setCurrentOutput(output: BattleOutputFrame): void {
    this.currentOutput = output;
  }

  localFighterState(localFighterKey: "Player1" | "Player2") {
    return this.framePipeline.localFighterState(localFighterKey);
  }

  update(delta: number, localFighterKey: "Player1" | "Player2"): void {
    this.framePipeline.update(delta, localFighterKey);
  }

  stepRuntimeWithInput(
    input: BattleInputState,
    targetInput?: BattleInputState,
  ): void {
    this.framePipeline.stepRuntimeWithInput(input, targetInput);
  }

  fastForward(
    elapsedMs: number,
    localFighterKey: "Player1" | "Player2",
    lastInput: any,
  ): void {
    this.framePipeline.fastForward(elapsedMs, localFighterKey, lastInput);
  }
}
