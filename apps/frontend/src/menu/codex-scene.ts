import Phaser from "phaser";
import { getAllAbilityCardDefinitions, getAllCharacterDefinitions, type AbilityCardDefinition, type CharacterDefinition } from "@repo/content";
import { t } from "@repo/i18n";

import {
  createBackButton,
  createCodexTile,
  createSmallTab,
  drawCardIcon,
  drawCharacterPreviewIcon,
  drawFightingBackdrop,
  drawPanel,
  bodyStyle,
  headingStyle,
} from "./ui";
import { queueMenuAssets } from "./assets";
import { installMenuAudioUnlock, type CodexTab, type SceneKey } from "./shared";

export class CodexScene extends Phaser.Scene {
  private tab: CodexTab = "characters";
  private roleFilter: CharacterDefinition["roleClass"] | "all" = "all";
  private cardFilter: AbilityCardDefinition["kind"] | "all" = "all";
  private selectedCharacter = getAllCharacterDefinitions()[0]!;
  private selectedCard = getAllAbilityCardDefinitions()[0]!;
  private listLayer!: Phaser.GameObjects.Container;
  private detailLayer!: Phaser.GameObjects.Container;
  private listScrollOffset = 0;
  private detailScrollOffset = 0;
  private scrollAreas: Array<{ bounds: Phaser.Geom.Rectangle; scroll: (deltaY: number) => void }> = [];
  private dragScroll:
    | { readonly pointerId: number; readonly area: { bounds: Phaser.Geom.Rectangle; scroll: (deltaY: number) => void }; lastY: number }
    | undefined;
  private readonly onWheel = (
    pointer: Phaser.Input.Pointer,
    _gameObjects: unknown,
    _deltaX: number,
    deltaY: number,
  ): void => {
    for (const area of this.scrollAreas) {
      if (Phaser.Geom.Rectangle.Contains(area.bounds, pointer.x, pointer.y)) {
        area.scroll(deltaY);
        break;
      }
    }
  };
  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    for (const area of this.scrollAreas) {
      if (Phaser.Geom.Rectangle.Contains(area.bounds, pointer.x, pointer.y)) {
        this.dragScroll = { pointerId: pointer.id, area, lastY: pointer.y };
        break;
      }
    }
  };
  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragScroll || this.dragScroll.pointerId !== pointer.id || !pointer.isDown) {
      return;
    }
    const deltaY = this.dragScroll.lastY - pointer.y;
    if (Math.abs(deltaY) > 0) {
      this.dragScroll.area.scroll(deltaY);
      this.dragScroll.lastY = pointer.y;
      pointer.event?.preventDefault();
    }
  };
  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.dragScroll?.pointerId === pointer.id) {
      this.dragScroll = undefined;
    }
  };

  constructor() {
    super("codex" satisfies SceneKey);
  }

  preload(): void {
    queueMenuAssets(this);
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "CODEX", "DATA BANK");
    createBackButton(this);
    this.add.text(90, 74, t("codex.title"), headingStyle(42));

    drawPanel(this, LIST_PANEL.x, LIST_PANEL.y, LIST_PANEL.width, LIST_PANEL.height, "");
    drawPanel(this, DETAIL_PANEL.x, DETAIL_PANEL.y, DETAIL_PANEL.width, DETAIL_PANEL.height, "");
    this.listLayer = this.add.container(0, 0);
    this.detailLayer = this.add.container(0, 0);
    this.input.on("wheel", this.onWheel);
    this.input.on("pointerdown", this.onPointerDown);
    this.input.on("pointermove", this.onPointerMove);
    this.input.on("pointerup", this.onPointerUp);
    this.input.on("pointerupoutside", this.onPointerUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("wheel", this.onWheel);
      this.input.off("pointerdown", this.onPointerDown);
      this.input.off("pointermove", this.onPointerMove);
      this.input.off("pointerup", this.onPointerUp);
      this.input.off("pointerupoutside", this.onPointerUp);
    });
    this.render();
  }

  private render(): void {
    this.listLayer.removeAll(true);
    this.detailLayer.removeAll(true);
    this.scrollAreas = [];
    this.dragScroll = undefined;
    this.renderTabs();
    if (this.tab === "characters") {
      this.renderCharacterList();
      this.renderCharacterDetail();
    } else {
      this.renderCardList();
      this.renderCardDetail();
    }
  }

  private renderTabs(): void {
    const mainTabX = LIST_PANEL.x + 72;
    this.listLayer.add(createSmallTab(this, mainTabX, 170, t("codex.characters"), this.tab === "characters", () => {
      this.tab = "characters";
      this.listScrollOffset = 0;
      this.detailScrollOffset = 0;
      this.render();
    }).container);
    this.listLayer.add(createSmallTab(this, mainTabX + 92, 170, t("codex.cards"), this.tab === "cards", () => {
      this.tab = "cards";
      this.listScrollOffset = 0;
      this.detailScrollOffset = 0;
      this.render();
    }).container);

    const filters = this.tab === "characters"
      ? [
        ["all", t("codex.all")],
        ["assault", t("role.assault")],
        ["suppress", t("role.suppress")],
        ["scout", t("role.scout")],
        ["sniper", t("role.sniper")],
      ] as const
      : [
        ["all", t("codex.all")],
        ["active", t("codex.active")],
        ["passive", t("codex.passive")],
      ] as const;

    const filterGap = 4;
    const filterWidth = this.tab === "characters" ? 64 : 72;
    const filtersWidth = filters.length * filterWidth + (filters.length - 1) * filterGap;
    const filterStartX = LIST_PANEL.x + LIST_PANEL.width - filtersWidth - 8;
    filters.forEach((filter, index) => {
      this.listLayer.add(createSmallTab(this, filterStartX + index * (filterWidth + filterGap), 170, filter[1], this.activeFilter() === filter[0], () => {
        if (this.tab === "characters") {
          this.roleFilter = filter[0] as CharacterDefinition["roleClass"] | "all";
        } else {
          this.cardFilter = filter[0] as AbilityCardDefinition["kind"] | "all";
        }
        this.detailScrollOffset = 0;
        this.render();
      }, filterWidth).container);
    });
  }

  private activeFilter(): string {
    return this.tab === "characters" ? this.roleFilter : this.cardFilter;
  }

  private renderCharacterList(): void {
    const baseTileWidth = 164;
    const baseTileHeight = 142;
    const tileScale = 0.8;
    const tileWidth = baseTileWidth * tileScale;
    const tileHeight = baseTileHeight * tileScale;
    const columns = 4;
    const gapX = 11;
    const gapY = 16;
    const gridWidth = columns * tileWidth + (columns - 1) * gapX;
    const startX = LIST_PANEL.x + (LIST_PANEL.width - gridWidth) / 2 + tileWidth / 2;
    const startY = LIST_PANEL.y + 118 + tileHeight / 2;
    const listContainer = this.add.container(0, 0);
    const characters = getAllCharacterDefinitions()
      .filter((character) => this.roleFilter === "all" || character.roleClass === this.roleFilter)
    characters.forEach((character, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * (tileWidth + gapX);
      const y = startY + row * (tileHeight + gapY);
      const item = createCodexTile(this, x, y, character.name, character.cost, roleLabel(character.roleClass), character.id === this.selectedCharacter.id, (target) => {
        drawCharacterPreviewIcon(this, target, 82, 54, 120, 78, character);
      }, () => {
        this.selectedCharacter = character;
        this.detailScrollOffset = 0;
        this.render();
      });
      item.container.setScale(tileScale);
      item.container.x += (baseTileWidth * (1 - tileScale)) / 2;
      item.container.y += (baseTileHeight * (1 - tileScale)) / 2;
      listContainer.add(item.container);
    });

    const listBounds = new Phaser.Geom.Rectangle(
      LIST_PANEL.x + 18,
      LIST_PANEL.y + 100,
      LIST_PANEL.width - 36,
      LIST_PANEL.height - 118,
    );
    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(listBounds.x, listBounds.y, listBounds.width, listBounds.height);
    listContainer.enableFilters();
    listContainer.filters?.internal.addMask(mask);
    this.listLayer.add(listContainer);
    const rows = Math.ceil(characters.length / columns) || 1;
    const topPadding = startY - listBounds.y;
    const contentHeight = topPadding + rows * tileHeight + (rows - 1) * gapY + 6;
    this.registerScrollArea(listBounds, listContainer, contentHeight, listBounds.height);
  }

  private renderCardList(): void {
    const tileWidth = 164;
    const tileHeight = 142;
    const tileScale = 0.75;
    const columns = 5;
    const gapX = 8;
    const gapY = 16;
    const scaledWidth = tileWidth * tileScale;
    const scaledHeight = tileHeight * tileScale;
    const gridWidth = columns * scaledWidth + (columns - 1) * gapX;
    const startX = LIST_PANEL.x + (LIST_PANEL.width - gridWidth) / 2 + scaledWidth / 2;
    const startY = LIST_PANEL.y + 122 + scaledHeight / 2;
    const listContainer = this.add.container(0, 0);
    const cards = getAllAbilityCardDefinitions()
      .filter((card) => this.cardFilter === "all" || card.kind === this.cardFilter)
    cards.forEach((card, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * (scaledWidth + gapX);
      const y = startY + row * (scaledHeight + gapY);
      const item = createCodexTile(this, x, y, card.name, card.cost, card.kind === "active" ? t("codex.active_use") : t("codex.passive"), card.id === this.selectedCard.id, (target) => {
        drawCardIcon(this, target, 82, 48, card, 1.0);
      }, () => {
        this.selectedCard = card;
        this.detailScrollOffset = 0;
        this.render();
      });
      item.container.setScale(tileScale);
      item.container.x += (tileWidth * (1 - tileScale)) / 2;
      item.container.y += (tileHeight * (1 - tileScale)) / 2;
      listContainer.add(item.container);
    });

    const listBounds = new Phaser.Geom.Rectangle(
      LIST_PANEL.x + 18,
      LIST_PANEL.y + 100,
      LIST_PANEL.width - 36,
      LIST_PANEL.height - 118,
    );
    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(listBounds.x, listBounds.y, listBounds.width, listBounds.height);
    listContainer.enableFilters();
    listContainer.filters?.internal.addMask(mask);
    this.listLayer.add(listContainer);
    const rows = Math.ceil(cards.length / columns) || 1;
    const topPadding = startY - listBounds.y;
    const contentHeight = topPadding + rows * scaledHeight + (rows - 1) * gapY + 6;
    this.registerScrollArea(listBounds, listContainer, contentHeight, listBounds.height);
  }

  private renderCharacterDetail(): void {
    this.renderCharacterStats(this.selectedCharacter);
  }

  private renderCharacterStats(character: CharacterDefinition): void {
    const bounds = new Phaser.Geom.Rectangle(
      DETAIL_PANEL.x + 32,
      DETAIL_CONTENT_TOP,
      DETAIL_PANEL.width - 72,
      DETAIL_PANEL.y + DETAIL_PANEL.height - DETAIL_CONTENT_TOP - 24,
    );
    const content = this.add.container(0, 0);
    const gap = 14;
    const leftWidth = 170;
    const rightWidth = bounds.width - leftWidth - gap;
    const cardHeight = 170;

    content.add(this.createCharacterIdentityCard(bounds.x, bounds.y, leftWidth, cardHeight, character));
    content.add(this.createCharacterStatCard(bounds.x + leftWidth + gap, bounds.y, rightWidth, cardHeight, character));

    const descriptionY = bounds.y + cardHeight + 18;
    const description = this.add.text(bounds.x, descriptionY, t("codex.description", { description: character.description }), bodyStyle("#d7e3ef", 18))
      .setLineSpacing(8)
      .setWordWrapWidth(bounds.width);
    content.add(description);

    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    content.enableFilters();
    content.filters?.internal.addMask(mask);

    this.detailLayer.add(content);
    this.registerDetailScrollArea(bounds, content, descriptionY - bounds.y + description.height, bounds.height);
  }

  private createCharacterIdentityCard(
    x: number,
    y: number,
    width: number,
    height: number,
    character: CharacterDefinition,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    const graphics = this.add.graphics();
    drawStatPanel(graphics, 0, 0, width, height);
    card.add(graphics);

    const items = [
      { label: t("codex.name_label"), value: character.name },
      { label: t("codex.role_label"), value: roleLabel(character.roleClass) },
    ] as const;
    items.forEach((item, index) => {
      const itemY = 20 + index * 82;
      card.add(this.add.text(18, itemY, item.label, bodyStyle("#9fb4c8", 14)));
      card.add(this.add.text(18, itemY + 28, item.value, bodyStyle("#f6f1e6", 20)).setWordWrapWidth(width - 36));
      if (index === 0) {
        graphics.lineStyle(1, 0x273548, 0.65);
        graphics.lineBetween(18, itemY + 66, width - 20, itemY + 66);
      }
    });

    return card;
  }

  private createCharacterStatCard(
    x: number,
    y: number,
    width: number,
    height: number,
    character: CharacterDefinition,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    const graphics = this.add.graphics();
    drawStatPanel(graphics, 0, 0, width, height);
    card.add(graphics);

    const stats = [
      { label: t("select.move_speed"), speed: character.moveSpeed },
      { label: t("select.bullet_speed"), speed: character.bulletSpeed },
      { label: t("select.ammo"), value: String(character.ammoCapacity) },
      { label: t("select.fire_rate"), speed: character.fireRate },
    ] as const;

    stats.forEach((stat, index) => {
      const itemY = 18 + index * 40;
      card.add(this.add.text(18, itemY, `${stat.label}:`, bodyStyle("#9fb4c8", 15)));
      if ("speed" in stat) {
        card.add(this.createStatSquares(88, itemY + 4, stat.speed));
      } else {
        card.add(this.add.text(88, itemY - 2, stat.value, bodyStyle("#f6f1e6", 18)));
      }
    });

    return card;
  }

  private createStatSquares(
    x: number,
    y: number,
    value: CharacterDefinition["moveSpeed"],
  ): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();
    const count = statLevel(value);
    const size = 10;
    const gap = 5;
    for (let index = 0; index < 3; index += 1) {
      graphics.fillStyle(index < count ? statColor(value) : 0x243244, index < count ? 1 : 0.92);
      graphics.fillRect(x + index * (size + gap), y, size, size);
      graphics.lineStyle(1, 0x5c7185, 0.75);
      graphics.strokeRect(x + index * (size + gap), y, size, size);
    }
    return graphics;
  }

  private renderCardDetail(): void {
    const card = this.selectedCard;
    const cooldown = card.cooldownTicks === 0 ? t("codex.none") : t("codex.seconds", { seconds: (card.cooldownTicks / 60).toFixed(1) });
    const lines = [
      t("codex.name", { name: card.name }),
      t("codex.category", { kind: card.kind === "active" ? t("codex.active_use") : t("codex.passive") }),
      t("codex.use_limit", { limit: card.useLimit === "infinite" ? t("codex.infinite") : card.useLimit }),
      t("codex.cooldown", { cooldown }),
      t("codex.description", { description: card.description }),
    ];
    const bounds = new Phaser.Geom.Rectangle(
      DETAIL_PANEL.x + 18,
      DETAIL_CONTENT_TOP,
      DETAIL_PANEL.width - 36,
      DETAIL_PANEL.y + DETAIL_PANEL.height - DETAIL_CONTENT_TOP - 24,
    );
    const content = this.add.container(0, 0);
    drawCardIcon(this, content, bounds.x + 58, bounds.y + 48, card, 1.28);
    const text = this.add.text(bounds.x, bounds.y + 104, lines.join("\n"), bodyStyle("#d7e3ef", 18))
      .setLineSpacing(10)
      .setWordWrapWidth(bounds.width);
    content.add(text);

    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    content.enableFilters();
    content.filters?.internal.addMask(mask);

    this.detailLayer.add(content);
    this.registerDetailScrollArea(bounds, content, text.y - bounds.y + text.height, bounds.height);
  }

  private registerDetailScrollArea(
    bounds: Phaser.Geom.Rectangle,
    container: Phaser.GameObjects.Container,
    contentHeight: number,
    viewHeight: number,
  ): void {
    const maxOffset = Math.max(0, contentHeight - viewHeight);
    let offset = Phaser.Math.Clamp(this.detailScrollOffset, 0, maxOffset);
    container.y = -offset;
    const scroll = (deltaY: number) => {
      if (maxOffset <= 0) {
        return;
      }
      offset = Phaser.Math.Clamp(offset + deltaY, 0, maxOffset);
      container.y = -offset;
      this.detailScrollOffset = offset;
    };
    this.detailScrollOffset = offset;
    this.scrollAreas.push({ bounds, scroll });
  }

  private registerScrollArea(
    bounds: Phaser.Geom.Rectangle,
    container: Phaser.GameObjects.Container,
    contentHeight: number,
    viewHeight: number,
  ): void {
    const maxOffset = Math.max(0, contentHeight - viewHeight);
    let offset = Phaser.Math.Clamp(this.listScrollOffset, 0, maxOffset);
    container.y = -offset;
    const scroll = (deltaY: number) => {
      if (maxOffset <= 0) {
        return;
      }
      offset = Phaser.Math.Clamp(offset + deltaY, 0, maxOffset);
      container.y = -offset;
      this.listScrollOffset = offset;
    };
    this.listScrollOffset = offset;
    this.scrollAreas.push({ bounds, scroll });
  }
}

function statLevel(speed: CharacterDefinition["moveSpeed"]): number {
  return {
    low: 1,
    medium: 2,
    high: 3,
  }[speed];
}

function statColor(speed: CharacterDefinition["moveSpeed"]): number {
  return {
    low: 0x26c6da,
    medium: 0xffcf6e,
    high: 0x34d399,
  }[speed];
}

function drawStatPanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  graphics.fillStyle(0x0f141d, 0.98);
  graphics.fillRect(x, y, width, height);
  graphics.lineStyle(2, 0x34475c, 0.98);
  graphics.strokeRect(x, y, width, height);
}

const LIST_PANEL = {
  x: 24,
  y: 116,
  width: 696,
  height: 526,
};

const DETAIL_PANEL = {
  x: 736,
  y: 116,
  width: 520,
  height: 526,
};

const DETAIL_CONTENT_TOP = DETAIL_PANEL.y + 32;

function roleLabel(role: CharacterDefinition["roleClass"]): string {
  return {
    assault: t("role.assault"),
    suppress: t("role.suppress"),
    scout: t("role.scout"),
    sniper: t("role.sniper"),
  }[role];
}

