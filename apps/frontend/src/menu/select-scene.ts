import Phaser from "phaser";
import { DEFAULT_ABILITY_CARDS, DEFAULT_CHARACTERS, type AbilityCardDefinition, type CharacterDefinition } from "@repo/content";

import { type BattleLoadouts } from "../battle/loadout";
import { type FighterLoadout } from "../battle/loadout";
import {
  createBackButton,
  createCardTile,
  createCharacterTile,
  createFightButton,
  drawFightingBackdrop,
  drawPanelToLayer,
  bodyStyle,
  headingStyle,
} from "./ui";
import { getCardById, getCharacterById, uiSettings, type SceneKey, type SelectionData } from "./shared";

const COST_LIMIT = 10;

export class SelectScene extends Phaser.Scene {
  private mode: SelectionData["mode"] = "ai";
  private primaryId: CharacterDefinition["id"] | undefined;
  private alternateId: CharacterDefinition["id"] | undefined;
  private readonly selectedCards = new Set<AbilityCardDefinition["id"]>();
  private hoverCost = 0;
  private layer!: Phaser.GameObjects.Container;
  private costLayer!: Phaser.GameObjects.Container;
  private confirmButton!: { setEnabled(enabled: boolean): void };

  constructor() {
    super("select" satisfies SceneKey);
  }

  create(data: SelectionData): void {
    this.mode = data.mode;
    this.primaryId = undefined;
    this.alternateId = undefined;
    this.selectedCards.clear();
    drawFightingBackdrop(this, "SELECT", this.mode === "training" ? "TRAINING" : "CPU VERSUS");
    createBackButton(this, "battle-start");
    this.layer = this.add.container(0, 0);
    this.costLayer = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.layer.removeAll(true);
    this.costLayer.removeAll(true);
    this.hoverCost = 0;
    this.addHeader();
    this.addDropBox(706, 184, "常驻模式", this.primaryId);
    this.addDropBox(986, 184, "特殊模式", this.alternateId);
    this.addCharacterRoster();
    this.addCardRoster();
    this.addCostDisplay();
    const confirmButton = createFightButton(this, 1036, 632, 250, 58, "确认出战", () => this.confirm(), {
      enabled: this.isValid(),
      accent: 0xe33d44,
    });
    this.confirmButton = confirmButton;
    this.layer.add(confirmButton.container);
  }

  private addHeader(): void {
    this.layer.add(this.add.text(78, 58, this.mode === "training" ? "靶场配装" : "人机对战配装", headingStyle(38)));
    this.layer.add(this.add.text(82, 108, "左键点击角色和能力卡切换选择。主动能力卡最多 1 张。", bodyStyle("#b7c7d8", 17)));
  }

  private addDropBox(x: number, y: number, label: string, characterId: CharacterDefinition["id"] | undefined): void {
    const box = this.add.container(x, y);
    const graphics = this.add.graphics();
    graphics.fillStyle(0x141923, 0.92);
    graphics.fillTriangle(-110 + 22, -68, 110, -68, 110 - 22, 68);
    graphics.fillTriangle(-110, -68, 110 - 22, 68, -110, 68);
    graphics.lineStyle(2, 0x5c7185, 0.92);
    graphics.strokeTriangle(-110 + 22, -68, 110, -68, 110 - 22, 68);
    graphics.strokeTriangle(-110, -68, 110 - 22, 68, -110, 68);
    box.add(graphics);
    box.add(this.add.text(0, -48, label, bodyStyle("#ffcf6e", 17)).setOrigin(0.5));
    if (characterId) {
      const character = getCharacterById(characterId);
      box.add(this.add.text(0, 48, character.name, bodyStyle("#f6f1e6", 17)).setOrigin(0.5));
    } else {
      box.add(this.add.text(0, 8, "未选择", bodyStyle("#6e8496", 18)).setOrigin(0.5));
    }
  }

  private addCharacterRoster(): void {
    drawPanelToLayer(this, this.layer, 66, 150, 482, 286, "角色");
    DEFAULT_CHARACTERS.forEach((character, index) => {
      const tile = createCharacterTile(this, 142 + index * 148, 282, character, this.isCharacterSelected(character.id), () => {
        this.pickCharacter(character.id);
      });
      tile.hitArea.on("pointerover", () => {
        this.hoverCost = this.previewCharacterDelta(character.id);
        this.updateCostOnly();
        tile.setHovered(true);
      });
      tile.hitArea.on("pointerout", () => {
        this.hoverCost = 0;
        this.updateCostOnly();
        tile.setHovered(false);
      });
      this.layer.add(tile.container);
    });
  }

  private addCardRoster(): void {
    drawPanelToLayer(this, this.layer, 66, 470, 872, 172, "能力卡");
    DEFAULT_ABILITY_CARDS.forEach((card, index) => {
      const x = 142 + index * 152;
      const tile = createCardTile(this, x, 566, card, this.selectedCards.has(card.id), () => {
        this.toggleCard(card);
      });
      tile.hitArea.on("pointerover", () => {
        this.hoverCost = this.previewCardDelta(card);
        this.updateCostOnly();
        tile.setHovered(true);
      });
      tile.hitArea.on("pointerout", () => {
        this.hoverCost = 0;
        this.updateCostOnly();
        tile.setHovered(false);
      });
      this.layer.add(tile.container);
    });
  }

  private addCostDisplay(): void {
    drawPanelToLayer(this, this.costLayer, 630, 292, 500, 150, "cost 槽");
    const total = this.totalCost();
    const projected = Math.max(0, total + this.hoverCost);
    const limitText = this.mode === "training" ? "无限制" : `${COST_LIMIT}`;
    const overLimit = this.mode !== "training" && projected >= COST_LIMIT;
    this.costLayer.add(this.add.text(670, 358, `当前 ${total} / 上限 ${limitText}`, bodyStyle("#f6f1e6", 20)));
    this.drawCostPreviewBar({
      total,
      projected,
      delta: this.hoverCost,
      overLimit,
      x: 670,
      y: 396,
      width: 270,
      height: 22,
    });
  }

  private drawCostPreviewBar(params: {
    readonly total: number;
    readonly projected: number;
    readonly delta: number;
    readonly overLimit: boolean;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }): void {
    const bar = this.add.graphics();
    const visualLimit = this.mode === "training" ? Math.max(COST_LIMIT, params.total, params.projected, 1) : COST_LIMIT;
    const currentRatio = clamp(params.total / visualLimit, 0, 1);
    const projectedRatio = clamp(params.projected / visualLimit, 0, 1);
    const currentWidth = params.width * currentRatio;
    const projectedWidth = params.width * projectedRatio;

    bar.fillStyle(0x273548, 1).fillRect(params.x, params.y, params.width, params.height);
    bar.lineStyle(2, 0x5c7185, 0.9).strokeRect(params.x, params.y, params.width, params.height);
    bar.fillStyle(0x34d399, 1).fillRect(params.x, params.y, currentWidth, params.height);

    if (params.delta > 0) {
      bar.fillStyle(params.overLimit ? 0xff5c66 : 0x7cff8a, 0.95);
      bar.fillRect(params.x + currentWidth, params.y, Math.max(0, projectedWidth - currentWidth), params.height);
    } else if (params.delta < 0) {
      bar.fillStyle(0x101820, 0.62);
      bar.fillRect(params.x + projectedWidth, params.y, Math.max(0, currentWidth - projectedWidth), params.height);
    }

    this.costLayer.add(bar);
    this.costLayer.add(this.add.text(params.x + params.width + 18, params.y - 5, `${params.total}`, bodyStyle("#7cff8a", 24)));
    if (params.delta !== 0) {
      const sign = params.delta > 0 ? "+" : "";
      this.costLayer.add(this.add.text(params.x + params.width + 56, params.y - 1, `(${sign}${params.delta})`, bodyStyle(params.overLimit && params.delta > 0 ? "#ff5c66" : "#7cff8a", 20)));
    }
  }

  private updateCostOnly(): void {
    this.costLayer.removeAll(true);
    this.addCostDisplay();
    this.confirmButton.setEnabled(this.isValid());
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
    const cardCost = [...this.selectedCards].map((id) => getCardById(id).cost).reduce((sum, cost) => sum + cost, 0);
    return characterCost + cardCost;
  }

  private isValid(): boolean {
    if (!this.primaryId || !this.alternateId || this.primaryId === this.alternateId) {
      return false;
    }
    return this.mode === "training" || this.totalCost() < COST_LIMIT;
  }

  private confirm(): void {
    if (!this.isValid() || !this.primaryId || !this.alternateId) {
      return;
    }
    const activeCardId = [...this.selectedCards].find((id) => getCardById(id).kind === "active");
    const player: FighterLoadout = {
      primaryCharacterId: this.primaryId,
      alternateCharacterId: this.alternateId,
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
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cpuLoadout(): FighterLoadout {
  return {
    primaryCharacterId: "sakuya",
    alternateCharacterId: "reimu",
    activeCardId: "spirit_strike_card",
  };
}
