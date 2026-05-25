import Phaser from "phaser";
import { getAllAbilityCardDefinitions, getAllCharacterDefinitions, type AbilityCardDefinition, type CharacterDefinition } from "@repo/content";

import {
  createBackButton,
  createCodexTile,
  createPreviewArena,
  createSmallTab,
  drawCardIcon,
  drawCharacterIcon,
  drawFightingBackdrop,
  drawPanel,
  bodyStyle,
  headingStyle,
} from "./ui";
import { type CodexTab, type SceneKey } from "./shared";

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

  constructor() {
    super("codex" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "CODEX", "DATA BANK");
    createBackButton(this);
    this.add.text(90, 74, "图鉴", headingStyle(42));

    drawPanel(this, LIST_PANEL.x, LIST_PANEL.y, LIST_PANEL.width, LIST_PANEL.height, "");
    drawPanel(this, DETAIL_PANEL.x, DETAIL_PANEL.y, DETAIL_PANEL.width, DETAIL_PANEL.height, "");
    this.listLayer = this.add.container(0, 0);
    this.detailLayer = this.add.container(0, 0);
    this.input.on("wheel", this.onWheel);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("wheel", this.onWheel);
    });
    this.render();
  }

  private render(): void {
    this.listLayer.removeAll(true);
    this.detailLayer.removeAll(true);
    this.scrollAreas = [];
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
    this.listLayer.add(createSmallTab(this, mainTabX, 170, "角色", this.tab === "characters", () => {
      this.tab = "characters";
      this.listScrollOffset = 0;
      this.detailScrollOffset = 0;
      this.render();
    }).container);
    this.listLayer.add(createSmallTab(this, mainTabX + 92, 170, "能力卡", this.tab === "cards", () => {
      this.tab = "cards";
      this.listScrollOffset = 0;
      this.detailScrollOffset = 0;
      this.render();
    }).container);

    const filters = this.tab === "characters"
      ? [
        ["all", "全部"],
        ["assault", "突击"],
        ["suppress", "压制"],
        ["scout", "侦察"],
        ["sniper", "狙击"],
      ] as const
      : [
        ["all", "全部"],
        ["active", "主动"],
        ["passive", "被动"],
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
        drawCharacterIcon(this, target, 82, 48, 1.0);
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
    listContainer.setMask(mask.createGeometryMask());
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
      const item = createCodexTile(this, x, y, card.name, card.cost, card.kind === "active" ? "主动使用" : "被动", card.id === this.selectedCard.id, (target) => {
        drawCardIcon(this, target, 82, 48, card.kind, 1.0);
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
    listContainer.setMask(mask.createGeometryMask());
    this.listLayer.add(listContainer);
    const rows = Math.ceil(cards.length / columns) || 1;
    const topPadding = startY - listBounds.y;
    const contentHeight = topPadding + rows * scaledHeight + (rows - 1) * gapY + 6;
    this.registerScrollArea(listBounds, listContainer, contentHeight, listBounds.height);
  }

  private renderCharacterDetail(): void {
    const character = this.selectedCharacter;
    const preview = createPreviewArena(this, DETAIL_PANEL.x + 24, 174, character.name, (target) => {
      drawCharacterIcon(this, target, 254, 110, 2.15);
    });
    this.detailLayer.add(preview);
    const lines = [
      `名字：${character.name}`,
      `职业：${roleLabel(character.roleClass)}`,
      `移速：${speedLabel(character.moveSpeed)}`,
      `弹容：${character.ammoCapacity}`,
      `射速：${speedLabel(character.fireRate)}`,
      `弹速：${speedLabel(character.bulletSpeed)}`,
      `描述：${character.description}`,
    ];
    this.renderDetailText(lines);
  }

  private renderCardDetail(): void {
    const card = this.selectedCard;
    const preview = createPreviewArena(this, DETAIL_PANEL.x + 24, 174, card.name, (target) => {
      drawCardIcon(this, target, 254, 110, card.kind, 2.5);
    });
    this.detailLayer.add(preview);
    const cooldown = card.cooldownTicks === 0 ? "无" : `${(card.cooldownTicks / 60).toFixed(1)} 秒`;
    const lines = [
      `名字：${card.name}`,
      `分类：${card.kind === "active" ? "主动使用" : "被动"}`,
      `使用次数限制：${card.useLimit === "infinite" ? "无限" : card.useLimit}`,
      `冷却时间：${cooldown}`,
      `描述：${card.description}`,
    ];
    this.renderDetailText(lines);
  }

  private renderDetailText(lines: readonly string[]): void {
    const bounds = new Phaser.Geom.Rectangle(
      DETAIL_PANEL.x + 18,
      442,
      DETAIL_PANEL.width - 36,
      DETAIL_PANEL.y + DETAIL_PANEL.height - 442 - 18,
    );
    const content = this.add.container(0, 0);
    const text = this.add.text(bounds.x, bounds.y, lines.join("\n"), bodyStyle("#d7e3ef", 18))
      .setLineSpacing(10)
      .setWordWrapWidth(bounds.width);

    content.add(text);

    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    content.setMask(mask.createGeometryMask());

    this.detailLayer.add(content);
    this.registerDetailScrollArea(bounds, content, text.height, bounds.height);
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

function roleLabel(role: CharacterDefinition["roleClass"]): string {
  return {
    assault: "突击",
    suppress: "压制",
    scout: "侦察",
    sniper: "狙击",
  }[role];
}

function speedLabel(speed: CharacterDefinition["moveSpeed"]): string {
  return {
    low: "低",
    medium: "中",
    high: "高",
  }[speed];
}
