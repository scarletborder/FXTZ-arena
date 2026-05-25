import Phaser from "phaser";
import {
  getAllAbilityCardDefinitions,
  getAllCharacterDefinitions,
  type AbilityCardDefinition,
  type CharacterDefinition,
} from "@repo/content";
import type { AbilityCardId, CharacterId, PlayerLoadout } from "@repo/types";

import { type BattleLoadouts } from "../battle/loadout";
import { type FighterLoadout } from "../battle/loadout";
import {
  createBackButton,
  createCardTile,
  createCharacterTile,
  createFightButton,
  createSmallTab,
  drawFightingBackdrop,
  drawAngledPanel,
  drawPanelToLayer,
  bodyStyle,
} from "./ui";
import {
  connectionManager,
  getCardById,
  getCharacterById,
  type SceneKey,
  type SelectionData,
} from "./shared";
import { uiSettings } from "../store/settings";

const COST_LIMIT = 10;

export class SelectScene extends Phaser.Scene {
  private mode: SelectionData["mode"] = "ai";
  private playerId: string | undefined;
  private primaryId: CharacterId | undefined;
  private alternateId: CharacterId | undefined;
  private roleFilter: CharacterDefinition["roleClass"] | "all" = "all";
  private cardFilter: AbilityCardDefinition["kind"] | "all" = "all";
  private readonly selectedCards = new Set<AbilityCardId>();
  private hoverCost = 0;
  private layer!: Phaser.GameObjects.Container;
  private costLayer!: Phaser.GameObjects.Container;
  private tipLayer!: Phaser.GameObjects.Container;
  private confirmButton!: { setEnabled(enabled: boolean): void; setLabel(label: string): void };
  private statusText!: Phaser.GameObjects.Text;
  private characterScrollOffset = 0;
  private cardScrollOffset = 0;
  private leavingOnlineRoom = false;
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
    super("select" satisfies SceneKey);
  }

  create(data: SelectionData): void {
    this.mode = data.mode;
    this.playerId = data.playerId;
    this.primaryId = undefined;
    this.alternateId = undefined;
    this.leavingOnlineRoom = false;
    this.selectedCards.clear();

    const subtitle = this.mode === "online"
      ? "ONLINE VERSUS"
      : this.mode === "training"
        ? "TRAINING"
        : "CPU VERSUS";
    drawFightingBackdrop(this, "SELECT", subtitle);

    // Online mode: custom back button sends leave_room
    if (this.mode === "online") {
      // createFightButton(this, 1138, 62, 160, 44, "返回", () => {
      //   connectionManager.send({ type: "leave_room" });
      //   this.scene.start("battle-start");
      // }, { accent: 0x5c7185 });
    } else {
      createBackButton(this);
    }

    this.layer = this.add.container(0, 0);
    this.costLayer = this.add.container(0, 0);
    this.tipLayer = this.add.container(0, 0).setDepth(1000).setVisible(false);

    // Status text for online waiting state — use space not empty string to
    // avoid zero-width canvas crash in Phaser's Text pipeline (drawImage on null).
    this.statusText = this.add.text(1036, 80, " ", bodyStyle("#ffcf6e", 18)).setOrigin(0.5).setVisible(false);
    this.layer.add(this.statusText);

    this.input.on("wheel", this.onWheel);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("wheel", this.onWheel);
      connectionManager.setMessageHandler(null);
    });

    // In online mode, listen for server messages
    if (this.mode === "online") {
      connectionManager.setMessageHandler((msg) => this.onServerMessage(msg));
    }

    this.render();
  }

  private onServerMessage(msg: import("@repo/types").ServerMessage): void {
    const m = msg as unknown as Record<string, unknown>;
    switch (m.type) {
      case "opponent_ready":
        this.statusText.setText("对手已确认").setColor("#34d399");
        break;

      case "battle_start": {
        const bsg = msg as unknown as { config: import("@repo/types").BattleConfig };
        const config = bsg.config;
        const me = config.players.find((p) => p.playerId === this.playerId);
        const opponent = config.players.find((p) => p.playerId !== this.playerId);

        const playerCfg = config.players[0];
        const targetCfg = config.players[1];

        this.scene.start("loading", {
          mode: "online",
          playerName: me?.username ?? uiSettings.username,
          opponentName: opponent?.username ?? "对手",
          returnScene: "battle-start",
          loadouts: {
            player: {
              primaryCharacterId: playerCfg.loadout.primaryCharacterId,
              alternateCharacterId: playerCfg.loadout.alternateCharacterId,
              cardIds: playerCfg.loadout.abilityCardIds,
              activeCardId: playerCfg.loadout.activeAbilityCardId ?? undefined,
            },
            target: {
              primaryCharacterId: targetCfg.loadout.primaryCharacterId,
              alternateCharacterId: targetCfg.loadout.alternateCharacterId,
              cardIds: targetCfg.loadout.abilityCardIds,
              activeCardId: targetCfg.loadout.activeAbilityCardId ?? undefined,
            },
          },
          debug: uiSettings.debug,
          battleConfig: config,
          localPlayerId: this.playerId,
        } satisfies Record<string, unknown>);
        break;
      }

      case "peer_status": {
        const ps = msg as unknown as { status: string };
        if (ps.status === "disconnected") {
          this.leaveOnlineRoomView();
        }
        break;
      }
      case "room_state": {
        const rs = msg as unknown as { playerCount: number };
        if (rs.playerCount < 2) {
          this.leaveOnlineRoomView();
        }
        break;
      }
      case "error":
        this.statusText.setText(`错误: ${(msg as { message: string }).message}`).setColor("#ff5c66");
        this.confirmButton.setEnabled(true);
        break;
    }
  }

  private leaveOnlineRoomView(): void {
    if (this.leavingOnlineRoom) return;
    this.leavingOnlineRoom = true;
    this.statusText.setVisible(true).setText("对方已经退出房间").setColor("#ff5c66");
    this.time.delayedCall(150, () => {
      if (this.scene.isActive("select")) {
        this.scene.start("battle-start");
      }
    });
  }

  private render(): void {
    this.layer.removeAll(true);
    this.costLayer.removeAll(true);
    this.hideTip();
    this.scrollAreas = [];
    this.hoverCost = 0;

    this.addDropBox(1020, 170, "常驻模式", this.primaryId, () => {
      this.primaryId = undefined;
      this.render();
    });
    this.addDropBox(1020, 330, "特殊模式", this.alternateId, () => {
      this.alternateId = undefined;
      this.render();
    });
    this.addCharacterRoster();
    this.addCardRoster();
    this.addCostDisplay();

    const label = this.mode === "online" ? "确认配装" : "确认出战";
    const confirmButton = createFightButton(this, 1036, 680, 250, 58, label, () => this.confirm(), {
      enabled: this.isValid(),
      accent: 0xe33d44,
    });
    this.confirmButton = confirmButton;
    this.layer.add(confirmButton.container);

    // Bring status text to front (above all other elements)
    this.layer.bringToTop(this.statusText);
  }

  private addDropBox(
    x: number,
    y: number,
    label: string,
    characterId: CharacterDefinition["id"] | undefined,
    onClear: () => void,
  ): void {
    const width = 224;
    const height = 140;
    const box = this.add.container(x - width / 2, y - height / 2);
    const graphics = this.add.graphics();
    drawAngledPanel(graphics, 0, 0, width, height, 0x111821, 0x5c7185, 0.95);
    graphics.lineStyle(1, 0x273548, 0.6);
    graphics.lineBetween(18, 46, width - 18, 46);
    box.add(graphics);
    box.add(this.add.text(width / 2, 22, label, bodyStyle("#ffcf6e", 16)).setOrigin(0.5));
    if (characterId) {
      const character = getCharacterById(characterId);
      box.add(this.add.text(width / 2, 84, character.name, bodyStyle("#f6f1e6", 19)).setOrigin(0.5));
    } else {
      box.add(this.add.text(width / 2, 84, "未选择", bodyStyle("#6e8496", 18)).setOrigin(0.5));
    }
    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: !!characterId });
    hitArea.on("pointerup", () => {
      if (characterId) {
        onClear();
      }
    });
    box.add(hitArea);
    this.layer.add(box);
  }

  private addCharacterRoster(): void {
    const panel = { x: 66, y: 40, width: 612, height: 392 };
    drawPanelToLayer(this, this.layer, panel.x, panel.y, panel.width, panel.height, "角色");
    const roleFilters = [
      ["all", "全部"],
      ["assault", "突击"],
      ["suppress", "压制"],
      ["scout", "侦察"],
      ["sniper", "狙击"],
    ] as const;
    const roleFilterStartX = panel.x + panel.width - 346;
    roleFilters.forEach((filter, index) => {
      this.layer.add(createSmallTab(
        this,
        roleFilterStartX + index * 74,
        panel.y + 30,
        filter[1],
        this.roleFilter === filter[0],
        () => {
          this.roleFilter = filter[0];
          this.render();
        },
        64,
      ).container);
    });

    const characters = getAllCharacterDefinitions().filter(
      (character) => this.roleFilter === "all" || character.roleClass === this.roleFilter,
    );
    const listBounds = new Phaser.Geom.Rectangle(
      panel.x + 18,
      panel.y + 72,
      panel.width - 36,
      panel.height - 92,
    );
    const listContainer = this.add.container(0, 0);
    const columns = 4;
    const tileWidth = 112;
    const tileHeight = 152;
    const gapX = 18;
    const gapY = 18;
    const rows = Math.ceil(characters.length / columns) || 1;
    const gridWidth = columns * tileWidth + (columns - 1) * gapX;
    const startX = listBounds.x + (listBounds.width - gridWidth) / 2 + tileWidth / 2;
    const startY = listBounds.y + tileHeight / 2;

    characters.forEach((character, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * (tileWidth + gapX);
      const y = startY + row * (tileHeight + gapY);
      const tile = createCharacterTile(this, x, y, character, this.isCharacterSelected(character.id), () => {
        this.pickCharacter(character.id);
      });
      tile.hitArea.on("pointerover", () => {
        this.hoverCost = this.previewCharacterDelta(character.id);
        this.updateCostOnly();
        tile.setHovered(true);
        this.showCharacterTip(character);
      });
      tile.hitArea.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        this.positionTip(pointer.x, pointer.y);
      });
      tile.hitArea.on("pointerout", () => {
        this.hoverCost = 0;
        this.updateCostOnly();
        tile.setHovered(false);
        this.hideTip();
      });
      listContainer.add(tile.container);
    });

    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(listBounds.x, listBounds.y, listBounds.width, listBounds.height);
    listContainer.setMask(mask.createGeometryMask());
    this.layer.add(listContainer);
    this.registerScrollArea(
      "characters",
      listBounds,
      listContainer,
      rows * tileHeight + (rows - 1) * gapY,
      listBounds.height,
    );
  }

  private addCardRoster(): void {
    const panel = { x: 66, y: 440, width: 820, height: 272 };
    drawPanelToLayer(this, this.layer, panel.x, panel.y, panel.width, panel.height, "能力卡");
    const cardFilters = [
      ["all", "全部"],
      ["active", "主动"],
      ["passive", "被动"],
    ] as const;
    const filterStartX = panel.x + panel.width - 240;
    cardFilters.forEach((filter, index) => {
      this.layer.add(createSmallTab(
        this,
        filterStartX + index * 76,
        panel.y + 30,
        filter[1],
        this.cardFilter === filter[0],
        () => {
          this.cardFilter = filter[0];
          this.render();
        },
        70,
      ).container);
    });

    const cards = getAllAbilityCardDefinitions().filter(
      (card) => this.cardFilter === "all" || card.kind === this.cardFilter,
    );
    const listBounds = new Phaser.Geom.Rectangle(
      panel.x + 18,
      panel.y + 72,
      panel.width - 36,
      panel.height - 92,
    );
    const listContainer = this.add.container(0, 0);
    const columns = 6;
    const tileWidth = 116;
    const tileHeight = 104;
    const gapX = 16;
    const gapY = 16;
    const rows = Math.ceil(cards.length / columns) || 1;
    const gridWidth = columns * tileWidth + (columns - 1) * gapX;
    const startX = listBounds.x + (listBounds.width - gridWidth) / 2 + tileWidth / 2;
    const startY = listBounds.y + tileHeight / 2;

    cards.forEach((card, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * (tileWidth + gapX);
      const y = startY + row * (tileHeight + gapY);
      const tile = createCardTile(this, x, y, card, this.selectedCards.has(card.id), () => {
        this.toggleCard(card);
      });
      tile.hitArea.on("pointerover", () => {
        this.hoverCost = this.previewCardDelta(card);
        this.updateCostOnly();
        tile.setHovered(true);
        this.showCardTip(card);
      });
      tile.hitArea.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        this.positionTip(pointer.x, pointer.y);
      });
      tile.hitArea.on("pointerout", () => {
        this.hoverCost = 0;
        this.updateCostOnly();
        tile.setHovered(false);
        this.hideTip();
      });
      listContainer.add(tile.container);
    });

    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(listBounds.x, listBounds.y, listBounds.width, listBounds.height);
    listContainer.setMask(mask.createGeometryMask());
    this.layer.add(listContainer);
    this.registerScrollArea(
      "cards",
      listBounds,
      listContainer,
      rows * tileHeight + (rows - 1) * gapY,
      listBounds.height,
    );
  }

  private addCostDisplay(): void {
    const total = this.totalCost();
    const projected = Math.max(0, total + this.hoverCost);
    const limit = this.mode === "training" ? Math.max(COST_LIMIT, projected, 1) : COST_LIMIT;
    const delta = this.hoverCost;
    const label = `${total}(${delta >= 0 ? "+" : ""}${delta})/${limit}`;
    this.costLayer.add(this.add.text(1036, 624, label, bodyStyle("#e6eef7", 18)).setOrigin(0.5));
    this.drawCostPreviewBar({
      total,
      projected,
      delta,
      x: 916,
      y: 640,
      width: 240,
      height: 14,
    });
  }

  private registerScrollArea(
    kind: "characters" | "cards",
    bounds: Phaser.Geom.Rectangle,
    container: Phaser.GameObjects.Container,
    contentHeight: number,
    viewHeight: number,
  ): void {
    const maxOffset = Math.max(0, contentHeight - viewHeight);
    let offset = kind === "characters" ? this.characterScrollOffset : this.cardScrollOffset;
    offset = Phaser.Math.Clamp(offset, 0, maxOffset);
    container.y = -offset;
    const scroll = (deltaY: number) => {
      if (maxOffset <= 0) return;
      this.hideTip();
      offset = Phaser.Math.Clamp(offset + deltaY, 0, maxOffset);
      container.y = -offset;
      if (kind === "characters") {
        this.characterScrollOffset = offset;
      } else {
        this.cardScrollOffset = offset;
      }
    };
    if (kind === "characters") {
      this.characterScrollOffset = offset;
    } else {
      this.cardScrollOffset = offset;
    }
    this.scrollAreas.push({ bounds, scroll });
  }

  private drawCostPreviewBar(params: {
    readonly total: number;
    readonly projected: number;
    readonly delta: number;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }): void {
    const bar = this.add.graphics();
    const visualLimit = this.mode === "training"
      ? Math.max(COST_LIMIT, params.total, params.projected, 1)
      : COST_LIMIT;
    const currentRatio = clamp(params.total / visualLimit, 0, 1);
    const projectedRatio = clamp(params.projected / visualLimit, 0, 1);
    const currentWidth = params.width * currentRatio;
    const projectedWidth = params.width * projectedRatio;
    const currentOverLimit = this.mode !== "training" && params.total > COST_LIMIT;

    bar.fillStyle(0x223042, 0.95).fillRect(params.x, params.y, params.width, params.height);

    if (currentOverLimit) {
      bar.fillStyle(0xff5c66, 1).fillRect(params.x, params.y, params.width, params.height);
    } else {
      bar.fillStyle(0x34d399, 1).fillRect(params.x, params.y, currentWidth, params.height);
    }

    if (params.delta > 0) {
      const withinProjected = Math.min(params.projected, visualLimit);
      const withinProjectedWidth = params.width * clamp(withinProjected / visualLimit, 0, 1);
      if (!currentOverLimit && withinProjectedWidth > currentWidth) {
        bar.fillStyle(0x7cff8a, 0.95);
        bar.fillRect(params.x + currentWidth, params.y, withinProjectedWidth - currentWidth, params.height);
      }
      if (!currentOverLimit && params.projected > visualLimit) {
        const overflowRatio = clamp((params.projected - visualLimit) / visualLimit, 0, 1);
        const overflowWidth = Math.max(0, params.width * overflowRatio);
        if (overflowWidth > 0) {
          bar.fillStyle(0xff5c66, 0.95);
          bar.fillRect(params.x + params.width - overflowWidth, params.y, overflowWidth, params.height);
        }
      }
    } else if (params.delta < 0) {
      bar.fillStyle(0x101820, 0.62);
      bar.fillRect(params.x + projectedWidth, params.y, Math.max(0, currentWidth - projectedWidth), params.height);
    }

    this.costLayer.add(bar);
  }

  private updateCostOnly(): void {
    this.costLayer.removeAll(true);
    this.addCostDisplay();
    this.confirmButton.setEnabled(this.isValid());
  }

  private showCharacterTip(character: CharacterDefinition): void {
    this.showTip({
      title: character.name,
      meta: `${roleLabel(character.roleClass)}  cost${character.cost}`,
      description: character.description,
      detailLines: [
        `\u5f39\u5bb9: ${character.ammoCapacity}`,
      ],
      statBars: [
        { label: "\u79fb\u52a8", value: character.moveSpeed },
        { label: "\u5c04\u901f", value: character.fireRate },
        { label: "\u5f39\u901f", value: character.bulletSpeed },
      ],
    });
  }

  private showCardTip(card: AbilityCardDefinition): void {
    const cooldown = card.cooldownTicks === 0 ? "\u65e0" : `${(card.cooldownTicks / 60).toFixed(1)}\u79d2`;
    this.showTip({
      title: card.name,
      meta: `${card.kind === "active" ? "\u4e3b\u52a8\u4f7f\u7528" : "\u88ab\u52a8"}  cost${card.cost}`,
      description: card.description,
      detailLines: [
        `\u4f7f\u7528\u6b21\u6570: ${card.useLimit === "infinite" ? "\u65e0\u9650" : card.useLimit}`,
        `\u51b7\u5374: ${cooldown}`,
      ],
    });
  }

  private showTip(params: {
    readonly title: string;
    readonly meta: string;
    readonly description: string;
    readonly detailLines?: readonly string[];
    readonly statBars?: readonly { readonly label: string; readonly value: CharacterDefinition["moveSpeed"] }[];
  }): void {
    const width = 330;
    const padding = 16;
    const contentWidth = width - padding * 2;
    const descriptionText = this.add.text(padding, 76, params.description, bodyStyle("#d7e3ef", 15))
      .setWordWrapWidth(contentWidth)
      .setLineSpacing(5);
    const children: Phaser.GameObjects.GameObject[] = [
      this.add.text(padding, 14, params.title, bodyStyle("#f6f1e6", 18)).setWordWrapWidth(contentWidth),
      this.add.text(padding, 38, params.meta, bodyStyle("#ffcf6e", 14)).setWordWrapWidth(contentWidth),
      descriptionText,
    ];

    let cursorY = 76 + descriptionText.height + 14;
    for (const line of params.detailLines ?? []) {
      const detail = this.add.text(padding, cursorY, line, bodyStyle("#9fb4c8", 14))
        .setWordWrapWidth(contentWidth)
        .setLineSpacing(5);
      children.push(detail);
      cursorY += detail.height + 7;
    }

    for (const stat of params.statBars ?? []) {
      children.push(...this.createTipStatRow(padding, cursorY, stat.label, stat.value));
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
    this.tipLayer.add([
      graphics,
      ...children,
    ]);
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
      graphics.fillStyle(index < count ? statColor(value) : 0x243244, index < count ? 1 : 0.92);
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
    const x = Phaser.Math.Clamp(pointerX + 18, margin, this.scale.width - width - margin);
    const y = Phaser.Math.Clamp(pointerY + 18, margin, this.scale.height - height - margin);
    this.tipLayer.setPosition(x, y);
  }

  private hideTip(): void {
    if (!this.tipLayer) {
      return;
    }
    this.tipLayer.removeAll(true);
    this.tipLayer.setVisible(false);
  }

  private pickCharacter(id: CharacterDefinition["id"]): void {
    if (!this.primaryId) {
      this.primaryId = id;
    } else if (!this.alternateId && this.primaryId !== id) {
      this.alternateId = id;
    } else if (this.primaryId === id) {
      this.primaryId = undefined;
    } else if (this.alternateId === id) {
      this.alternateId = undefined;
    } else {
      this.alternateId = id;
    }
    this.render();
  }

  private toggleCard(card: AbilityCardDefinition): void {
    if (this.selectedCards.has(card.id)) {
      this.selectedCards.delete(card.id);
    } else {
      if (card.kind === "active") {
        for (const id of [...this.selectedCards]) {
          if (getCardById(id).kind === "active") {
            this.selectedCards.delete(id);
          }
        }
      }
      this.selectedCards.add(card.id);
    }
    this.render();
  }

  private isCharacterSelected(id: CharacterDefinition["id"]): boolean {
    return this.primaryId === id || this.alternateId === id;
  }

  private previewCharacterDelta(id: CharacterDefinition["id"]): number {
    const characterCost = getCharacterById(id).cost;
    if (this.primaryId === id || this.alternateId === id) {
      return -characterCost;
    }
    if (!this.primaryId) {
      return characterCost;
    }
    if (!this.alternateId && this.primaryId !== id) {
      return characterCost;
    }
    return characterCost - getCharacterById(this.alternateId!).cost;
  }

  private previewCardDelta(card: AbilityCardDefinition): number {
    if (this.selectedCards.has(card.id)) {
      return -card.cost;
    }
    if (card.kind !== "active") {
      return card.cost;
    }
    const selectedActiveCard = [...this.selectedCards]
      .map((id) => getCardById(id))
      .find((selectedCard) => selectedCard.kind === "active");
    return card.cost - (selectedActiveCard?.cost ?? 0);
  }

  private totalCost(): number {
    const characterCost = [this.primaryId, this.alternateId]
      .filter(Boolean)
      .map((id) => getCharacterById(id!).cost)
      .reduce((sum, cost) => sum + cost, 0);
    const cardCost = [...this.selectedCards]
      .map((id) => getCardById(id).cost)
      .reduce((sum, cost) => sum + cost, 0);
    return characterCost + cardCost;
  }

  private isValid(): boolean {
    if (!this.primaryId || !this.alternateId || this.primaryId === this.alternateId) {
      return false;
    }
    return this.mode === "training" || this.totalCost() <= COST_LIMIT;
  }

  private confirm(): void {
    if (!this.isValid() || !this.primaryId || !this.alternateId) return;

    if (this.mode === "online") {
      this.sendOnlineReady();
      return;
    }

    // Local mode (ai / training) — navigate directly
    const activeCardId = [...this.selectedCards].find((id) => getCardById(id).kind === "active");
    const player: FighterLoadout = {
      primaryCharacterId: this.primaryId,
      alternateCharacterId: this.alternateId,
      cardIds: [...this.selectedCards],
      activeCardId,
    };
    const loadouts: BattleLoadouts = {
      player,
      target: this.mode === "training"
        ? { primaryCharacterId: "sakuya", alternateCharacterId: "reimu" }
        : cpuLoadout(),
    };
    this.scene.start("loading", {
      mode: this.mode,
      playerName: uiSettings.username,
      opponentName: this.mode === "training" ? "靶子" : "CPU",
      returnScene: "battle-start",
      loadouts,
      mapId: this.mode === "training" ? "shooting_range" : "arena_standard",
      debug: uiSettings.debug,
    });
  }

  private sendOnlineReady(): void {
    const loadout: PlayerLoadout = {
      primaryCharacterId: this.primaryId!,
      alternateCharacterId: this.alternateId!,
      abilityCardIds: [...this.selectedCards],
      activeAbilityCardId: [...this.selectedCards].find((id) => getCardById(id).kind === "active") ?? undefined,
    };

    // Send network message first, then update UI
    connectionManager.send({ type: "ready", loadout });

    if (!this.scene.isActive()) return;

    this.confirmButton.setEnabled(false);
    this.confirmButton.setLabel("等待对手…");
    this.statusText.setText("已确认，等待对手…").setColor("#ffcf6e").setVisible(true);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roleLabel(role: CharacterDefinition["roleClass"]): string {
  return {
    assault: "\u7a81\u51fb",
    suppress: "\u538b\u5236",
    scout: "\u4fa6\u5bdf",
    sniper: "\u72d9\u51fb",
  }[role];
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

function cpuLoadout(): FighterLoadout {
  return {
    primaryCharacterId: "reimu",
    alternateCharacterId: "marisa",
    cardIds: ["spirit_strike_card"],
    activeCardId: "spirit_strike_card",
  };
}
