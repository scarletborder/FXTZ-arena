export * from "./pc";
export * from "./mobile";
export * from "./gamepad";
import Phaser from "phaser";


import { type BattleInputState } from "@repo/raid-logic";
import { type ArenaBounds, BattleEvents } from "@repo/constants";
import { BattleKeyMap, createBattleInput, getBattlePointerWorld, type BattleInputBundle } from "./input";
import { BattleSceneData } from "../loadout";
import { BattleMobileControls, shouldEnableMobileBattleControls } from "./mobile";
import { BattleKeybinds, createBattleKeybinds } from "./pc";
import { BattleJoystickController, InputProfileId } from "./gamepad";
import { resolveAccountBattleProfile } from "./profile";
import { settingsRepository } from "../../store/settings";

export class BattleInputController {
  private keybinds!: BattleKeybinds;
  private keys!: BattleKeyMap;
  private p2Keybinds: BattleKeybinds | undefined;
  private p2Keys: BattleKeyMap | undefined;
  private mobileControls: BattleMobileControls | undefined;
  private joystickControls: BattleJoystickController | undefined;
  private p2JoystickControls: BattleJoystickController | undefined;
  private readonly activeProfile: InputProfileId;
  private readonly p2Profile: InputProfileId | undefined;
  private mobileControlsEnabled = false;
  private previousScaleAutoCenter: Phaser.Scale.CenterType | undefined;
  private lastInput!: BattleInputState & { readonly pointerX: number; readonly pointerY: number };
  private lastP2Input: BattleInputBundle | undefined;

  private transitionReadyRequested = false;
  private shopReadyRequested = false;

  constructor(
    private scene: Phaser.Scene,
    sceneData: BattleSceneData,
    private arenaBounds: ArenaBounds
  ) {
    this.mobileControlsEnabled =
      shouldEnableMobileBattleControls(scene) &&
      resolveActiveProfile(sceneData) === "mobile" &&
      !sceneData.replayData &&
      !sceneData.spectatorData;

    if (this.mobileControlsEnabled) {
      this.previousScaleAutoCenter = scene.scale.autoCenter;
      scene.scale.autoCenter = Phaser.Scale.CENTER_HORIZONTALLY;
    }

    const keybinds = settingsRepository.get().keybinds;
    this.activeProfile = resolveActiveProfile(sceneData);
    this.p2Profile = sceneData.localSingleDevice ? resolveLocalSingleP2Profile() : undefined;
    this.keybinds = createBattleKeybinds(scene, keybinds);
    this.keys = this.keybinds.keys;
    this.joystickControls = createJoystickController(scene, this.activeProfile);
    if (sceneData.localSingleDevice) {
      this.p2Keybinds = createBattleKeybinds(scene, keybinds);
      this.p2Keys = this.p2Keybinds.keys;
      this.p2JoystickControls = this.p2Profile ? createJoystickController(scene, this.p2Profile) : undefined;
    }

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
      {
        mobileControls: this.mobileControls,
        joystickControls: this.joystickControls,
        keyboardEnabled: this.activeProfile === "keyboard",
        pointerEnabled: this.activeProfile === "keyboard",
        arenaBounds: this.arenaBounds,
      },
    );
    if (this.p2Keys) {
      this.lastP2Input = createBattleInput(
        scene,
        this.p2Keys,
        this.p2InputOptions(),
      );
    }
  }

  getKeys(): BattleKeyMap {
    return this.keys;
  }

  getLastInput(): BattleInputState & { readonly pointerX: number; readonly pointerY: number } {
    return this.lastInput;
  }

  getLastP2Input(): BattleInputBundle | undefined {
    return this.lastP2Input;
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
      {
        mobileControls: this.mobileControls,
        joystickControls: this.joystickControls,
        keyboardEnabled: this.activeProfile === "keyboard",
        pointerEnabled: this.activeProfile === "keyboard",
        autoReloadContext: { fighter, previousShotsFired },
        arenaBounds: this.arenaBounds,
      },
    ) as BattleInputState & { readonly pointerX: number; readonly pointerY: number; transitionReadyPressed?: boolean; shopReadyPressed?: boolean; shopPurchaseItemId?: string; activeCardSwitchId?: string };

    input = this.applyCollaborateTransitionReady(input, getCollaborateExtra(), localFighterKey);
    input = this.applyCollaborateShopInput(input, getCollaborateExtra(), localFighterKey, pendingShopPurchaseItemId, pendingActiveCardSwitchId, clearPendingPurchases);

    this.lastInput = input;
    return input;
  }

  generateP2Input(
    fighter: any,
    previousShotsFired: number,
  ): BattleInputBundle | undefined {
    if (!this.p2Keys) {
      return undefined;
    }
    const input = createBattleInput(
      this.scene,
      this.p2Keys,
      {
        ...this.p2InputOptions(),
        autoReloadContext: { fighter, previousShotsFired },
      },
    );
    this.lastP2Input = input;
    return input;
  }

  updateAimCoordinate(): void {
    if (this.activeProfile.startsWith("joystick:")) {
      return;
    }
    const input = createBattleInput(
      this.scene,
      this.keys,
      {
        mobileControls: this.mobileControls,
        joystickControls: this.joystickControls,
        keyboardEnabled: this.activeProfile === "keyboard",
        pointerEnabled: this.activeProfile === "keyboard",
        arenaBounds: this.arenaBounds,
      },
    );
    this.lastInput = {
      ...this.lastInput,
      aimX: input.aimX,
      aimY: input.aimY,
      pointerX: input.pointerX,
      pointerY: input.pointerY,
    };
    if (this.p2Keys) {
      this.lastP2Input = createBattleInput(
        this.scene,
        this.p2Keys,
        this.p2InputOptions(),
      );
    }
  }

  destroy(): void {
    this.keybinds?.destroy();
    this.p2Keybinds?.destroy();
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

  private p2InputOptions(): Parameters<typeof createBattleInput>[2] {
    const useKeyboard = this.p2Profile === "keyboard";
    return {
      joystickControls: this.p2JoystickControls,
      keyboardEnabled: useKeyboard,
      pointerEnabled: useKeyboard,
      arenaBounds: this.arenaBounds,
    };
  }
}

function resolveActiveProfile(sceneData: BattleSceneData): InputProfileId {
  return resolveAccountBattleProfile(settingsRepository.get().account, sceneData);
}

function resolveLocalSingleP2Profile(): InputProfileId {
  return settingsRepository.get().account.p2Profile === "mobile" ? "keyboard" : settingsRepository.get().account.p2Profile;
}

function createJoystickController(
  scene: Phaser.Scene,
  profile: InputProfileId,
): BattleJoystickController | undefined {
  if (!profile.startsWith("joystick:")) {
    return undefined;
  }
  const padIndex = Math.max(0, Number(profile.slice("joystick:".length)) || 0);
  return new BattleJoystickController(scene, settingsRepository.get().joystick, padIndex);
}
