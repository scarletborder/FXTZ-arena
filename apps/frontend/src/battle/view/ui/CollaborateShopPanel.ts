import Phaser from "phaser";
import { getAbilityCardDefinition } from "@repo/content";
import { GAME_HEIGHT, GAME_WIDTH } from "@repo/constants";
import { t } from "@repo/i18n";
import type {
  AbilityCardId,
  CollaborateExtraState,
  CollaborateShopItemState,
} from "@repo/types";
import type { AbilityCardDefinition, FighterState } from "@repo/content";

import { abilityCardIconTextureKey } from "../../../ability-card-assets";
import { Depth } from "../../../utils/depth";
import { settingsRepository } from "../../../store/settings";
import type { CanonicalFighterKey } from "../../../network/combat/types";

interface ShopPanelCallbacks {
  readonly onPurchase: (itemId: string) => void;
  readonly onReady: () => void;
  readonly onSwitchActiveCard: (cardId: AbilityCardId) => void;
}

interface ShopItemVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly iconBg: Phaser.GameObjects.Rectangle;
  readonly iconText: Phaser.GameObjects.Text;
  readonly iconImage: Phaser.GameObjects.Image;
  readonly name: Phaser.GameObjects.Text;
  readonly price: Phaser.GameObjects.Text;
  readonly soldOutOverlay: Phaser.GameObjects.Rectangle;
  readonly soldOutText: Phaser.GameObjects.Text;
  itemId: string;
}

interface CardVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Image;
  readonly name: Phaser.GameObjects.Text;
  readonly activeMark: Phaser.GameObjects.Text;
  cardId: AbilityCardId | undefined;
}

const BASE_ITEM_KINDS = new Set(["life", "bomb", "point"]);
const SHOP_ITEM_WIDTH = 96;
const SHOP_ITEM_STEP = 108;
const SHOP_GOODS_CENTER_X = -156;

type ShopKeyboardSurface = "goods" | "bag";

export class CollaborateShopPanel {
  private container: Phaser.GameObjects.Container | undefined;
  private title: Phaser.GameObjects.Text | undefined;
  private money: Phaser.GameObjects.Text | undefined;
  private readyButton: Phaser.GameObjects.Container | undefined;
  private readyButtonBg: Phaser.GameObjects.Rectangle | undefined;
  private readyButtonText: Phaser.GameObjects.Text | undefined;
  private p1Check: Phaser.GameObjects.Text | undefined;
  private p2Check: Phaser.GameObjects.Text | undefined;
  private bagButtonBg: Phaser.GameObjects.Rectangle | undefined;
  private readonly itemVisuals: ShopItemVisual[] = [];
  private hoverItemId: string | undefined;
  private preview: Phaser.GameObjects.Container | undefined;
  private previewBg: Phaser.GameObjects.Rectangle | undefined;
  private previewText: Phaser.GameObjects.Text | undefined;
  private bagDialog: Phaser.GameObjects.Container | undefined;
  private bagTitle: Phaser.GameObjects.Text | undefined;
  private readonly bagCardVisuals: CardVisual[] = [];
  private readyProgressBg: Phaser.GameObjects.Rectangle | undefined;
  private readyProgressFill: Phaser.GameObjects.Rectangle | undefined;
  private keyboardSurface: ShopKeyboardSurface = "goods";
  private selectedItemIndex = 0;
  private selectedBagCardIndex = 0;
  private readonly orderedGoods: CollaborateShopItemState[] = [];
  private readonly activeCards: AbilityCardDefinition[] = [];
  private readyHoldProgress = 0;
  private interactionDisabled = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: ShopPanelCallbacks,
  ) {}

  update(
    extra: CollaborateExtraState | undefined,
    localKey: CanonicalFighterKey,
    fighters: Readonly<Record<CanonicalFighterKey, FighterState>>,
  ): void {
    const previewOpening =
      extra?.state === "transition_sync" &&
      extra.pendingTransitionTarget === "shop";
    if (!extra?.shop.open && !previewOpening) {
      this.destroy();
      return;
    }

    this.ensure();
    const shop = extra.shop;
    this.interactionDisabled = !shop.open;
    const localGoods = shop.goodsByPlayerId[localKey] ?? shop.goods;
    const localMoney = extra.moneyByPlayerId[localKey];
    const localReady = shop.readyByPlayerId[localKey];
    const localRevived = shop.revivedByPlayerId[localKey];

    this.syncGoods(localGoods);
    this.syncActiveCards(fighters[localKey]);
    const hoverItem = this.orderedGoods.find((item) => item.id === this.hoverItemId);

    this.title?.setText(t("battle.shop_title", { index: shop.open ? shop.shopIndex : shop.shopIndex + 1 }));
    this.money?.setText(formatMoneyDisplay({ extra, localKey, hoverItem }));
    this.money?.setColor(
      !hoverItem || hoverItem.kind === "sold_out"
        ? "#f7e5aa"
        : localMoney >= hoverItem.price
          ? "#92e6a7"
          : "#ff6b6b",
    );
    this.p1Check?.setText(checkText("Player1", shop.readyByPlayerId.Player1));
    this.p2Check?.setText(checkText("Player2", shop.readyByPlayerId.Player2));

    this.renderGoods(extra, localKey, this.interactionDisabled || localReady || localRevived);
    this.renderPreview(hoverItem, localRevived);
    this.renderBagDialog(fighters[localKey]);
    this.readyButtonText?.setText(
      localReady || localRevived ? t("battle.shop_ready_done") : t("battle.shop_ready"),
    );
    this.readyButtonBg?.setFillStyle(localReady || localRevived ? 0x50606a : 0xd94b4b, 1);
    this.readyButton?.setAlpha(localReady || localRevived ? 0.65 : 1);
    this.bagButtonBg?.setFillStyle(this.bagDialog?.visible ? 0x31424c : 0x182834, 1);
    this.renderReadyProgress(localReady || localRevived);
    this.container?.setVisible(true);
  }

  moveSelection(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
    if (this.keyboardSurface === "bag" && this.bagDialog?.visible) {
      this.moveBagSelection(dx, dy);
      return;
    }
    this.moveGoodsSelection(dx, dy);
  }

  activateSelection(): void {
    if (this.keyboardSurface === "bag" && this.bagDialog?.visible) {
      const card = this.activeCards[this.selectedBagCardIndex];
      if (card?.kind === "active") {
        this.callbacks.onSwitchActiveCard(card.id as AbilityCardId);
      }
      return;
    }
    const item = this.orderedGoods[this.selectedItemIndex];
    if (item?.id && !this.interactionDisabled) {
      this.callbacks.onPurchase(item.id);
    }
  }

  toggleKeyboardSurface(): void {
    this.ensure();
    this.ensureBagDialog();
    const showBag = !(this.bagDialog?.visible ?? false);
    this.keyboardSurface = showBag ? "bag" : "goods";
    this.bagDialog?.setVisible(showBag);
    if (!showBag) {
      this.hoverItemId = this.orderedGoods[this.selectedItemIndex]?.id;
    }
  }

  setReadyHoldProgress(progress: number): void {
    this.readyHoldProgress = Phaser.Math.Clamp(progress, 0, 1);
  }

  destroy(): void {
    this.container?.destroy();
    this.container = undefined;
    this.title = undefined;
    this.money = undefined;
    this.readyButton = undefined;
    this.readyButtonBg = undefined;
    this.readyButtonText = undefined;
    this.p1Check = undefined;
    this.p2Check = undefined;
    this.bagButtonBg = undefined;
    this.hoverItemId = undefined;
    this.itemVisuals.length = 0;
    this.preview = undefined;
    this.previewBg = undefined;
    this.previewText = undefined;
    this.bagDialog = undefined;
    this.bagTitle = undefined;
    this.readyProgressBg = undefined;
    this.readyProgressFill = undefined;
    this.keyboardSurface = "goods";
    this.selectedItemIndex = 0;
    this.selectedBagCardIndex = 0;
    this.orderedGoods.length = 0;
    this.activeCards.length = 0;
    this.readyHoldProgress = 0;
    this.bagCardVisuals.length = 0;
  }

  private ensure(): void {
    if (this.container) return;

    const container = this.scene.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setScrollFactor(0)
      .setDepth(Depth.OnlineStatus + 2);
    container.setAlpha(0).setY(GAME_HEIGHT / 2 + 28).setScale(0.97);
    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      y: GAME_HEIGHT / 2,
      scale: 1,
      duration: 420,
      ease: "Cubic.easeOut",
    });
    const bg = this.scene.add
      .rectangle(0, 0, 920, 500, 0x101820, 0.95)
      .setStrokeStyle(2, 0xffcf6e, 0.95);
    const title = this.scene.add
      .text(0, -212, "", {
        fontFamily: "Arial",
        fontSize: "26px",
        fontStyle: "700",
        color: "#fff4d6",
      })
      .setOrigin(0.5);
    const money = this.scene.add
      .text(420, -212, "", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#f7e5aa",
        align: "right",
      })
      .setOrigin(1, 0.5);

    const bagButton = this.scene.add.container(-282, 204);
    const bagButtonBg = this.scene.add
      .rectangle(0, 0, 170, 40, 0x182834, 1)
      .setStrokeStyle(1, 0xffcf6e, 0.8);
    const bagText = this.scene.add
      .text(0, 0, t("battle.shop_bag"), {
        fontFamily: "Arial",
        fontSize: "15px",
        fontStyle: "700",
        color: "#fff4d6",
      })
      .setOrigin(0.5);
    bagButton.add([bagButtonBg, bagText]);
    bagButton.setSize(170, 40);
    bagButton.setInteractive(
      new Phaser.Geom.Rectangle(-85, -20, 170, 40),
      Phaser.Geom.Rectangle.Contains,
    );
    bagButton.on("pointerdown", () => {
      this.ensureBagDialog();
      this.bagDialog?.setVisible(!this.bagDialog.visible);
    });

    const readyGroup = this.scene.add.container(240, 204);
    const p1Check = this.scene.add
      .text(-112, 0, "", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#f6f1e6",
      })
      .setOrigin(0, 0.5);
    const p2Check = this.scene.add
      .text(-44, 0, "", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#f6f1e6",
      })
      .setOrigin(0, 0.5);
    const readyButton = this.scene.add.container(72, 0);
    const readyButtonBg = this.scene.add
      .rectangle(0, 0, 120, 40, 0xd94b4b, 1)
      .setStrokeStyle(1, 0xffffff, 0.45);
    const readyButtonText = this.scene.add
      .text(0, 0, "", {
        fontFamily: "Arial",
        fontSize: "17px",
        fontStyle: "700",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    const readyProgressBg = this.scene.add
      .rectangle(72, 25, 120, 5, 0x071018, 0.95)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.18);
    const readyProgressFill = this.scene.add
      .rectangle(12, 25, 0, 5, 0xffcf6e, 1)
      .setOrigin(0, 0.5);
    readyButton.add([readyButtonBg, readyButtonText]);
    readyButton.setSize(120, 40);
    readyButton.setInteractive(
      new Phaser.Geom.Rectangle(-60, -20, 120, 40),
      Phaser.Geom.Rectangle.Contains,
    );
    readyButton.on("pointerdown", () => {
      if (!this.interactionDisabled) this.callbacks.onReady();
    });
    readyGroup.add([p1Check, p2Check, readyButton, readyProgressBg, readyProgressFill]);

    container.add([bg, title, money, bagButton, readyGroup]);
    this.container = container;
    this.title = title;
    this.money = money;
    this.readyButton = readyButton;
    this.readyButtonBg = readyButtonBg;
    this.readyButtonText = readyButtonText;
    this.p1Check = p1Check;
    this.p2Check = p2Check;
    this.bagButtonBg = bagButtonBg;
    this.readyProgressBg = readyProgressBg;
    this.readyProgressFill = readyProgressFill;
  }

  private syncGoods(goods: readonly CollaborateShopItemState[]): void {
    const baseGoods = goods.filter((item) => BASE_ITEM_KINDS.has(item.kind));
    const cardGoods = goods.filter((item) => !BASE_ITEM_KINDS.has(item.kind));
    this.orderedGoods.splice(0, this.orderedGoods.length, ...baseGoods, ...cardGoods);
    if (this.selectedItemIndex >= this.orderedGoods.length) {
      this.selectedItemIndex = Math.max(0, this.orderedGoods.length - 1);
    }
    this.hoverItemId = this.orderedGoods[this.selectedItemIndex]?.id;
  }

  private syncActiveCards(fighter: FighterState): void {
    const cards = fighter.abilityCards.filter((card) => card.kind === "active");
    this.activeCards.splice(0, this.activeCards.length, ...cards);
    if (this.selectedBagCardIndex >= this.activeCards.length) {
      this.selectedBagCardIndex = Math.max(0, this.activeCards.length - 1);
    }
  }

  private renderGoods(
    extra: CollaborateExtraState,
    localKey: CanonicalFighterKey,
    disabled: boolean,
  ): void {
    const baseCount = this.orderedGoods.filter((item) => BASE_ITEM_KINDS.has(item.kind)).length;
    const cardCount = this.orderedGoods.length - baseCount;
    this.ensureItemVisuals(this.orderedGoods.length);
    for (let index = 0; index < this.itemVisuals.length; index += 1) {
      const visual = this.itemVisuals[index];
      const item = this.orderedGoods[index];
      if (!item) {
        visual.container.setVisible(false);
        continue;
      }
      const row = index < baseCount ? 0 : 1;
      const rowIndex = row === 0 ? index : index - baseCount;
      const rowCount = row === 0 ? baseCount : cardCount;
      const startX = SHOP_GOODS_CENTER_X - ((rowCount - 1) * SHOP_ITEM_STEP) / 2;
      const bought = extra.shop.purchasesByPlayerId[localKey].includes(item.id);
      const soldOut = item.kind === "sold_out";
      const selected = this.keyboardSurface === "goods" && index === this.selectedItemIndex;

      visual.itemId = item.id;
      visual.container.setPosition(startX + rowIndex * SHOP_ITEM_STEP, row === 0 ? -96 : 54);
      visual.container.setVisible(true);
      visual.bg.setFillStyle(
        selected ? 0x2f3f24 : bought ? 0x000000 : soldOut ? 0x31424c : 0x182834,
        1,
      );
      visual.bg.setStrokeStyle(
        selected ? 3 : 2,
        selected ? 0xf9f871 : bought ? 0x92e6a7 : soldOut ? 0x70808a : 0xffcf6e,
        selected ? 1 : bought ? 0.75 : soldOut ? 0.6 : 0.95,
      );
      setItemIcon(visual, item);
      visual.name.setText(itemName(item));
      visual.price.setText(soldOut ? "--" : String(item.price));
      visual.soldOutOverlay.setVisible(bought);
      visual.soldOutText.setText(t("battle.shop_item_sold_out")).setVisible(bought);
      visual.container.setAlpha((disabled && !bought) || soldOut ? 0.55 : 1);
    }
  }

  private ensureItemVisuals(count: number): void {
    if (!this.container) return;
    while (this.itemVisuals.length < count) {
      const container = this.scene.add.container(0, 0);
      const bg = this.scene.add
        .rectangle(0, 0, SHOP_ITEM_WIDTH, 124, 0x182834, 1)
        .setStrokeStyle(2, 0xffcf6e, 0.95);
      const iconBg = this.scene.add
        .rectangle(0, -30, 42, 42, 0x263845, 1)
        .setStrokeStyle(1, 0xffffff, 0.2);
      const iconText = this.scene.add
        .text(0, -30, "", {
          fontFamily: "Arial",
          fontSize: "20px",
          fontStyle: "700",
          color: "#fff4d6",
          align: "center",
        })
        .setOrigin(0.5);
      const iconImage = this.scene.add.image(0, -30, "").setDisplaySize(36, 36).setVisible(false);
      const name = this.scene.add
        .text(0, 15, "", {
          fontFamily: "Arial",
          fontSize: "13px",
          fontStyle: "700",
          color: "#fff4d6",
          align: "center",
          wordWrap: { width: 84 },
        })
        .setOrigin(0.5);
      const price = this.scene.add
        .text(0, 48, "", {
          fontFamily: "Arial",
          fontSize: "15px",
          color: "#ffcf6e",
        })
        .setOrigin(0.5);
      const soldOutOverlay = this.scene.add
        .rectangle(0, 0, SHOP_ITEM_WIDTH, 124, 0x000000, 0.92)
        .setVisible(false);
      const soldOutText = this.scene.add
        .text(0, 0, "", {
          fontFamily: "Arial",
          fontSize: "18px",
          fontStyle: "700",
          color: "#f6f1e6",
          align: "center",
          lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setVisible(false);
      container.add([bg, iconBg, iconText, iconImage, name, price, soldOutOverlay, soldOutText]);
      container.setSize(SHOP_ITEM_WIDTH, 124);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-SHOP_ITEM_WIDTH / 2, -62, SHOP_ITEM_WIDTH, 124),
        Phaser.Geom.Rectangle.Contains,
      );
      container.on("pointerover", () => {
        const visual = this.itemVisuals.find((item) => item.container === container);
        this.hoverItemId = visual?.itemId;
      });
      container.on("pointerout", () => {
        const visual = this.itemVisuals.find((item) => item.container === container);
        if (this.hoverItemId === visual?.itemId) {
          this.hoverItemId = undefined;
        }
      });
      container.on("pointerdown", () => {
        const visual = this.itemVisuals.find((item) => item.container === container);
        if (visual?.itemId && !this.interactionDisabled) this.callbacks.onPurchase(visual.itemId);
      });
      this.container.add(container);
      this.itemVisuals.push({
        container,
        bg,
        iconBg,
        iconText,
        iconImage,
        name,
        price,
        soldOutOverlay,
        soldOutText,
        itemId: "",
      });
    }
  }

  private renderPreview(item: CollaborateShopItemState | undefined, revived: boolean): void {
    this.ensurePreview();
    if (revived) {
      this.previewText?.setText(t("battle.shop_revived_no_purchase"));
      this.previewBg?.setSize(250, 324);
      this.preview?.setVisible(true);
      return;
    }
    if (!item) {
      this.previewText?.setText(t("battle.shop_preview_empty"));
      this.preview?.setVisible(true);
      return;
    }
    const text = itemPreview(item, getKeyDisplayName(settingsRepository.get().keybinds.activeCard));
    this.previewText?.setText(text);
    this.previewBg?.setSize(250, 324);
    this.preview?.setVisible(true);
  }

  private ensurePreview(): void {
    if (this.preview || !this.container) return;
    const preview = this.scene.add.container(324, -6);
    const bg = this.scene.add
      .rectangle(0, 0, 250, 324, 0x071018, 0.96)
      .setStrokeStyle(1, 0xffcf6e, 0.75);
    const text = this.scene.add
      .text(-108, -142, "", {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#f6f1e6",
        align: "left",
        lineSpacing: 5,
        wordWrap: { width: 216 },
      })
      .setOrigin(0, 0);
    preview.add([bg, text]);
    this.container.add(preview);
    this.preview = preview;
    this.previewBg = bg;
    this.previewText = text;
  }

  private renderReadyProgress(ready: boolean): void {
    const visible = !ready && this.readyHoldProgress > 0;
    this.readyProgressBg?.setVisible(visible);
    this.readyProgressFill?.setVisible(visible);
    this.readyProgressFill?.setSize(120 * this.readyHoldProgress, 5);
  }

  private ensureBagDialog(): void {
    if (this.bagDialog || !this.container) return;
    const dialog = this.scene.add.container(0, 0).setVisible(false);
    const dim = this.scene.add.rectangle(0, 0, 760, 500, 0x000000, 0.34);
    const bg = this.scene.add
      .rectangle(0, 0, 520, 300, 0x101820, 0.98)
      .setStrokeStyle(2, 0x92e6a7, 0.9);
    const title = this.scene.add
      .text(0, -120, t("battle.shop_bag_title"), {
        fontFamily: "Arial",
        fontSize: "22px",
        fontStyle: "700",
        color: "#fff4d6",
      })
      .setOrigin(0.5);
    const close = this.scene.add.container(222, -120);
    const closeBg = this.scene.add
      .rectangle(0, 0, 34, 30, 0x263845, 1)
      .setStrokeStyle(1, 0xffffff, 0.3);
    const closeText = this.scene.add
      .text(0, 0, "X", {
        fontFamily: "Arial",
        fontSize: "16px",
        fontStyle: "700",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    close.add([closeBg, closeText]);
    close.setSize(34, 30);
    close.setInteractive(
      new Phaser.Geom.Rectangle(-17, -15, 34, 30),
      Phaser.Geom.Rectangle.Contains,
    );
    close.on("pointerdown", () => dialog.setVisible(false));
    dialog.add([dim, bg, title, close]);
    this.container.add(dialog);
    this.bagDialog = dialog;
    this.bagTitle = title;
  }

  private renderBagDialog(fighter: FighterState): void {
    if (!this.bagDialog?.visible) return;
    this.bagTitle?.setText(t("battle.shop_bag_title"));
    this.syncActiveCards(fighter);
    this.ensureBagCardVisuals(this.activeCards.length || 1);
    if (this.activeCards.length === 0) {
      const visual = this.bagCardVisuals[0];
      if (!visual) return;
      visual.container.setVisible(true).setPosition(0, 20);
      visual.bg.setFillStyle(0x263845, 1).setStrokeStyle(1, 0x70808a, 0.7);
      visual.icon.setVisible(false);
      visual.name.setText(t("battle.shop_bag_empty"));
      visual.activeMark.setText("");
      visual.cardId = undefined;
      return;
    }
    for (let index = 0; index < this.bagCardVisuals.length; index += 1) {
      const visual = this.bagCardVisuals[index];
      const card = this.activeCards[index];
      if (!card) {
        visual.container.setVisible(false);
        continue;
      }
      const active = fighter.activeCard?.id === card.id;
      const selected = this.keyboardSurface === "bag" && index === this.selectedBagCardIndex;
      visual.container.setVisible(true);
      visual.container.setPosition(-180 + index * 120, 18);
      visual.bg.setFillStyle(selected ? 0x2f3f24 : active ? 0x274634 : 0x182834, 1);
      visual.bg.setStrokeStyle(
        selected ? 3 : 2,
        selected ? 0xf9f871 : active ? 0x92e6a7 : 0xffcf6e,
        selected ? 1 : active ? 0.95 : 0.75,
      );
      visual.icon.setTexture(abilityCardIconTextureKey(card.id)).setVisible(true);
      visual.name.setText(card.name);
      visual.activeMark.setText(active ? t("battle.shop_bag_active") : "");
      visual.cardId = card.id as AbilityCardId;
    }
  }

  private ensureBagCardVisuals(count: number): void {
    if (!this.bagDialog) return;
    while (this.bagCardVisuals.length < count) {
      const container = this.scene.add.container(0, 0);
      const bg = this.scene.add
        .rectangle(0, 0, 96, 132, 0x182834, 1)
        .setStrokeStyle(2, 0xffcf6e, 0.75);
      const icon = this.scene.add.image(0, -30, "").setDisplaySize(48, 48);
      const name = this.scene.add
        .text(0, 25, "", {
          fontFamily: "Arial",
          fontSize: "13px",
          fontStyle: "700",
          color: "#fff4d6",
          align: "center",
          wordWrap: { width: 84 },
        })
        .setOrigin(0.5);
      const activeMark = this.scene.add
        .text(0, 52, "", {
          fontFamily: "Arial",
          fontSize: "12px",
          color: "#92e6a7",
        })
        .setOrigin(0.5);
      container.add([bg, icon, name, activeMark]);
      container.setSize(96, 132);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-48, -66, 96, 132),
        Phaser.Geom.Rectangle.Contains,
      );
      container.on("pointerdown", () => {
        const visual = this.bagCardVisuals.find((item) => item.container === container);
        if (visual?.cardId) this.callbacks.onSwitchActiveCard(visual.cardId);
      });
      this.bagDialog.add(container);
      this.bagCardVisuals.push({ container, bg, icon, name, activeMark, cardId: undefined });
    }
  }

  private moveGoodsSelection(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
    if (this.orderedGoods.length === 0) return;
    if (dy !== 0) {
      this.selectedItemIndex = moveGoodsRow(this.orderedGoods, this.selectedItemIndex, dy);
    } else if (dx !== 0) {
      this.selectedItemIndex = wrapIndex(this.selectedItemIndex + dx, this.orderedGoods.length);
    }
    this.hoverItemId = this.orderedGoods[this.selectedItemIndex]?.id;
  }

  private moveBagSelection(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
    if (this.activeCards.length === 0) return;
    const delta = dx !== 0 ? dx : dy;
    if (delta !== 0) {
      this.selectedBagCardIndex = wrapIndex(this.selectedBagCardIndex + delta, this.activeCards.length);
    }
  }
}

function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index + count) % count;
}

function moveGoodsRow(
  goods: readonly CollaborateShopItemState[],
  selectedIndex: number,
  dy: -1 | 1,
): number {
  const baseCount = goods.filter((item) => BASE_ITEM_KINDS.has(item.kind)).length;
  const cardCount = goods.length - baseCount;
  if (baseCount === 0 || cardCount === 0) {
    return wrapIndex(selectedIndex + dy, goods.length);
  }
  const fromBase = selectedIndex < baseCount;
  if ((fromBase && dy < 0) || (!fromBase && dy > 0)) {
    return selectedIndex;
  }
  const sourceCount = fromBase ? baseCount : cardCount;
  const targetCount = fromBase ? cardCount : baseCount;
  const sourceIndex = fromBase ? selectedIndex : selectedIndex - baseCount;
  const targetIndex = Math.min(targetCount - 1, Math.round((sourceIndex / Math.max(1, sourceCount - 1)) * Math.max(0, targetCount - 1)));
  return fromBase ? baseCount + targetIndex : targetIndex;
}

function checkText(player: "Player1" | "Player2", checked: boolean): string {
  return t(checked ? "battle.shop_checked_player" : "battle.shop_unchecked_player", {
    player: player === "Player1" ? "P1" : "P2",
  });
}

function setItemIcon(visual: ShopItemVisual, item: CollaborateShopItemState): void {
  if (item.kind === "ability_card" && item.abilityCardId) {
    visual.iconImage
      .setTexture(abilityCardIconTextureKey(item.abilityCardId as AbilityCardId))
      .setVisible(true);
    visual.iconText.setVisible(false);
    return;
  }
  visual.iconImage.setVisible(false);
  visual.iconText.setVisible(true);
  switch (item.kind) {
    case "life":
      visual.iconText.setText("L");
      return;
    case "bomb":
      visual.iconText.setText("B");
      return;
    case "point":
      visual.iconText.setText("P");
      return;
    case "sold_out":
      visual.iconText.setText("-");
      return;
    case "ability_card":
      visual.iconText.setText("C");
      return;
  }
}

function itemName(item: CollaborateShopItemState): string {
  switch (item.kind) {
    case "life":
      return t("battle.shop_item_life");
    case "bomb":
      return t("battle.shop_item_bomb");
    case "point":
      return t("battle.shop_item_point");
    case "ability_card":
      return abilityCard(item)?.name ?? t("battle.shop_item_card");
    case "sold_out":
      return t("battle.shop_item_sold_out");
  }
}

function itemDescription(item: CollaborateShopItemState): string {
  switch (item.kind) {
    case "life":
      return t("battle.shop_item_life_desc");
    case "bomb":
      return t("battle.shop_item_bomb_desc");
    case "point":
      return t("battle.shop_item_point_desc");
    case "ability_card":
      return abilityCard(item)?.description ?? t("battle.shop_item_card_desc");
    case "sold_out":
      return t("battle.shop_item_sold_out_desc");
  }
}

function itemPreview(item: CollaborateShopItemState, activeKeyName: string): string {
  const card = abilityCard(item);
  const rarity =
    card?.collaborateShop?.rarity === "rare" ? "rare" : "common";
  const category =
    item.kind === "ability_card" && card?.kind === "active"
      ? t("battle.shop_category_active_card")
      : item.kind === "ability_card"
        ? t("battle.shop_category_passive_card")
        : t("battle.shop_category_item");
  const lines = [
    t("battle.shop_preview_name_rarity", {
      name: itemName(item),
      rarity,
    }),
    item.kind === "sold_out"
      ? t("battle.shop_price_sold_out")
      : t("battle.shop_price", { price: item.price }),
    t("battle.shop_preview_category", { category }),
  ];

  if (card?.kind === "active") {
    lines.push(
      t("battle.shop_preview_cooldown", {
        cooldown: formatCooldown(card.cooldownTicks),
      }),
      t("battle.shop_preview_uses", {
        uses: card.useLimit === "infinite" ? t("battle.shop_uses_infinite") : card.useLimit,
      }),
    );
  }

  lines.push("", itemDescription(item), "", t("battle.shop_buy_hint", { key: activeKeyName }));
  return lines.join("\n");
}

function abilityCard(
  item: CollaborateShopItemState,
): AbilityCardDefinition | undefined {
  return item.abilityCardId
    ? getAbilityCardDefinition(item.abilityCardId as AbilityCardId)
    : undefined;
}

function formatCooldown(ticks: number): string {
  if (ticks <= 0) {
    return t("battle.shop_cooldown_none");
  }
  return t("battle.shop_cooldown_seconds", {
    seconds: Math.round((ticks / 60) * 10) / 10,
  });
}

function getKeyDisplayName(value: string | number): string {
  if (typeof value === "string") {
    return value.toUpperCase();
  }
  for (const [name, code] of Object.entries(Phaser.Input.Keyboard.KeyCodes)) {
    if (code === value) {
      return name.toUpperCase();
    }
  }
  return String(value);
}

function formatMoneyDisplay(params: {
  readonly extra: CollaborateExtraState;
  readonly localKey: CanonicalFighterKey;
  readonly hoverItem: CollaborateShopItemState | undefined;
}): string {
  const p1 = params.extra.moneyByPlayerId.Player1;
  const p2 = params.extra.moneyByPlayerId.Player2;
  const local = params.extra.moneyByPlayerId[params.localKey];
  const suffix =
    params.hoverItem && params.hoverItem.kind !== "sold_out"
      ? `(-${params.hoverItem.price})`
      : "";
  const p1Text =
    params.localKey === "Player1"
      ? t("battle.shop_money_local", { value: `${local}${suffix}` })
      : t("battle.shop_money_peer", { value: p1 });
  const p2Text =
    params.localKey === "Player2"
      ? t("battle.shop_money_local", { value: `${local}${suffix}` })
      : t("battle.shop_money_peer", { value: p2 });
  return t("battle.shop_money_pair", { p1: p1Text, p2: p2Text });
}
