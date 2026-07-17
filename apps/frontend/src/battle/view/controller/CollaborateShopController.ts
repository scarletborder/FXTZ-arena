import Phaser from "phaser";
import { BattleEvents } from "@repo/constants";
import { CollaborateShopPanel } from "../ui/CollaborateShopPanel";
import { BattleKeyMap } from "../../input-controller";
import type { BattleShopPresentationModel } from "../model";

const SHOP_READY_HOLD_MS = 900;

export class CollaborateShopController {
  private panel: CollaborateShopPanel | undefined;
  private pendingShopPurchaseItemId: string | undefined;
  private pendingActiveCardSwitchId: string | undefined;
  private shopInputModeActive = false;
  private shopReadyHoldMs = 0;
  private shopReadyHoldTriggered = false;

  constructor(
    private scene: Phaser.Scene,
    private getKeys: () => BattleKeyMap,
  ) {
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

  update(model: BattleShopPresentationModel, delta: number): void {
    this.panel?.update(model);
    this.updateKeyboard(model, delta);
  }

  private updateKeyboard(model: BattleShopPresentationModel, delta: number): void {
    if (!model.open || !this.panel) {
      this.resetHold();
      return;
    }

    if (model.localReady || model.localDead) {
      this.resetHold();
      this.panel.setReadyHoldProgress(0);
      return;
    }

    const keys = this.getKeys();
    if (Phaser.Input.Keyboard.JustDown(keys.info)) {
      this.panel.toggleKeyboardSurface();
    }

    if (Phaser.Input.Keyboard.JustDown(keys.moveLeft)) {
      this.panel.moveSelection(-1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(keys.moveRight)) {
      this.panel.moveSelection(1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(keys.moveUp)) {
      this.panel.moveSelection(0, -1);
    } else if (Phaser.Input.Keyboard.JustDown(keys.moveDown)) {
      this.panel.moveSelection(0, 1);
    }

    if (Phaser.Input.Keyboard.JustDown(keys.activeCard)) {
      this.panel.activateSelection();
    }

    if (keys.reload.isDown) {
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

  updateCursor(model: BattleShopPresentationModel): void {
    if (model.open !== this.shopInputModeActive) {
      this.shopInputModeActive = model.open;
      this.scene.input.resetPointers();
      if (!model.open) {
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
