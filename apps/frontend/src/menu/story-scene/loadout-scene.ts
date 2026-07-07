import Phaser from "phaser";
import {
  getAllAbilityCardDefinitions,
  getAllCharacterDefinitions,
  type AbilityCardDefinition,
  type CharacterDefinition,
} from "@repo/content";
import { t } from "@repo/i18n";
import type { AbilityCardId, CharacterId } from "@repo/types";

import { abilityCardIconTextureKey } from "../../ability-card-assets";
import type { BattleLoadouts, FighterLoadout } from "../../battle/loadout";
import { queueStoryUiAssets } from "../../story/assets";
import { updateStoryLoadout } from "../../story/state";
import type {
  StoryDefinition,
  StoryLoadoutData,
  StoryProgressData,
  StoryRuntimeState,
  StoryStage,
} from "../../story/types";
import { settingsRepository } from "../../store/settings";
import { createFittedImage } from "../../utils/image-fit";
import {
  characterPreviewTextureKey,
  queueMenuCharacterPreviewAssets,
} from "../assets";
import {
  cardDescription,
  cardName,
  characterDescription,
  characterName,
  getCardById,
  getCharacterById,
  roleLabel,
  type SceneKey,
} from "../shared";
import {
  bodyStyle,
  createFightButton,
  createScrollIndicator,
  drawFightingBackdrop,
} from "../ui";
import {
  clamp,
  compactText,
  fitImageToBounds,
  statColor,
  statLevel,
} from "./helpers";

export class StoryLoadoutScene extends Phaser.Scene {
  private story!: StoryDefinition;
  private state!: StoryRuntimeState;
  private alternateId: CharacterId | undefined;
  private readonly selectedCards = new Set<AbilityCardId>();
  private confirmButton!: ReturnType<typeof createFightButton>;
  private costLayer!: Phaser.GameObjects.Container;
  private layer!: Phaser.GameObjects.Container;
  private tipLayer!: Phaser.GameObjects.Container;
  private alternateScrollOffset = 0;
  private cardScrollOffset = 0;
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
    if (Math.abs(deltaY) <= 0) {
      return;
    }
    this.dragScroll.area.scroll(deltaY);
    this.dragScroll.lastY = pointer.y;
    pointer.event?.preventDefault();
  };
  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.dragScroll?.pointerId === pointer.id) {
      this.dragScroll = undefined;
    }
  };

  constructor() {
    super("story-loadout" satisfies SceneKey);
  }

  init(data: StoryLoadoutData): void {
    this.story = data.story;
    this.state = data.state;
    this.alternateId = data.state.alternateCharacterId;
    this.alternateScrollOffset = 0;
    this.cardScrollOffset = 0;
    this.scrollAreas = [];
    this.dragScroll = undefined;
    this.selectedCards.clear();
    data.state.cardIds.forEach((id) => this.selectedCards.add(id));
  }

  preload(): void {
    queueStoryUiAssets(this);
    queueMenuCharacterPreviewAssets(this);
  }

  create(): void {
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
    this.children.removeAll(true);
    this.scrollAreas = [];
    this.dragScroll = undefined;
    drawFightingBackdrop(this, "STORY", "BUILD");
    createFightButton(
      this,
      1138,
      62,
      160,
      44,
      t("story.back"),
      () => {
        this.scene.start("story-progress", {
          state: this.state,
        } satisfies StoryProgressData);
      },
      { accent: 0x5c7185 },
    );
    const stage = this.currentStage();
    this.drawStoryPanel(66, 72, 288, 566, t("story.primary"));
    this.drawStoryPanel(386, 72, 430, 566, t("story.alternate"));
    this.drawStoryPanel(834, 72, 378, 566, t("story.cards"));
    this.layer = this.add.container(0, 0).setDepth(10);
    this.costLayer = this.add.container(0, 0).setDepth(11);
    this.tipLayer = this.add.container(0, 0).setDepth(50).setVisible(false);

    const primary = getCharacterById(this.state.primaryCharacterId);
    this.layer.add(
      this.add
        .text(210, 134, characterName(primary), bodyStyle("#ffcf6e", 24))
        .setOrigin(0.5),
    );
    const portraitKey = `character-portrait-${primary.id}`;
    if (this.textures.exists(portraitKey)) {
      const portrait = this.add.image(210, 374, portraitKey).setOrigin(0.5);
      fitImageToBounds(portrait, 230, 410);
      this.layer.add(portrait);
    }
    this.layer.add(
      this.add
        .text(
          210,
          606,
          t("story.primary_resources", {
            lives: this.state.lives,
            bombs: this.state.bombs,
          }),
          bodyStyle("#f6f1e6", 16),
        )
        .setOrigin(0.5),
    );

    const alternateBounds = new Phaser.Geom.Rectangle(404, 144, 394, 476);
    const alternateContainer = this.add.container(0, 0);
    this.layer.add(alternateContainer);
    const characters = getAllCharacterDefinitions().filter(
      (character) => character.id !== this.state.primaryCharacterId,
    );
    characters.forEach((character, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const tile = this.createStoryCharacterTile(
        alternateBounds.x + 60 + col * 118,
        alternateBounds.y + 74 + row * 136,
        character,
        this.alternateId === character.id,
        () => {
          this.alternateId = character.id;
          this.render();
        },
      );
      alternateContainer.add(tile);
    });
    const alternateMask = this.make.graphics({ x: 0, y: 0 });
    alternateMask.fillStyle(0xffffff, 1);
    alternateMask.fillRect(alternateBounds.x, alternateBounds.y, alternateBounds.width, alternateBounds.height);
    alternateContainer.enableFilters();
    alternateContainer.filters?.internal.addMask(alternateMask);
    this.registerScrollArea(
      "alternate",
      alternateBounds,
      alternateContainer,
      Math.ceil(characters.length / 3) * 136 - 18,
      alternateBounds.height,
    );

    const cardBounds = new Phaser.Geom.Rectangle(842, 144, 340, 476);
    const cardContainer = this.add.container(0, 0);
    this.layer.add(cardContainer);
    const cards = getAllAbilityCardDefinitions();
    cards.forEach((card, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const tile = this.createStoryCardTile(
        cardBounds.x + 59 + col * 110,
        cardBounds.y + 52 + row * 102,
        card,
        this.selectedCards.has(card.id),
        () => {
          this.toggleCard(card);
        },
      );
      cardContainer.add(tile);
    });
    const cardMask = this.make.graphics({ x: 0, y: 0 });
    cardMask.fillStyle(0xffffff, 1);
    cardMask.fillRect(cardBounds.x, cardBounds.y, cardBounds.width, cardBounds.height);
    cardContainer.enableFilters();
    cardContainer.filters?.internal.addMask(cardMask);
    this.registerScrollArea(
      "cards",
      cardBounds,
      cardContainer,
      Math.ceil(cards.length / 3) * 102 - 16,
      cardBounds.height,
    );

    this.drawCostDisplay();
    this.confirmButton = createFightButton(
      this,
      1040,
      662,
      250,
      58,
      t("story.start_battle"),
      () => this.confirm(),
      {
        enabled: this.isValid(),
        accent: 0xe33d44,
        subLabel: t("story.cost_limit", { count: stage.costLimit }),
      },
    );
    this.layer.add(this.confirmButton.container);
  }

  private drawStoryPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
  ): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x101820, 0.88);
    graphics.fillRect(x, y, width, height);
    graphics.lineStyle(2, 0x34475c, 0.88);
    graphics.strokeRect(x, y, width, height);
    graphics.lineStyle(1, 0x273548, 0.7);
    graphics.lineBetween(x + 18, y + 56, x + width - 18, y + 56);
    this.add.text(x + 24, y + 18, title, bodyStyle("#ffcf6e", 18));
  }

  private createStoryCharacterTile(
    centerX: number,
    centerY: number,
    character: CharacterDefinition,
    selected: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const width = 108;
    const height = 118;
    const container = this.add.container(
      centerX - width / 2,
      centerY - height / 2,
    );
    const background = this.add
      .rectangle(
        0,
        0,
        width,
        height,
        selected ? 0x253042 : 0x101820,
        selected ? 0.96 : 0.86,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, selected ? 0xffcf6e : 0x34475c, selected ? 1 : 0.72);
    container.add(background);

    const previewKey = characterPreviewTextureKey(character.id);
    if (this.textures.exists(previewKey)) {
      const portrait = this.add.image(54, 42, previewKey).setOrigin(0.5);
      fitImageToBounds(portrait, 54, 58);
      container.add(portrait);
    }
    container.add(
      this.add
        .text(54, 76, compactText(characterName(character), 6), bodyStyle("#f6f1e6", 14))
        .setOrigin(0.5),
    );
    container.add(
      this.add
        .text(
          54,
          96,
          `cost${character.cost}`,
          bodyStyle(selected ? "#ffcf6e" : "#9fb4c8", 12),
        )
        .setOrigin(0.5),
    );
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", onClick);
    hit.on("pointerover", () => this.showCharacterTip(character));
    hit.on("pointermove", (pointer: Phaser.Input.Pointer) =>
      this.positionTip(pointer.x, pointer.y),
    );
    hit.on("pointerout", () => this.hideTip());
    container.add(hit);
    return container;
  }

  private createStoryCardTile(
    centerX: number,
    centerY: number,
    card: AbilityCardDefinition,
    selected: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const width = 106;
    const height = 86;
    const container = this.add.container(
      centerX - width / 2,
      centerY - height / 2,
    );
    const background = this.add
      .rectangle(
        0,
        0,
        width,
        height,
        selected ? 0x253042 : 0x101820,
        selected ? 0.96 : 0.86,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, selected ? 0xffcf6e : 0x34475c, selected ? 1 : 0.72);
    container.add(background);

    const iconKey = abilityCardIconTextureKey(card.id);
    if (this.textures.exists(iconKey)) {
      const icon = createFittedImage(this, 24, 30, iconKey, 36, 36, "contain");
      container.add(icon);
    }
    container.add(
      this.add
        .text(
          58,
          30,
          card.kind === "active" ? t("select.active") : t("select.passive"),
          bodyStyle("#f6f1e6", 13),
        )
        .setOrigin(0, 0.5),
    );
    container.add(
      this.add
        .text(
          58,
          54,
          `cost${card.cost}`,
          bodyStyle(selected ? "#ffcf6e" : "#9fb4c8", 12),
        )
        .setOrigin(0, 0.5),
    );
    const hit = this.add
      .rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", onClick);
    hit.on("pointerover", () => this.showCardTip(card));
    hit.on("pointermove", (pointer: Phaser.Input.Pointer) =>
      this.positionTip(pointer.x, pointer.y),
    );
    hit.on("pointerout", () => this.hideTip());
    container.add(hit);
    return container;
  }

  private showCharacterTip(character: CharacterDefinition): void {
    this.showTip({
      title: characterName(character),
      meta: `${roleLabel(character.roleClass)}  cost${character.cost}`,
      description: characterDescription(character),
      detailLines: [`${t("select.ammo")}: ${character.ammoCapacity}`],
      statBars: [
        { label: t("select.move"), value: character.moveSpeed },
        { label: t("select.fire_rate"), value: character.fireRate },
        { label: t("select.bullet_speed"), value: character.bulletSpeed },
      ],
    });
  }

  private showCardTip(card: AbilityCardDefinition): void {
    const cooldown =
      card.cooldownTicks === 0
        ? t("codex.none")
        : t("codex.seconds", { seconds: (card.cooldownTicks / 60).toFixed(1) });
    this.showTip({
      title: cardName(card),
      meta: `${card.kind === "active" ? t("codex.active_use") : t("select.passive")}  cost${card.cost}`,
      description: cardDescription(card),
      detailLines: [
        `${t("select.uses")}: ${card.useLimit === "infinite" ? t("codex.infinite") : card.useLimit}`,
        `${t("select.cooldown")}: ${cooldown}`,
      ],
    });
  }

  private showTip(params: {
    readonly title: string;
    readonly meta: string;
    readonly description: string;
    readonly detailLines?: readonly string[];
    readonly statBars?: readonly {
      readonly label: string;
      readonly value: CharacterDefinition["moveSpeed"];
    }[];
  }): void {
    const width = 330;
    const padding = 16;
    const contentWidth = width - padding * 2;
    const descriptionText = this.add
      .text(padding, 76, params.description, bodyStyle("#d7e3ef", 15))
      .setWordWrapWidth(contentWidth)
      .setLineSpacing(5);
    const children: Phaser.GameObjects.GameObject[] = [
      this.add
        .text(padding, 14, params.title, bodyStyle("#f6f1e6", 18))
        .setWordWrapWidth(contentWidth),
      this.add
        .text(padding, 38, params.meta, bodyStyle("#ffcf6e", 14))
        .setWordWrapWidth(contentWidth),
      descriptionText,
    ];

    let cursorY = 76 + descriptionText.height + 14;
    for (const line of params.detailLines ?? []) {
      const detail = this.add
        .text(padding, cursorY, line, bodyStyle("#9fb4c8", 14))
        .setWordWrapWidth(contentWidth)
        .setLineSpacing(5);
      children.push(detail);
      cursorY += detail.height + 7;
    }

    for (const stat of params.statBars ?? []) {
      children.push(
        ...this.createTipStatRow(padding, cursorY, stat.label, stat.value),
      );
      cursorY += 22;
    }

    const height = Math.max(132, cursorY + padding - 4);
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0d131b, 0.98);
    graphics.fillRect(0, 0, width, height);
    graphics.lineStyle(2, 0xffcf6e, 0.95);
    graphics.strokeRect(0, 0, width, height);
    graphics.lineStyle(1, 0x34475c, 0.75);
    graphics.lineBetween(18, 62, width - 22, 62);

    this.tipLayer.removeAll(true);
    this.tipLayer.add([graphics, ...children]);
    this.tipLayer.setSize(width, height).setVisible(true);
    const pointer = this.input.activePointer;
    this.positionTip(pointer.x, pointer.y);
  }

  private createTipStatRow(
    x: number,
    y: number,
    label: string,
    value: CharacterDefinition["moveSpeed"],
  ): Phaser.GameObjects.GameObject[] {
    const text = this.add.text(x, y, `${label}:`, bodyStyle("#9fb4c8", 14));
    const graphics = this.add.graphics();
    const count = statLevel(value);
    const size = 10;
    const gap = 5;
    const startX = x + 58;
    const startY = y + 4;
    for (let index = 0; index < 3; index += 1) {
      graphics.fillStyle(
        index < count ? statColor(value) : 0x243244,
        index < count ? 1 : 0.92,
      );
      graphics.fillRect(startX + index * (size + gap), startY, size, size);
      graphics.lineStyle(1, 0x5c7185, 0.75);
      graphics.strokeRect(startX + index * (size + gap), startY, size, size);
    }
    return [text, graphics];
  }

  private positionTip(pointerX: number, pointerY: number): void {
    if (!this.tipLayer.visible) {
      return;
    }
    const margin = 14;
    const width = this.tipLayer.width;
    const height = this.tipLayer.height;
    const x = Phaser.Math.Clamp(
      pointerX + 18,
      margin,
      this.scale.width - width - margin,
    );
    const y = Phaser.Math.Clamp(
      pointerY + 18,
      margin,
      this.scale.height - height - margin,
    );
    this.tipLayer.setPosition(x, y);
  }

  private hideTip(): void {
    this.tipLayer?.removeAll(true);
    this.tipLayer?.setVisible(false);
  }

  private registerScrollArea(
    kind: "alternate" | "cards",
    bounds: Phaser.Geom.Rectangle,
    container: Phaser.GameObjects.Container,
    contentHeight: number,
    viewHeight: number,
  ): void {
    const maxOffset = Math.max(0, contentHeight - viewHeight);
    const indicator = createScrollIndicator(this, {
      x: bounds.right - 10,
      y: bounds.y + 6,
      height: bounds.height - 12,
    });
    this.layer.add(indicator.container);
    let offset = kind === "alternate" ? this.alternateScrollOffset : this.cardScrollOffset;
    offset = Phaser.Math.Clamp(offset, 0, maxOffset);
    container.y = -offset;
    indicator.update(offset, viewHeight, contentHeight);
    const scroll = (deltaY: number) => {
      if (maxOffset <= 0) {
        return;
      }
      this.hideTip();
      offset = Phaser.Math.Clamp(offset + deltaY, 0, maxOffset);
      container.y = -offset;
      indicator.update(offset, viewHeight, contentHeight);
      if (kind === "alternate") {
        this.alternateScrollOffset = offset;
      } else {
        this.cardScrollOffset = offset;
      }
    };
    if (kind === "alternate") {
      this.alternateScrollOffset = offset;
    } else {
      this.cardScrollOffset = offset;
    }
    this.scrollAreas.push({ bounds, scroll });
  }

  private toggleCard(card: AbilityCardDefinition): void {
    if (this.selectedCards.has(card.id)) {
      this.selectedCards.delete(card.id);
    } else {
      if (card.kind === "active") {
        for (const selectedId of [...this.selectedCards]) {
          if (getCardById(selectedId).kind === "active") {
            this.selectedCards.delete(selectedId);
          }
        }
      }
      this.selectedCards.add(card.id);
    }
    this.render();
  }

  private drawCostDisplay(): void {
    const total = this.totalCost();
    const limit = this.currentStage().costLimit;
    const label = `${total}/${limit}`;
    this.costLayer.add(
      this.add
        .text(
          640,
          648,
          label,
          bodyStyle(this.isValid() ? "#e6eef7" : "#ff5c66", 18),
        )
        .setOrigin(0.5),
    );
    this.drawCostPreviewBar({
      total,
      limit,
      x: 520,
      y: 666,
      width: 240,
      height: 14,
    });
  }

  private drawCostPreviewBar(params: {
    readonly total: number;
    readonly limit: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }): void {
    const bar = this.add.graphics();
    const ratio = clamp(params.total / Math.max(1, params.limit), 0, 1);
    bar
      .fillStyle(0x223042, 0.95)
      .fillRect(params.x, params.y, params.width, params.height);
    bar
      .fillStyle(params.total > params.limit ? 0xff5c66 : 0x34d399, 1)
      .fillRect(params.x, params.y, params.width * ratio, params.height);
    if (params.total > params.limit) {
      bar
        .lineStyle(2, 0xff5c66, 1)
        .strokeRect(params.x, params.y, params.width, params.height);
    }
    this.costLayer.add(bar);
  }

  private totalCost(): number {
    const characterCost =
      getCharacterById(this.state.primaryCharacterId).cost +
      (this.alternateId ? getCharacterById(this.alternateId).cost : 0);
    const cardCost = [...this.selectedCards].reduce(
      (total, id) => total + getCardById(id).cost,
      0,
    );
    return characterCost + cardCost;
  }

  private isValid(): boolean {
    return (
      Boolean(this.alternateId) &&
      this.totalCost() <= this.currentStage().costLimit
    );
  }

  private confirm(): void {
    if (!this.alternateId || !this.isValid()) {
      return;
    }
    const activeCardId = [...this.selectedCards].find(
      (id) => getCardById(id).kind === "active",
    );
    const nextState = updateStoryLoadout(this.state, {
      alternateCharacterId: this.alternateId,
      cardIds: [...this.selectedCards],
      activeCardId,
    });
    const stage = this.currentStage();
    const player: FighterLoadout = {
      primaryCharacterId: nextState.primaryCharacterId,
      alternateCharacterId: nextState.alternateCharacterId!,
      cardIds: nextState.cardIds,
      activeCardId: nextState.activeCardId,
      storyModeOverride: {
        enabled: true,
        lives: nextState.lives,
        bombs: nextState.bombs,
      },
    };
    const target: FighterLoadout = {
      primaryCharacterId: stage.opponent.primaryCharacterId,
      alternateCharacterId: stage.opponent.alternateCharacterId,
      cardIds: stage.opponent.cardIds ?? [],
      activeCardId: stage.opponent.activeCardId,
    };
    const loadouts: BattleLoadouts = { player, target };
    this.scene.start("loading", {
      mode: "ai",
      playerName: settingsRepository.get().username,
      opponentName: characterName(getCharacterById(stage.opponent.primaryCharacterId)),
      returnScene: "story-loadout",
      loadouts,
      mapId: stage.mapId,
      playerInitPoint: 0,
      opponentInitPoint: stage.initEnemyPoint ?? 0,
      debug: settingsRepository.get().debug,
      ai: stage.ai,
      story: {
        story: this.story,
        state: nextState,
        stageIndex: nextState.currentStageIndex,
      },
    });
  }

  private currentStage(): StoryStage {
    const stage = this.story.stages[this.state.currentStageIndex];
    if (!stage) {
      throw new Error(`Missing story stage ${this.state.currentStageIndex}`);
    }
    return stage;
  }
}
