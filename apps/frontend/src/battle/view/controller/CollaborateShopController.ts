import Phaser from "phaser";
import { BattleEvents } from "@repo/constants";
import { CollaborateShopPanel } from "../ui/CollaborateShopPanel";

const SHOP_READY_HOLD_MS = 900;

export class CollaborateShopController {
  private panel: CollaborateShopPanel | undefined;
  private pendingShopPurchaseItemId: string | undefined;
  private pendingActiveCardSwitchId: string | undefined;
  private shopInputModeActive = false;
  private shopReadyHoldMs = 0;
  private shopReadyHoldTriggered = false;

  constructor(private scene: Phaser.Scene, private getKeys: () => any) {
    this.panel = new CollaborateShopPanel(scene, {
      onPurchase: (itemId) => {
        this.pendingShopPurchaseItemId = itemId;
      },
      onReady: () => {
        this.scene.events.emit(BattleEvents.SHOP_READY);
      },
      onSwitchActiveCard: (cardId) => {
        this.pendingActiveCardSwitchId = cardId;
      },
    });
  }

  getPendingPurchaseItemId(): string | undefined {
    return this.pendingShopPurchaseItemId;
  }

  getPendingActiveCardSwitchId(): string | undefined {
    return this.pendingActiveCardSwitchId;
  }

  clearPending(): void {
    this.pendingShopPurchaseItemId = undefined;
    this.pendingActiveCardSwitchId = undefined;
  }

  update(
    collaborateExtra: any,
    localFighterKey: "Player1" | "Player2",
    players: { Player1: any; Player2: any },
    delta: number,
    isLocalDead: boolean
  ): void {
    this.panel?.update(collaborateExtra, localFighterKey, players);
    this.updateKeyboard(collaborateExtra, localFighterKey, delta, isLocalDead);
  }

  private updateKeyboard(
    extra: any,
    localFighterKey: "Player1" | "Player2",
    delta: number,
    isLocalDead: boolean
  ): void {
    if (!extra?.shop.open || !this.panel) {
      this.resetHold();
      return;
    }

    const localReady = extra.shop.readyByPlayerId[localFighterKey];
    if (localReady || isLocalDead) {
      this.resetHold();
      this.panel.setReadyHoldProgress(0);
      return;
    }

    const keys = this.getKeys();
    if (Phaser.Input.Keyboard.JustDown(keys.shift)) {
      this.panel.toggleKeyboardSurface();
    }
    if (Phaser.Input.Keyboard.JustDown(keys.a)) {
      this.panel.moveSelection(-1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(keys.d)) {
      this.panel.moveSelection(1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(keys.w)) {
      this.panel.moveSelection(0, -1);
    } else if (Phaser.Input.Keyboard.JustDown(keys.s)) {
      this.panel.moveSelection(0, 1);
    }
    if (Phaser.Input.Keyboard.JustDown(keys.e)) {
      this.panel.activateSelection();
    }

    if (keys.r.isDown) {
      this.shopReadyHoldMs = Math.min(SHOP_READY_HOLD_MS, this.shopReadyHoldMs + delta);
      if (this.shopReadyHoldMs >= SHOP_READY_HOLD_MS && !this.shopReadyHoldTriggered) {
        this.shopReadyHoldTriggered = true;
        this.scene.events.emit(BattleEvents.SHOP_READY);
      }
    } else {
      this.resetHold();
    }
    this.panel.setReadyHoldProgress(this.shopReadyHoldMs / SHOP_READY_HOLD_MS);
  }

  updateCursor(shopOpen: boolean): void {
    if (shopOpen !== this.shopInputModeActive) {
      this.shopInputModeActive = shopOpen;
      this.scene.input.resetPointers();
      if (!shopOpen) {
        this.resetHold();
      }
    }
  }

  resetHold(): void {
    this.shopReadyHoldMs = 0;
    this.shopReadyHoldTriggered = false;
    this.panel?.setReadyHoldProgress(0);
  }

  destroy(): void {
    this.panel?.destroy();
    this.panel = undefined;
  }
}