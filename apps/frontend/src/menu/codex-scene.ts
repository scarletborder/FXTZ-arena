import Phaser from "phaser";
import { DEFAULT_ABILITY_CARDS, DEFAULT_CHARACTERS, type AbilityCardDefinition, type CharacterDefinition } from "@repo/content";

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
  private selectedCharacter = DEFAULT_CHARACTERS[0]!;
  private selectedCard = DEFAULT_ABILITY_CARDS[0]!;
  private listLayer!: Phaser.GameObjects.Container;
  private detailLayer!: Phaser.GameObjects.Container;

  constructor() {
    super("codex" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "CODEX", "DATA BANK");
    createBackButton(this);
    this.add.text(90, 74, "图鉴", headingStyle(42));

    drawPanel(this, 58, 136, 492, 526, "");
    drawPanel(this, 590, 136, 632, 526, "");
    this.listLayer = this.add.container(0, 0);
    this.detailLayer = this.add.container(0, 0);
    this.render();
  }

  private render(): void {
    this.listLayer.removeAll(true);
    this.detailLayer.removeAll(true);
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
    this.listLayer.add(createSmallTab(this, 98, 170, "角色", this.tab === "characters", () => {
      this.tab = "characters";
      this.render();
    }).container);
    this.listLayer.add(createSmallTab(this, 206, 170, "能力卡", this.tab === "cards", () => {
      this.tab = "cards";
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
        ["active", "主动使用"],
        ["passive", "被动"],
      ] as const;

    filters.forEach((filter, index) => {
      this.listLayer.add(createSmallTab(this, 330 + index * 74, 170, filter[1], this.activeFilter() === filter[0], () => {
        if (this.tab === "characters") {
          this.roleFilter = filter[0] as CharacterDefinition["roleClass"] | "all";
        } else {
          this.cardFilter = filter[0] as AbilityCardDefinition["kind"] | "all";
        }
        this.render();
      }, 64).container);
    });
  }

  private activeFilter(): string {
    return this.tab === "characters" ? this.roleFilter : this.cardFilter;
  }

  private renderCharacterList(): void {
    DEFAULT_CHARACTERS
      .filter((character) => this.roleFilter === "all" || character.roleClass === this.roleFilter)
      .forEach((character, index) => {
        const item = createCodexTile(this, 114 + (index % 2) * 206, 234 + Math.floor(index / 2) * 184, character.name, character.cost, roleLabel(character.roleClass), character.id === this.selectedCharacter.id, (target) => {
          drawCharacterIcon(this, target, 82, 48, 1.0);
        }, () => {
          this.selectedCharacter = character;
          this.render();
        });
        this.listLayer.add(item.container);
      });
  }

  private renderCardList(): void {
    DEFAULT_ABILITY_CARDS
      .filter((card) => this.cardFilter === "all" || card.kind === this.cardFilter)
      .forEach((card, index) => {
        const item = createCodexTile(this, 114 + (index % 2) * 206, 234 + Math.floor(index / 2) * 184, card.name, card.cost, card.kind === "active" ? "主动使用" : "被动", card.id === this.selectedCard.id, (target) => {
          drawCardIcon(this, target, 82, 48, card.kind, 1.0);
        }, () => {
          this.selectedCard = card;
          this.render();
        });
        this.listLayer.add(item.container);
      });
  }

  private renderCharacterDetail(): void {
    const character = this.selectedCharacter;
    const preview = createPreviewArena(this, 652, 174, character.name, (target) => {
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
    this.detailLayer.add(this.add.text(640, 442, lines.join("\n"), bodyStyle("#d7e3ef", 18)).setLineSpacing(10).setWordWrapWidth(520));
  }

  private renderCardDetail(): void {
    const card = this.selectedCard;
    const preview = createPreviewArena(this, 652, 174, card.name, (target) => {
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
    this.detailLayer.add(this.add.text(640, 442, lines.join("\n"), bodyStyle("#d7e3ef", 18)).setLineSpacing(10).setWordWrapWidth(520));
  }
}

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
