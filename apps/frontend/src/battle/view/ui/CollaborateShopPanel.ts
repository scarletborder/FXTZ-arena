import Phaser from "phaser";
import { t } from "@repo/i18n";
import { GAME_HEIGHT, GAME_WIDTH } from "@repo/constants";
import type {
  CollaborateExtraState,
  CollaborateShopItemState,
} from "@repo/types";
import type { AbilityCardId } from "@repo/types";
import { getAbilityCardDefinition } from "@repo/content";

import { Depth } from "../../../utils/depth";
import type { CanonicalFighterKey } from "../../../network/combat/types";

interface ShopPanelCallbacks {
  readonly onPurchase: (itemId: string) => void;
  readonly onReady: () => void;
}

interface ShopItemVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Text;
  readonly price: Phaser.GameObjects.Text;
  itemId: string;
}

export class CollaborateShopPanel {
  private container: Phaser.GameObjects.Container | undefined;
  private title: Phaser.GameObjects.Text | undefined;
  private money: Phaser.GameObjects.Text | undefined;
  private readyButton: Phaser.GameObjects.Container | undefined;
  private readyButtonBg: Phaser.GameObjects.Rectangle | undefined;
  private readyButtonText: Phaser.GameObjects.Text | undefined;
  private p1Check: Phaser.GameObjects.Text | undefined;
  private p2Check: Phaser.GameObjects.Text | undefined;
  private readonly itemVisuals: ShopItemVisual[] = [];
  private hoverItemId: string | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly callbacks: ShopPanelCallbacks,
  ) {}

  update(
    extra: CollaborateExtraState | undefined,
    localKey: CanonicalFighterKey,
    fighters: Readonly<Record<CanonicalFighterKey, { readonly deadUntil: number }>>,
  ): void {
    if (!extra?.shop.open) {
      this.destroy();
      return;
    }

    this.ensure();
    const shop = extra.shop;
    const localGoods = shop.goodsByPlayerId[localKey] ?? shop.goods;
    const localMoney = extra.moneyByPlayerId[localKey];
    const hoverItem = localGoods.find((item) => item.id === this.hoverItemId);
    const localReady = shop.readyByPlayerId[localKey];
    const localDead = fighters[localKey].deadUntil > 0;

    this.title?.setText(t("battle.shop_title", { index: shop.shopIndex }));
    this.money?.setText(
      formatMoneyDisplay({
        extra,
        localKey,
        hoverItem,
      }),
    );
    this.money?.setColor(
      !hoverItem
        ? "#f7e5aa"
        : hoverItem.kind === "sold_out"
          ? "#f7e5aa"
          : localMoney >= hoverItem.price
          ? "#92e6a7"
          : "#ff6b6b",
    );
    this.p1Check?.setText(
      shop.readyByPlayerId.Player1
        ? t("battle.shop_checked")
        : t("battle.shop_unchecked"),
    );
    this.p2Check?.setText(
      shop.readyByPlayerId.Player2
        ? t("battle.shop_checked")
        : t("battle.shop_unchecked"),
    );

    this.renderGoods(localGoods, extra, localKey, localReady || localDead);
    this.readyButtonText?.setText(
      localReady || localDead ? t("battle.shop_ready_done") : t("battle.shop_ready"),
    );
    this.readyButtonBg?.setFillStyle(localReady || localDead ? 0x50606a : 0xd94b4b, 1);
    this.readyButton?.setAlpha(localReady || localDead ? 0.65 : 1);
    this.container?.setVisible(true);
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
    this.hoverItemId = undefined;
    this.itemVisuals.length = 0;
  }

  private ensure(): void {
    if (this.container) return;

    const container = this.scene.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setScrollFactor(0)
      .setDepth(Depth.OnlineStatus + 2);
    const bg = this.scene.add
      .rectangle(0, 0, 720, 430, 0x101820, 0.94)
      .setStrokeStyle(2, 0xffcf6e, 0.95);
    const title = this.scene.add
      .text(0, -178, "", {
        fontFamily: "Arial",
        fontSize: "26px",
        fontStyle: "700",
        color: "#fff4d6",
      })
      .setOrigin(0.5);
    const money = this.scene.add
      .text(315, -178, "", {
        fontFamily: "Arial",
        fontSize: "16px",
        color: "#f7e5aa",
        align: "right",
      })
      .setOrigin(1, 0.5);

    const readyButton = this.scene.add.container(0, 168);
    const readyButtonBg = this.scene.add
      .rectangle(0, 0, 150, 42, 0xd94b4b, 1)
      .setStrokeStyle(1, 0xffffff, 0.45);
    const readyButtonText = this.scene.add
      .text(0, 0, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        fontStyle: "700",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    readyButton.add([readyButtonBg, readyButtonText]);
    readyButton.setSize(150, 42);
    readyButton.setInteractive(
      new Phaser.Geom.Rectangle(-75, -21, 150, 42),
      Phaser.Geom.Rectangle.Contains,
    );
    readyButton.on("pointerdown", () => this.callbacks.onReady());

    const p1Check = this.scene.add
      .text(-238, 168, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#f6f1e6",
      })
      .setOrigin(0, 0.5);
    const p2Check = this.scene.add
      .text(175, 168, "", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#f6f1e6",
      })
      .setOrigin(0, 0.5);

    container.add([bg, title, money, readyButton, p1Check, p2Check]);
    this.container = container;
    this.title = title;
    this.money = money;
    this.readyButton = readyButton;
    this.readyButtonBg = readyButtonBg;
    this.readyButtonText = readyButtonText;
    this.p1Check = p1Check;
    this.p2Check = p2Check;
  }

  private renderGoods(
    goods: readonly CollaborateShopItemState[],
    extra: CollaborateExtraState,
    localKey: CanonicalFighterKey,
    disabled: boolean,
  ): void {
    this.ensureItemVisuals(goods.length);
    const startX = -270;
    const gap = 90;
    for (let index = 0; index < this.itemVisuals.length; index += 1) {
      const visual = this.itemVisuals[index];
      const item = goods[index];
      if (!item) {
        visual.container.setVisible(false);
        continue;
      }
      const bought = extra.shop.purchasesByPlayerId[localKey].includes(item.id);
      const soldOut = item.kind === "sold_out";
      visual.itemId = item.id;
      visual.container.setPosition(startX + index * gap, -24);
      visual.container.setVisible(true);
      visual.bg.setFillStyle(bought || soldOut ? 0x31424c : 0x182834, 1);
      visual.bg.setStrokeStyle(
        2,
        bought ? 0x92e6a7 : soldOut ? 0x70808a : 0xffcf6e,
        bought ? 0.75 : soldOut ? 0.6 : 0.95,
      );
      visual.icon.setText(itemLabel(item));
      visual.price.setText(soldOut ? "--" : String(item.price));
      visual.container.setAlpha((disabled && !bought) || soldOut ? 0.55 : 1);
    }
  }

  private ensureItemVisuals(count: number): void {
    if (!this.container) return;
    while (this.itemVisuals.length < count) {
      const container = this.scene.add.container(0, 0);
      const bg = this.scene.add
        .rectangle(0, 0, 72, 104, 0x182834, 1)
        .setStrokeStyle(2, 0xffcf6e, 0.95);
      const icon = this.scene.add
        .text(0, -18, "", {
          fontFamily: "Arial",
          fontSize: "18px",
          fontStyle: "700",
          color: "#fff4d6",
          align: "center",
          wordWrap: { width: 62 },
        })
        .setOrigin(0.5);
      const price = this.scene.add
        .text(0, 33, "", {
          fontFamily: "Arial",
          fontSize: "16px",
          color: "#ffcf6e",
        })
        .setOrigin(0.5);
      container.add([bg, icon, price]);
      container.setSize(72, 104);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-36, -52, 72, 104),
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
        if (visual?.itemId) this.callbacks.onPurchase(visual.itemId);
      });
      this.container.add(container);
      this.itemVisuals.push({ container, bg, icon, price, itemId: "" });
    }
  }
}

function itemLabel(item: CollaborateShopItemState): string {
  switch (item.kind) {
    case "life":
      return t("battle.shop_item_life");
    case "bomb":
      return t("battle.shop_item_bomb");
    case "point":
      return t("battle.shop_item_point");
    case "ability_card":
      return item.abilityCardId
        ? (getAbilityCardDefinition(item.abilityCardId as AbilityCardId)?.name ?? item.abilityCardId)
        : t("battle.shop_item_card");
    case "sold_out":
      return t("battle.shop_item_sold_out");
  }
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
