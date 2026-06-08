import Phaser from "phaser";
import { t } from "@repo/i18n";
import { DIFFICULTY_CONFIGS, EnumDifficulty, type CharacterId } from "@repo/types";

import { loadPortraitAssets } from "../../battle/assets";
import { queueAllStoryJson } from "../../story/assets";
import { createInitialStoryState } from "../../story/state";
import type { StoryId, StoryProgressData } from "../../story/types";
import {
  getCharacterById,
  installMenuAudioUnlock,
  type SceneKey,
} from "../shared";
import {
  bodyStyle,
  createFightButton,
  drawFightingBackdrop,
  headingStyle,
} from "../ui";
import { STORY_CHARACTERS } from "./constants";
import { applyDifficultyToStory, fitImageToBounds, getStoryFromCache, wrapIndex } from "./helpers";
import { globalReplayRecorder } from "../../replay/recorder";
import { StoryStartConfig } from "./types";

interface DifficultyOption {
  key: EnumDifficulty;
  titleKey: string;
  descKey: string;
}

// 定义 4 个难度配置及对应的 i18n key
// 注：若您的 EnumDifficulty 中第四个难度定义非 Expert（例如 Lunatic 或 VeryHard），请对应修改 key 的指向
const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  {
    key: EnumDifficulty.Easy,
    titleKey: "story.difficulties.easy.title",
    descKey: "story.difficulties.easy.description",
  },
  {
    key: EnumDifficulty.Normal,
    titleKey: "story.difficulties.normal.title",
    descKey: "story.difficulties.normal.description",
  },
  {
    key: EnumDifficulty.Hard,
    titleKey: "story.difficulties.hard.title",
    descKey: "story.difficulties.hard.description",
  },
  {
    key: EnumDifficulty.Expert,
    titleKey: "story.difficulties.expert.title",
    descKey: "story.difficulties.expert.description",
  },
];

export class StoryStartLoadoutScene extends Phaser.Scene {
  private selectedIndex = 0;
  private selectedDifficulty = EnumDifficulty.Normal; // 追踪当前选中的难度，默认 Normal
  private layer!: Phaser.GameObjects.Container;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
      this.pick(-1);
    } else if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
      this.pick(1);
    }
  };

  constructor() {
    super("story-start-loadout" satisfies SceneKey);
  }

  preload(): void {
    queueAllStoryJson(this);
    loadPortraitAssets(this);
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "STORY", "LOADOUT");
    this.layer = this.add.container(0, 0);
    this.input.keyboard?.on("keydown", this.onKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown", this.onKeyDown);
    });
    this.render();
  }

  private render(): void {
    this.layer.removeAll(true);
    const selectedId = STORY_CHARACTERS[this.selectedIndex]!;
    const character = getCharacterById(selectedId);
    const portraitKey = `character-portrait-${selectedId}`;

    const title = this.add.text(
      86,
      64,
      t("story.start_title"),
      headingStyle(38),
    );
    this.layer.add(title);

    if (this.textures.exists(portraitKey)) {
      const portrait = this.add
        .image(318, 408, portraitKey)
        .setOrigin(0.5, 0.5);
      fitImageToBounds(portrait, 520, 610);
      this.layer.add(portrait);
    }
    this.layer.add(this.add.rectangle(640, 360, 2, 560, 0x34475c, 0.72));

    // 角色选择标题
    this.layer.add(
      this.add
        .text(160, 142, t("story.choose_primary"), bodyStyle("#ffcf6e", 20))
        .setOrigin(0.5),
    );

    // 1. 渲染角色选择轮盘
    for (let offset = -1; offset <= 1; offset += 1) {
      const index = wrapIndex(
        this.selectedIndex + offset,
        STORY_CHARACTERS.length,
      );
      const id = STORY_CHARACTERS[index]!;
      const y = 310 + offset * 118;
      const isSelected = offset === 0;
      const tile = this.add.container(522, y - 44);
      const background = this.add.graphics();
      background.fillStyle(
        isSelected ? 0x253042 : 0x101820,
        isSelected ? 0.96 : 0.72,
      );
      background.fillRect(0, 0, 220, 88);
      background.lineStyle(
        2,
        isSelected ? 0xffcf6e : 0x34475c,
        isSelected ? 1 : 0.68,
      );
      background.strokeRect(0, 0, 220, 88);
      tile.add(background);
      tile.add(
        this.add
          .text(
            110,
            24,
            getCharacterById(id).name,
            bodyStyle(isSelected ? "#ffffff" : "#b7c7d8", isSelected ? 22 : 18),
          )
          .setOrigin(0.5),
      );
      tile.add(
        this.add
          .text(110, 56, id, bodyStyle(isSelected ? "#ffcf6e" : "#6e8496", 13))
          .setOrigin(0.5),
      );
      const hit = this.add
        .rectangle(0, 0, 220, 88, 0xffffff, 0.001)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerup", () => {
        this.selectedIndex = index;
        this.render();
      });
      tile.add(hit);
      this.layer.add(tile);
    }

    // 2. 渲染难度选择标题与 4 个难度选项
    const difficultyTitleX = 1020;
    const difficultyTitleY = 160;
    this.layer.add(
      this.add
        .text(difficultyTitleX, difficultyTitleY, t("story.choose_difficulty"), bodyStyle("#ffcf6e", 20))
        .setOrigin(0.5),
    );

    const startY = difficultyTitleY + 18;       // 对齐角色轮盘的最上方起点
    const boxWidth = 220;     // 与角色选择框保持同宽
    const boxHeight = 76;     // 适配 4 个框的垂直空间
    const boxGap = 12;

    DIFFICULTY_OPTIONS.forEach((opt, idx) => {
      const y = startY + idx * (boxHeight + boxGap);
      const isSelected = this.selectedDifficulty === opt.key;
      const tile = this.add.container(difficultyTitleX - 110, y);

      const background = this.add.graphics();
      background.fillStyle(
        isSelected ? 0x253042 : 0x101820,
        isSelected ? 0.96 : 0.72,
      );
      background.fillRect(0, 0, boxWidth, boxHeight);
      background.lineStyle(
        2,
        isSelected ? 0xffcf6e : 0x34475c,
        isSelected ? 1 : 0.68,
      );
      background.strokeRect(0, 0, boxWidth, boxHeight);
      tile.add(background);

      // 难度标题
      tile.add(
        this.add
          .text(
            boxWidth / 2,
            22,
            t(opt.titleKey),
            bodyStyle(isSelected ? "#ffffff" : "#b7c7d8", isSelected ? 18 : 16),
          )
          .setOrigin(0.5),
      );

      // 难度小字描述
      tile.add(
        this.add
          .text(
            boxWidth / 2,
            50,
            t(opt.descKey),
            bodyStyle(isSelected ? "#ffcf6e" : "#6e8496", 11),
          )
          .setOrigin(0.5),
      );

      // 交互区域
      const hit = this.add
        .rectangle(0, 0, boxWidth, boxHeight, 0xffffff, 0.001)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerup", () => {
        this.selectedDifficulty = opt.key;
        this.render();
      });
      tile.add(hit);
      this.layer.add(tile);
    });

    // 3. 底部与返回按钮
    this.layer.add(
      createFightButton(
        this,
        1116,
        70,
        178,
        48,
        t("story.back"),
        () => this.scene.start("battle-start"),
        { accent: 0x5c7185 },
      ).container,
    );
    this.layer.add(
      createFightButton(
        this,
        1116,
        650,
        178,
        56,
        t("story.next"),
        () => this.startStory({
          characterId: character.id,
          difficulty: this.selectedDifficulty, // 传入当前选中的难度
        }),
        { accent: 0xe33d44 },
      ).container,
    );
  }

  private pick(delta: number): void {
    this.selectedIndex = wrapIndex(
      this.selectedIndex + delta,
      STORY_CHARACTERS.length,
    );
    this.render();
  }

  private startStory(cfg: StoryStartConfig): void {
    const characterId: CharacterId = cfg.characterId;
    const difficultyConfig = DIFFICULTY_CONFIGS[cfg.difficulty];

    const storyId = characterId as StoryId;
    let story = getStoryFromCache(this, storyId);

    // 根据difficulty调整初始状态story state
    story = applyDifficultyToStory(story, difficultyConfig);

    globalReplayRecorder.reset();
    this.scene.start("story-progress", {
      state: createInitialStoryState(story, characterId),
    } satisfies StoryProgressData);
  }
}