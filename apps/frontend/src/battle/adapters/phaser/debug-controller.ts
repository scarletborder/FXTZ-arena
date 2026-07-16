import type { BattleInputState } from "@repo/raid-logic";
import { BattleEvents, type PointRewardSize } from "@repo/constants";
import Phaser from "phaser";
import { DebugHashRow } from "../../../commands/ConsoleCmd";
import { getBattlePointerWorld } from "../../input-controller/input";
import { BattleSceneData } from "../../loadout";
import type { ArenaBounds } from "@repo/constants";
import type { BattleMobileControls } from "../../input-controller";
import type { BattleView } from "../../view";
import type { BattleSession } from "../../session/battle-session";

export type DebugPointSize = "small" | "medium" | "large";

export function pointRewardSizeForDebugSize(size: DebugPointSize): PointRewardSize {
  switch (size) {
    case "small":
      return "small";
    case "medium":
      return "medium";
    case "large":
      return "large";
  }
}

export function createPresetScriptInput(offset: number): BattleInputState {
  const aimAngle = -0.5 + offset * 0.018;
  return {
    moveX: presetMoveX(offset),
    moveY: presetMoveY(offset),
    aimX: 640 + Math.cos(aimAngle) * 390,
    aimY: 338 + Math.sin(aimAngle) * 250,
    shootPressed: isPresetShootFrame(offset),
    bombPressed: isPresetBombFrame(offset),
    activeCardPressed: offset === 320,
    reloadPressed: isPresetReloadFrame(offset),
    alternateHeld: isPresetAlternateHeld(offset),
    infoHeld: false,
  };
}

export function describePresetScriptAction(offset: number): string {
  const actions: string[] = [];
  if (isPresetAlternateHeld(offset)) actions.push("alternateHeld");
  if (isPresetShootFrame(offset)) actions.push("shoot");
  if (isPresetReloadFrame(offset)) actions.push("reload");
  if (isPresetBombFrame(offset)) actions.push("bomb");
  if (offset === 150) actions.push("marisaBombStart");
  if (
    offset > 150 &&
    offset < 390 &&
    (isPresetAlternateHeld(offset) ||
      isPresetShootFrame(offset) ||
      isPresetReloadFrame(offset) ||
      isPresetBombFrame(offset))
  ) {
    actions.push("duringMarisaBombLock");
  }
  if (offset === 320) actions.push("activeCard");
  return actions.length === 0 ? "move+aim" : actions.join("+");
}

function presetMoveX(offset: number): -1 | 0 | 1 {
  if (offset < 36) return 1;
  if (offset < 72) return -1;
  if (offset >= 155 && offset < 260) {
    return offset % 32 < 16 ? 1 : -1;
  }
  if (offset >= 260 && offset < 330) return 1;
  return offset % 48 < 16 ? -1 : offset % 48 < 32 ? 1 : 0;
}

function presetMoveY(offset: number): -1 | 0 | 1 {
  if (offset < 28) return -1;
  if (offset < 64) return 1;
  if (offset >= 155 && offset < 260) {
    return offset % 28 < 14 ? -1 : 1;
  }
  return offset % 42 < 14 ? 1 : offset % 42 < 28 ? -1 : 0;
}

function isPresetShootFrame(offset: number): boolean {
  return [4, 10, 18, 35, 78, 90, 118, 146, 166, 174, 182, 205, 238, 274, 330, 360, 390].includes(offset);
}

function isPresetReloadFrame(offset: number): boolean {
  return [22, 52, 104, 132, 176, 215, 285, 345].includes(offset);
}

function isPresetBombFrame(offset: number): boolean {
  return [64, 150, 188, 250, 404].includes(offset);
}

function isPresetAlternateHeld(offset: number): boolean {
  return (
    (offset >= 72 && offset < 122) ||
    (offset >= 144 && offset < 248) ||
    (offset >= 255 && offset < 305) ||
    (offset >= 350 && offset < 382)
  );
}


export class BattleDebugController {
  private debugLiveHashEnabled = false;
  private debugPhysicsEnabled = false;
  private debugInputLocked = false;

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData,
    private session: BattleSession,
    private view: BattleView,
    private mobileControls: BattleMobileControls | undefined,
    private arenaBounds: ArenaBounds,
    private setLastInput: (input: BattleInputState) => void,
  ) {
    if (sceneData.debug) {
      this.setDebugPhysicsEnabled(true);
    }
  }

  getFrame(): number {
    return this.session.getRuntime().frame;
  }

  getRecentHashes(count = 50): DebugHashRow[] {
    return this.session.getRollbackHistory().getRecentDebugHashes(count);
  }

  getHash(frame: number): DebugHashRow | null {
    return this.session.getRollbackHistory().getDebugHash(frame);
  }

  getLiveHashEnabled(): boolean {
    return this.debugLiveHashEnabled;
  }

  setLiveHashEnabled(enabled: boolean): void {
    this.debugLiveHashEnabled = enabled;
    this.scene.events.emit(BattleEvents.SYNC_ROLLBACK_MANAGER_STATE);
  }

  rollbackToFrame(frame: number): boolean {
    const history = this.session.getRollbackHistory();
    const snapshot = history.getSnapshot(frame);
    if (!snapshot) {
      return false;
    }
    this.session.getRuntime().deserialize(snapshot);
    this.scene.events.emit(BattleEvents.RESET_ACCUMULATOR);
    history.pruneAfter(frame);
    this.session.recordOutputFrame();
    return true;
  }

  runPresetScript(): DebugHashRow[] | null {
    const PRESET_SCRIPT_ROLLBACK_FRAME = 30;
    const PRESET_SCRIPT_FRAMES = 420;

    if (!this.rollbackToFrame(PRESET_SCRIPT_ROLLBACK_FRAME)) {
      return null;
    }

    const rows: DebugHashRow[] = [];
    this.debugInputLocked = true;
    try {
      for (let offset = 0; offset < PRESET_SCRIPT_FRAMES; offset += 1) {
        const input = createPresetScriptInput(offset);
        const lastInput = {
          ...input,
          pointerX: input.aimX,
          pointerY: input.aimY,
        };
        this.setLastInput(lastInput);
        this.session.stepRuntimeWithInput(input);
        const row = this.getHash(this.session.getRuntime().frame);
        if (row) {
          rows.push({ ...row, action: describePresetScriptAction(offset) });
        }
      }
    } finally {
      this.debugInputLocked = false;
    }
    return rows;
  }

  spawnPoint(size: DebugPointSize): boolean {
    if (this.sceneData.mode === "online" || this.sceneData.mode === "local") {
      return false;
    }
    const pointer = getBattlePointerWorld(this.scene, this.mobileControls, this.arenaBounds);
    this.session.getRuntime().debugSpawnPoint({
      rewardSize: pointRewardSizeForDebugSize(size),
      x: pointer.x,
      y: pointer.y,
    });
    this.session.recordOutputFrame();
    return true;
  }

  setPoint(pointCount: number): boolean {
    if (this.sceneData.mode === "online" || this.sceneData.mode === "local") {
      return false;
    }
    this.session.getRuntime().debugSetPoint(pointCount);
    this.session.recordOutputFrame();
    return true;
  }

  passStoryStage(): boolean {
    if (!this.sceneData.story) {
      return false;
    }
    this.scene.events.emit(BattleEvents.GO_TO_STORY_RESULT, true);
    return true;
  }

  setDebugPhysicsEnabled(enabled: boolean): void {
    this.debugPhysicsEnabled = enabled;
    this.view.setDebugPhysics(enabled);
    const runtime = this.session.getRuntime();
    if (enabled && runtime.physicsReady) {
      this.view.renderDebugBodies(runtime.readDebugBodies());
    }
  }

  isDebugPhysicsEnabled(): boolean {
    return this.debugPhysicsEnabled;
  }

  isInputLocked(): boolean {
    return this.debugInputLocked;
  }
}
