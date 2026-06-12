export * from "./pc";
export * from "./mobile";
import Phaser from "phaser";


import { type BattleInputState } from "@repo/raid-logic";
import { type ArenaBounds, BattleEvents } from "@repo/constants";
import { BattleKeyMap, createBattleInput, getBattlePointerWorld } from "./input";
import { BattleSceneData } from "../loadout";
import { BattleMobileControls, shouldEnableMobileBattleControls } from "./mobile";
import { BattleKeybinds, createBattleKeybinds } from "./pc";
import { uiSettings } from "../../store/settings";

export class BattleInputController {
  private keybinds!: BattleKeybinds;
  private keys!: BattleKeyMap;
  private mobileControls: BattleMobileControls | undefined;
  private mobileControlsEnabled = false;
  private previousScaleAutoCenter: Phaser.Scale.CenterType | undefined;
  private lastInput!: BattleInputState & { readonly pointerX: number; readonly pointerY: number };

  private transitionReadyRequested = false;
  private shopReadyRequested = false;

  constructor(
    private scene: Phaser.Scene,
    private sceneData: BattleSceneData,
    private arenaBounds: ArenaBounds
  ) {
    this.mobileControlsEnabled =
      shouldEnableMobileBattleControls(scene) &&
      !sceneData.replayData &&
      !sceneData.spectatorData;

    if (this.mobileControlsEnabled) {
      this.previousScaleAutoCenter = scene.scale.autoCenter;
      scene.scale.autoCenter = Phaser.Scale.CENTER_HORIZONTALLY;
    }

    const keybinds = uiSettings.keybinds;
    this.keybinds = createBattleKeybinds(scene, keybinds);
    this.keys = this.keybinds.keys;

    this.scene.events.on(BattleEvents.TRANSITION_READY, () => {
      this.transitionReadyRequested = true;
    });

    this.scene.events.on(BattleEvents.SHOP_READY, () => {
      this.shopReadyRequested = true;
    });

    // 【修复】构造阶段采样初始输入，确保 getLastInput() 不会返回 undefined
    this.lastInput = createBattleInput(
      scene,
      this.keys,
      this.mobileControls,
      undefined,
      this.arenaBounds
    );
  }

  getKeys(): BattleKeyMap {
    return this.keys;
  }

  getLastInput(): BattleInputState & { readonly pointerX: number; readonly pointerY: number } {
    return this.lastInput;
  }

  setLastInput(input: any): void {
    this.lastInput = input;
  }

  createMobileControls(layout: any): void {
    this.mobileControls?.destroy();
    if (this.mobileControlsEnabled) {
      this.mobileControls = new BattleMobileControls(this.scene, layout);
    }
  }

  getMobileControls(): BattleMobileControls | undefined {
    return this.mobileControls;
  }

  getPreviousScaleAutoCenter(): Phaser.Scale.CenterType | undefined {
    return this.previousScaleAutoCenter;
  }

  getPointerWorld(): { x: number; y: number } {
    return getBattlePointerWorld(this.scene, this.mobileControls, this.arenaBounds);
  }

  generateInput(
    fighter: any,
    previousShotsFired: number,
    getCollaborateExtra: () => any,
    localFighterKey: "Player1" | "Player2",
    pendingShopPurchaseItemId: string | undefined,
    pendingActiveCardSwitchId: string | undefined,
    clearPendingPurchases: () => void
  ): BattleInputState & { readonly pointerX: number; readonly pointerY: number } {
    let input = createBattleInput(
      this.scene,
      this.keys,
      this.mobileControls,
      { fighter, previousShotsFired },
      this.arenaBounds
    ) as BattleInputState & { readonly pointerX: number; readonly pointerY: number; transitionReadyPressed?: boolean; shopReadyPressed?: boolean; shopPurchaseItemId?: string; activeCardSwitchId?: string };

    input = this.applyCollaborateTransitionReady(input, getCollaborateExtra(), localFighterKey);
    input = this.applyCollaborateShopInput(input, getCollaborateExtra(), localFighterKey, pendingShopPurchaseItemId, pendingActiveCardSwitchId, clearPendingPurchases);

    this.lastInput = input;
    return input;
  }

  updateAimCoordinate(): void {
    const pointerWorld = this.getPointerWorld();
    this.lastInput = {
      ...this.lastInput,
      aimX: Math.trunc(pointerWorld.x),
      aimY: Math.trunc(pointerWorld.y),
      pointerX: pointerWorld.x,
      pointerY: pointerWorld.y,
    };
  }

  destroy(): void {
    this.keybinds?.destroy();
    this.mobileControls?.destroy();
  }

  private applyCollaborateTransitionReady<T extends BattleInputState>(
    input: T,
    extra: any,
    localFighterKey: "Player1" | "Player2"
  ): T {
    if (!extra || extra.state !== "transition_sync") {
      this.transitionReadyRequested = false;
      return { ...input, transitionReadyPressed: false };
    }
    const localReady = localFighterKey === "Player1" ? extra.player1TransitionReady : extra.player2TransitionReady;
    if (localReady) {
      this.transitionReadyRequested = false;
    }
    const shouldReady = !localReady && (extra.transitionType === "auto" || this.transitionReadyRequested);
    if (shouldReady) {
      this.transitionReadyRequested = false;
    }
    return { ...input, transitionReadyPressed: shouldReady };
  }

  private applyCollaborateShopInput<T extends BattleInputState>(
    input: T,
    extra: any,
    localFighterKey: "Player1" | "Player2",
    pendingShopPurchaseItemId: string | undefined,
    pendingActiveCardSwitchId: string | undefined,
    clearPendingPurchases: () => void
  ): T {
    if (!extra?.shop.open) {
      this.shopReadyRequested = false;
      clearPendingPurchases();
      return {
        ...input,
        shopReadyPressed: false,
        shopPurchaseItemId: undefined,
        activeCardSwitchId: undefined,
      };
    }
    const localReady = extra.shop.readyByPlayerId[localFighterKey];
    const purchase = localReady ? undefined : pendingShopPurchaseItemId;
    const ready = !localReady && this.shopReadyRequested;
    const activeCardSwitch = localReady ? undefined : pendingActiveCardSwitchId;

    clearPendingPurchases();
    if (ready) {
      this.shopReadyRequested = false;
    }
    return {
      ...input,
      moveX: 0,
      moveY: 0,
      shootPressed: false,
      bombPressed: false,
      activeCardPressed: false,
      reloadPressed: false,
      alternateHeld: false,
      shopReadyPressed: ready,
      shopPurchaseItemId: purchase,
      activeCardSwitchId: activeCardSwitch,
    };
  }
}