import Phaser from "phaser";
import { t } from "@repo/i18n";
import { DIFFICULTY_CONFIGS, EnumDifficulty } from "@repo/types";

import {
  queueStoryBackgroundAssets,
  queueStoryJson,
  queueStoryUiAssets,
  storyIconKey,
} from "../../story/assets";
import { applyStoryReward } from "../../story/state";
import type {
  StoryDefinition,
  StoryDialogueLine,
  StoryLoadoutData,
  StoryProgressData,
  StoryResultData,
  StoryRuntimeState,
  StoryStage,
  StoryStageReward,
} from "../../story/types";
import { installMenuAudioUnlock, type SceneKey } from "../shared";
import { bodyStyle, createFightButton, drawFightingBackdrop } from "../ui";
import { globalReplayRecorder } from "../../replay/recorder";
import {
  DIALOGUE_HEIGHT,
  DIALOGUE_TEXT_WIDTH,
  TOTAL_PROGRESS_POINTS,
  TYPEWRITER_MS,
} from "./constants";
import {
  applyDifficultyToStory,
  fitImageToBounds,
  fitImageToCover,
  getStoryFromCache,
  hasReward,
  progressRatio,
  rewardLines,
} from "./helpers";

export class StoryProgressScene extends Phaser.Scene {
  private story!: StoryDefinition;
  private state!: StoryRuntimeState;
  private progressData!: StoryProgressData;
  private progressLayer!: Phaser.GameObjects.Container;
  private dialogueLayer!: Phaser.GameObjects.Container;
  private stageLabelLayer!: Phaser.GameObjects.Container;
  private rewardTipLayer!: Phaser.GameObjects.Container;
  private backgroundLayer!: Phaser.GameObjects.Container;
  private backgroundObject: Phaser.GameObjects.GameObject | undefined;
  private script: readonly StoryDialogueLine[] = [];
  private scriptIndex = 0;
  private visibleText = "";
  private typingEvent: Phaser.Time.TimerEvent | undefined;
  private textContent!: Phaser.GameObjects.Text;
  private speakerText!: Phaser.GameObjects.Text;
  private dialogueVisible = true;
  private lineGameEnd = false;

  constructor() {
    super("story-progress" satisfies SceneKey);
  }

  init(data: StoryProgressData): void {
    this.progressData = data;
    this.state = data.rewardApplied ? data.state : data.state;
  }

  preload(): void {
    queueStoryJson(this, this.progressData.state.storyId);
    queueStoryUiAssets(this);
    queueStoryBackgroundAssets(this, this.progressData.state.storyId);
  }

  create(): void {
    installMenuAudioUnlock(this);
    this.story = getStoryFromCache(this, this.progressData.state.storyId);
    this.story = applyDifficultyToStory(
      this.story,
      DIFFICULTY_CONFIGS[this.state.difficulty ?? EnumDifficulty.Normal],
    );
    const reward =
      this.progressData.clearedStageIndex === undefined
        ? undefined
        : this.story.stages[this.progressData.clearedStageIndex]?.reward;
    this.state = applyStoryReward(this.progressData.state, reward);
    drawFightingBackdrop(this, "STORY", "PROGRESS");
    this.backgroundLayer = this.add.container(0, 0).setDepth(1);
    this.dialogueLayer = this.add.container(0, 0).setDepth(8).setVisible(false);
    this.stageLabelLayer = this.add.container(0, 0).setDepth(9);
    this.rewardTipLayer = this.add
      .container(0, 0)
      .setDepth(50)
      .setVisible(false);
    this.renderProgressFocus();
  }

  private renderProgressFocus(): void {
    const dim = this.add
      .rectangle(640, 360, 1280, 720, 0x06080c, 0.42)
      .setDepth(5);
    this.progressLayer = this.add.container(0, 0).setDepth(6);
    this.drawProgressBar(this.progressLayer, 218, 504, 844, 92, true);

    const targetY = -386;
    this.time.delayedCall(this.progressData.fromBattle ? 600 : 420, () => {
      this.tweens.add({
        targets: this.progressLayer,
        y: targetY,
        duration: 720,
        ease: "Cubic.easeInOut",
        onComplete: () => {
          dim.destroy();
          this.showStoryHeaderAndDialogue();
        },
      });
    });
  }

  private showStoryHeaderAndDialogue(): void {
    const stage = this.currentStage();
    const label = stage
      ? t("story.stage_label", {
          index: this.state.currentStageIndex + 1,
          title: stage.title,
        })
      : t("story.ending_label");
    this.stageLabelLayer.add(
      this.add.text(640, 36, label, bodyStyle("#ffcf6e", 22)).setOrigin(0.5),
    );
    this.script = stage?.script ?? this.story.endingScript;
    this.scriptIndex = 0;
    this.createDialogueUi();
    this.showLine(0);
  }

  private drawProgressBar(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    height: number,
    large: boolean,
  ): void {
    const graphics = this.add.graphics();
    const centerY = y + height / 2;
    graphics.lineStyle(large ? 14 : 10, 0x34475c, 0.95);
    graphics.lineBetween(x + 42, centerY, x + width - 42, centerY);
    graphics.lineStyle(large ? 8 : 6, 0xe33d44, 1);
    const markerRatio = progressRatio(
      this.state.currentStageIndex,
      TOTAL_PROGRESS_POINTS,
    );
    graphics.lineBetween(
      x + 42,
      centerY,
      x + 42 + (width - 84) * markerRatio,
      centerY,
    );
    layer.add(graphics);

    for (let index = 0; index < TOTAL_PROGRESS_POINTS; index += 1) {
      const px = x + 42 + ((width - 84) * index) / (TOTAL_PROGRESS_POINTS - 1);
      const stage = this.story.stages[index];
      const active = index <= this.state.currentStageIndex;
      const dot = this.add.circle(
        px,
        centerY,
        large ? 16 : 12,
        active ? 0xffcf6e : 0x101820,
        1,
      );
      dot.setStrokeStyle(3, active ? 0xffffff : 0x5c7185, active ? 0.9 : 0.65);
      layer.add(dot);
      if (stage && this.textures.exists(storyIconKey(stage.icon))) {
        const icon = this.add
          .image(px, centerY - (large ? 54 : 42), storyIconKey(stage.icon))
          .setOrigin(0.5);
        fitImageToBounds(icon, large ? 46 : 34, large ? 46 : 34);
        layer.add(icon);
      }
      if (stage && hasReward(stage.reward)) {
        layer.add(
          this.createRewardChest(
            px + (large ? 23 : 17),
            centerY - (large ? 76 : 58),
            large ? 26 : 20,
            stage.reward,
          ),
        );
      }
    }

    const markerStartIndex =
      large && this.progressData.fromBattle
        ? Math.max(0, this.state.currentStageIndex - 1)
        : this.state.currentStageIndex;
    const markerStartRatio = progressRatio(
      markerStartIndex,
      TOTAL_PROGRESS_POINTS,
    );
    const markerY = centerY + (large ? 38 : 28);
    const markerX = x + 57 + (width - 84) * markerStartRatio;
    const marker = this.add.triangle(
      markerX,
      markerY,
      0,
      -14,
      16,
      14,
      -16,
      14,
      0x26c6da,
      1,
    );
    marker.setStrokeStyle(2, 0xffffff, 0.8);
    layer.add(marker);
    this.tweens.add({
      targets: marker,
      alpha: 0.5,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    if (large && this.progressData.fromBattle) {
      this.tweens.add({
        targets: marker,
        x: x + 57 + (width - 84) * markerRatio,
        duration: 620,
        ease: "Cubic.easeOut",
      });
    }
  }

  private createDialogueUi(): void {
    this.input.on("pointerup", this.handleSceneClick, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerup", this.handleSceneClick, this);
      this.typingEvent?.remove(false);
    });

    this.add
      .rectangle(640, 360, 1280, 720, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .setDepth(2);

    const box = this.add.container(0, 720 - DIALOGUE_HEIGHT);
    const panel = this.add.rectangle(
      640,
      DIALOGUE_HEIGHT / 2,
      1180,
      DIALOGUE_HEIGHT - 28,
      0x080b10,
      0.72,
    );
    panel.setStrokeStyle(2, 0x5c7185, 0.72);
    this.speakerText = this.add.text(86, 26, " ", bodyStyle("#ffcf6e", 22));
    this.textContent = this.add
      .text(86, 72, " ", bodyStyle("#f6f1e6", 22))
      .setWordWrapWidth(DIALOGUE_TEXT_WIDTH, true)
      .setWordWrapCallback(wrapDialogueText)
      .setLineSpacing(8);
    const hit = this.add
      .rectangle(
        640,
        DIALOGUE_HEIGHT / 2,
        1180,
        DIALOGUE_HEIGHT - 28,
        0xffffff,
        0.001,
      )
      .setInteractive({ useHandCursor: true });
    hit.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      pointer.event?.stopPropagation();
      this.advanceDialogue();
    });
    box.add([panel, this.speakerText, this.textContent, hit]);
    this.dialogueLayer.add(box);
    this.dialogueLayer.setVisible(true);
  }

  private showLine(index: number): void {
    const line = this.script[index];
    if (!line) {
      this.showNextButton(this.lineGameEnd);
      return;
    }
    this.scriptIndex = index;
    this.lineGameEnd = line.game_end === true;
    this.applyDialogueBackground(line.background ?? "black");
    this.speakerText.setText(line.speaker);
    this.speakerText.setColor(line.color ?? "#ffcf6e");
    this.textContent.setColor(line.color ?? "#f6f1e6");
    this.visibleText = "";
    this.textContent.setText(" ");
    this.typingEvent?.remove(false);
    const chars = Array.from(line.content);
    this.typingEvent = this.time.addEvent({
      delay: TYPEWRITER_MS,
      repeat: chars.length - 1,
      callback: () => {
        this.visibleText += chars[this.visibleText.length] ?? "";
        this.textContent.setText(this.visibleText || " ");
      },
    });
  }

  private applyDialogueBackground(background: "black" | string): void {
    const previous = this.backgroundObject;
    const next =
      background === "black" || !this.textures.exists(background)
        ? this.add.rectangle(640, 360, 1280, 720, 0x000000, 1)
        : this.add.image(640, 360, background);
    if (background !== "black" && this.textures.exists(background)) {
      fitImageToCover(next as Phaser.GameObjects.Image, 1280, 720);
    }
    next.setAlpha(previous ? 0 : 1);
    this.backgroundLayer.add(next);
    this.backgroundObject = next;
    if (previous) {
      this.tweens.add({
        targets: next,
        alpha: 1,
        duration: 360,
        ease: "Sine.easeOut",
      });
      this.tweens.add({
        targets: previous,
        alpha: 0,
        duration: 360,
        ease: "Sine.easeOut",
        onComplete: () => previous.destroy(),
      });
    }
  }

  private advanceDialogue(): void {
    const line = this.script[this.scriptIndex];
    if (!line) {
      return;
    }
    if (this.visibleText.length < Array.from(line.content).length) {
      this.typingEvent?.remove(false);
      this.visibleText = line.content;
      this.textContent.setText(line.content);
      return;
    }
    this.showLine(this.scriptIndex + 1);
  }

  private showNextButton(gameEnd: boolean): void {
    this.typingEvent?.remove(false);
    this.setStoryOverlayVisible(this.dialogueVisible);
    const button = createFightButton(
      this,
      1088,
      472,
      190,
      50,
      t("story.next"),
      () => {
        if (
          gameEnd ||
          this.state.currentStageIndex >= this.story.stages.length
        ) {
          const replay = globalReplayRecorder.hasData()
            ? globalReplayRecorder.finalize({
                title: this.story.title,
                mode: "story",
                difficulty: this.state.difficulty,
                player1Id: this.story.playableCharacterId,
                player2Id: t("select.cpu"),
                winnerPlayerId: "Player1",
                finalGlobalInputHash: null,
                loadouts: {
                  player: {
                    primaryCharacterId: this.state.primaryCharacterId,
                    alternateCharacterId: this.state.alternateCharacterId ?? this.state.primaryCharacterId,
                    cardIds: [...this.state.cardIds],
                    activeCardId: this.state.activeCardId,
                  },
                  target: {
                    primaryCharacterId: this.story.stages[this.story.stages.length - 1]?.opponent.primaryCharacterId ?? "sakuya",
                    alternateCharacterId: this.story.stages[this.story.stages.length - 1]?.opponent.alternateCharacterId ?? "cirno",
                  },
                },
              })
            : undefined;
          this.scene.start("story-result", {
            story: this.story,
            state: this.state,
            success: true,
            replay,
          } satisfies StoryResultData);
          return;
        }
        this.scene.start("story-loadout", {
          story: this.story,
          state: this.state,
        } satisfies StoryLoadoutData);
      },
      { accent: 0xe33d44 },
    );
    button.container.setDepth(9);
  }

  private handleSceneClick(pointer: Phaser.Input.Pointer): void {
    if (!this.dialogueVisible) {
      this.setStoryOverlayVisible(true);
      return;
    }
    if (pointer.y < 720 - DIALOGUE_HEIGHT) {
      this.setStoryOverlayVisible(false);
    }
  }

  private setStoryOverlayVisible(visible: boolean): void {
    this.dialogueVisible = visible;
    if (!visible) {
      this.hideRewardTip();
    }
    this.dialogueLayer.setVisible(visible);
    this.progressLayer.setVisible(visible);
    this.stageLabelLayer.setVisible(visible);
  }

  private currentStage(): StoryStage | undefined {
    return this.story.stages[this.state.currentStageIndex];
  }

  private createRewardChest(
    x: number,
    y: number,
    size: number,
    reward: StoryStageReward,
  ): Phaser.GameObjects.Container {
    const chest = this.add.container(x, y);
    const graphics = this.add.graphics();
    const width = size;
    const height = size * 0.78;
    const left = -width / 2;
    const top = -height / 2;
    graphics
      .fillStyle(0x6b3f1f, 1)
      .fillRoundedRect(left, top + height * 0.26, width, height * 0.62, 3);
    graphics
      .fillStyle(0xd18a30, 1)
      .fillRoundedRect(left + 1, top + 1, width - 2, height * 0.4, 4);
    graphics
      .lineStyle(2, 0x2a1a12, 0.95)
      .strokeRoundedRect(left, top + 1, width, height * 0.87, 4);
    graphics
      .fillStyle(0xffcf6e, 1)
      .fillRect(left + width * 0.43, top + 2, width * 0.14, height * 0.84);
    graphics
      .fillStyle(0x101820, 1)
      .fillRoundedRect(
        left + width * 0.36,
        top + height * 0.45,
        width * 0.28,
        height * 0.2,
        2,
      );
    graphics
      .lineStyle(1, 0xffffff, 0.8)
      .strokeRoundedRect(left + 1, top + 1, width - 2, height * 0.86, 4);
    chest.add(graphics);

    const hit = this.add
      .rectangle(0, 0, size + 10, size + 10, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerover", () => this.showRewardTip(reward));
    hit.on("pointermove", (pointer: Phaser.Input.Pointer) =>
      this.positionRewardTip(pointer.x, pointer.y),
    );
    hit.on("pointerout", () => this.hideRewardTip());
    chest.add(hit);
    return chest;
  }

  private showRewardTip(reward: StoryStageReward): void {
    const lines = rewardLines(reward);
    if (lines.length === 0) {
      return;
    }
    const width = 184;
    const padding = 14;
    const rowHeight = 25;
    const height = padding * 2 + 30 + lines.length * rowHeight;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x0d131b, 0.98).fillRect(0, 0, width, height);
    graphics.lineStyle(2, 0xffcf6e, 0.95).strokeRect(0, 0, width, height);
    graphics
      .lineStyle(1, 0x34475c, 0.78)
      .lineBetween(padding, 42, width - padding, 42);

    const children: Phaser.GameObjects.GameObject[] = [
      graphics,
      this.add.text(
        padding,
        12,
        t("story.reward_title"),
        bodyStyle("#f6f1e6", 16),
      ),
    ];
    lines.forEach((line, index) => {
      children.push(
        this.add.text(
          padding,
          50 + index * rowHeight,
          line,
          bodyStyle("#ffcf6e", 15),
        ),
      );
    });

    this.rewardTipLayer.removeAll(true);
    this.rewardTipLayer.add(children);
    this.rewardTipLayer.setSize(width, height).setVisible(true);
    const pointer = this.input.activePointer;
    this.positionRewardTip(pointer.x, pointer.y);
  }

  private positionRewardTip(pointerX: number, pointerY: number): void {
    if (!this.rewardTipLayer.visible) {
      return;
    }
    const margin = 14;
    const x = Phaser.Math.Clamp(
      pointerX + 16,
      margin,
      this.scale.width - this.rewardTipLayer.width - margin,
    );
    const y = Phaser.Math.Clamp(
      pointerY + 16,
      margin,
      this.scale.height - this.rewardTipLayer.height - margin,
    );
    this.rewardTipLayer.setPosition(x, y);
  }

  private hideRewardTip(): void {
    this.rewardTipLayer?.removeAll(true);
    this.rewardTipLayer?.setVisible(false);
  }
}

function wrapDialogueText(
  text: string,
  textObject: Phaser.GameObjects.Text,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    lines.push(
      ...wrapDialogueParagraph(paragraph, textObject, DIALOGUE_TEXT_WIDTH),
    );
  }
  return lines.length === 0 ? [" "] : lines;
}

function wrapDialogueParagraph(
  paragraph: string,
  textObject: Phaser.GameObjects.Text,
  maxWidth: number,
): string[] {
  if (paragraph.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";
  for (const rawChar of Array.from(paragraph)) {
    const char = rawChar === "\t" ? " " : rawChar;
    const candidate = `${current}${char}`;
    if (!current || measureTextWidth(textObject, candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    const softBreakIndex = findLastWhitespaceBreak(current);
    if (softBreakIndex > 0) {
      const head = current.slice(0, softBreakIndex).trimEnd();
      const tail = current.slice(softBreakIndex).trimStart();
      if (head) {
        lines.push(head);
      }
      current = `${tail}${char}`.trimStart();
      while (current && measureTextWidth(textObject, current) > maxWidth) {
        const forcedLine = takeFittingPrefix(current, textObject, maxWidth);
        lines.push(forcedLine);
        current = current.slice(forcedLine.length).trimStart();
      }
    } else {
      lines.push(current.trimEnd());
      current = char.trimStart();
    }
  }

  if (current) {
    lines.push(current.trimEnd());
  }
  return lines.length === 0 ? [""] : lines;
}

function findLastWhitespaceBreak(text: string): number {
  const chars = Array.from(text);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    if (/\s/u.test(chars[index]!)) {
      return chars.slice(0, index).join("").length;
    }
  }
  return -1;
}

function takeFittingPrefix(
  text: string,
  textObject: Phaser.GameObjects.Text,
  maxWidth: number,
): string {
  let prefix = "";
  for (const char of Array.from(text)) {
    const candidate = `${prefix}${char}`;
    if (prefix && measureTextWidth(textObject, candidate) > maxWidth) {
      return prefix;
    }
    prefix = candidate;
  }
  return prefix || Array.from(text)[0] || "";
}

function measureTextWidth(
  textObject: Phaser.GameObjects.Text,
  text: string,
): number {
  return textObject.context.measureText(text).width;
}
