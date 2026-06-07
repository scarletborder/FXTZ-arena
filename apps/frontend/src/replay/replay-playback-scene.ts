import Phaser from "phaser";
import { IS_DESKTOP_APP } from "@repo/constants";
import { t } from "@repo/i18n";
import { getCharacterDefinition, getAbilityCardDefinition } from "@repo/content";
import type { BattleLoadouts, FighterLoadout } from "@repo/raid-logic";

import { installMenuAudioUnlock } from "../menu/shared";
import {
  bodyStyle,
  createFightButton,
  createRectangleButton,
  drawFightingBackdrop,
  headingStyle,
} from "../menu/ui";
import type { ReplayFile } from "./types";
import { SLOTS_PER_PAGE } from "./types";
import {
  desktopOpenReplayFolder,
  desktopSaveAs,
  downloadReplay,
  formatBattleDuration,
  formatSlotTime,
  getPageCount,
  listSlotsForPage,
  loadReplay,
  replayFileToJson,
} from "./storage";
import { validateReplayJson } from "./validation";

interface DialogState {
  readonly layer: Phaser.GameObjects.Container;
  cleanup(): void;
}

export class ReplayPlaybackScene extends Phaser.Scene {
  private currentPage = 0;
  private dialog: DialogState | undefined;
  private renderGen = 0;

  constructor() {
    super("replay-playback");
  }

  create(): void {
    installMenuAudioUnlock(this);
    this.dialog = undefined;
    this.renderPage();
  }

  private async renderPage(): Promise<void> {
    const gen = ++this.renderGen;
    this.children.removeAll(true);
    drawFightingBackdrop(this, "REPLAY", "PLAY");

    // Back button
    createFightButton(this, 85, 56, 120, 42, t("replay.back"), () => {
      this.scene.start("home");
    }, { accent: 0x5c7185 });

    const slots = await listSlotsForPage(this.currentPage);
    if (this.renderGen !== gen) return;
    const panelX = 90;
    const panelY = 100;
    const rowHeight = 34;
    const panelWidth = 1100;

    // Draw panel background
    const panel = this.add.graphics();
    panel.fillStyle(0x0b1118, 0.88);
    panel.fillRoundedRect(panelX - 10, panelY - 10, panelWidth, rowHeight * SLOTS_PER_PAGE + 20, 6);
    panel.lineStyle(1, 0x34475c, 0.72);
    panel.strokeRoundedRect(panelX - 10, panelY - 10, panelWidth, rowHeight * SLOTS_PER_PAGE + 20, 6);
    panel.setDepth(0);

    // Header row
    this.add.text(panelX + 10, panelY - 6, "#", bodyStyle("#6e8496", 13)).setDepth(1);
    this.add.text(panelX + 45, panelY - 6, t("replay.col_title"), bodyStyle("#6e8496", 13)).setDepth(1);
    this.add.text(panelX + 400, panelY - 6, t("replay.col_time"), bodyStyle("#6e8496", 13)).setDepth(1);
    this.add.text(panelX + 600, panelY - 6, t("replay.col_mode"), bodyStyle("#6e8496", 13)).setDepth(1);
    this.add.text(panelX + 710, panelY - 6, t("replay.save_as"), bodyStyle("#6e8496", 13)).setDepth(1);
    this.add.text(panelX + 820, panelY - 6, t("replay.info"), bodyStyle("#6e8496", 13)).setDepth(1);

    for (let i = 0; i < SLOTS_PER_PAGE; i += 1) {
      const slotIndex = this.currentPage * SLOTS_PER_PAGE + i;
      const y = panelY + 16 + i * rowHeight;
      const slot = slots[i];

      // Slot number
      this.add.text(panelX + 10, y + 10, `${slotIndex + 1}`, bodyStyle("#5c7185", 14)).setDepth(1);

      // Divider line
      if (i > 0) {
        const line = this.add.graphics();
        line.lineStyle(1, 0x1d2b36, 0.6);
        line.lineBetween(panelX, y - 2, panelX + panelWidth - 20, y - 2);
        line.setDepth(0);
      }

      if (slot) {
        // Title — clickable to play
        const displayTitle = slot.title.length > 28 ? `${slot.title.slice(0, 26)}...` : slot.title;
        this.add.text(panelX + 45, y + 10, displayTitle, bodyStyle("#ffcf6e", 15)).setDepth(1);
        const titleHit = this.add.rectangle(
          panelX + 45, y + 18,
          340, rowHeight - 4,
          0xffffff, 0.001,
        ).setInteractive({ useHandCursor: true }).setDepth(2);
        titleHit.on("pointerup", () => this.selectSlot(slotIndex));

        // Time
        this.add.text(panelX + 400, y + 10, formatSlotTime(slot.timestamp), bodyStyle("#d7e3ef", 14)).setDepth(1);

        // Mode badge
        const modeLabel = t(`replay.mode_${slot.mode}` as any) ?? slot.mode;
        this.add.text(panelX + 600, y + 10, modeLabel, bodyStyle("#5c7185", 12)).setDepth(1);

        // Save As text link
        const saveLink = this.add.text(panelX + 710, y + 10, t("replay.save_as"), bodyStyle("#26c6da", 14))
          .setInteractive({ useHandCursor: true }).setDepth(2);
        saveLink.on("pointerover", () => saveLink.setColor("#80e5f0"));
        saveLink.on("pointerout", () => saveLink.setColor("#26c6da"));
        saveLink.on("pointerup", () => this.handleSaveAs(slotIndex));

        // Info text link
        const infoLink = this.add.text(panelX + 810, y + 10, t("replay.info"), bodyStyle("#5c7185", 14))
          .setInteractive({ useHandCursor: true }).setDepth(2);
        infoLink.on("pointerover", () => infoLink.setColor("#b7c7d8"));
        infoLink.on("pointerout", () => infoLink.setColor("#5c7185"));
        infoLink.on("pointerup", () => this.showInfoDialog(slotIndex));
      } else {
        // Empty slot
        this.add.text(panelX + 45, y + 10, "-", bodyStyle("#34475c", 18)).setDepth(1);
      }
    }

    // Pagination — bottom-right corner
    const pageCount = getPageCount();
    if (pageCount > 1) {
      const pagY = panelY + SLOTS_PER_PAGE * rowHeight + 40;
      if (this.currentPage > 0) {
        createRectangleButton(
          this, 980, pagY, 80, 26,
          t("replay.prev_page"),
          () => { this.currentPage = Math.max(0, this.currentPage - 1); this.renderPage(); },
          { accent: 0x5c7185 },
        );
      }
      this.add.text(1080, pagY + 8, t("replay.page", { page: this.currentPage + 1, total: pageCount }), bodyStyle("#b7c7d8", 14))
        .setOrigin(0.5).setDepth(1);
      if (this.currentPage < pageCount - 1) {
        createRectangleButton(
          this, 1180, pagY, 80, 26,
          t("replay.next_page"),
          () => { this.currentPage = Math.min(pageCount - 1, this.currentPage + 1); this.renderPage(); },
          { accent: 0x5c7185 },
        );
      }
    }

    // Bottom-left buttons — same Y as pagination
    const btnY = panelY + SLOTS_PER_PAGE * rowHeight + 40;
    // "Import Local Replay" — available in browser
    if (!IS_DESKTOP_APP) {
      createRectangleButton(
        this, 160, btnY, 150, 26,
        t("replay.import_local_replay"),
        () => this.handleImportLocalReplay(),
        { accent: 0x26c6da },
      );
    }
    // "Open Replay Folder" — desktop only
    if (IS_DESKTOP_APP) {
      createRectangleButton(
        this, 160, btnY, 150, 26,
        t("replay.open_replay_folder"),
        () => this.handleOpenReplayFolder(),
        { accent: 0x5c7185 },
      );
    }
  }

  // ── Slot actions ────────────────────────────────────────────────────

  private async selectSlot(slotIndex: number): Promise<void> {
    const replay = await loadReplay(slotIndex);
    if (!replay) return;

    if (replay.mode === "story") {
      // Story mode: show stage selection in an info-like dialog
      this.showStageListDialog(replay);
    } else {
      this.startPlayback(replay, 0);
    }
  }

  private async handleSaveAs(slotIndex: number): Promise<void> {
    const replay = await loadReplay(slotIndex);
    if (!replay) return;

    if (IS_DESKTOP_APP) {
      await desktopSaveAs(slotIndex);
    } else {
      await downloadReplay(slotIndex);
    }
  }

  // ── Info dialog ─────────────────────────────────────────────────────

  private async showInfoDialog(slotIndex: number): Promise<void> {
    const replay = await loadReplay(slotIndex);
    if (!replay) return;

    if (replay.mode === "story") {
      this.showFullInfoDialog(replay, true);
    } else {
      this.showFullInfoDialog(replay, false);
    }
  }

  private showFullInfoDialog(replay: ReplayFile, showStageTabs: boolean): void {
    this.closeDialog();

    const layer = this.add.container(0, 0).setDepth(100);

    // Veil — close only on veil hit
    const veil = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7).setInteractive();
    veil.on("pointerup", () => this.closeDialog());
    layer.add(veil);

    // Dialog panel
    const dlgW = 720;
    const dlgH = showStageTabs ? 540 : 460;
    const dlgX = (1280 - dlgW) / 2;
    const dlgY = (720 - dlgH) / 2;
    const cx = 640; // center X

    const panel = this.add.graphics();
    panel.fillStyle(0x101820, 0.96);
    panel.fillRoundedRect(dlgX, dlgY, dlgW, dlgH, 8);
    panel.lineStyle(2, 0xffcf6e, 0.8);
    panel.strokeRoundedRect(dlgX, dlgY, dlgW, dlgH, 8);
    layer.add(panel);

    // Blocker on panel area
    const blocker = this.add.rectangle(cx, dlgY + dlgH / 2, dlgW, dlgH, 0xffffff, 0.001)
      .setInteractive();
    layer.add(blocker);

    // Title
    const titleText = this.add.text(cx, dlgY + 28, t("replay.info_title"), headingStyle(24))
      .setOrigin(0.5);
    layer.add(titleText);

    // Close button (X)
    const closeBtn = createRectangleButton(this, dlgX + dlgW - 50, dlgY + 18, 36, 30, "✕", () => this.closeDialog(), { accent: 0x5c7185 });
    layer.add(closeBtn.container);

    // ── Content lines ──────────────────────────────────────────────────
    const contentX = dlgX + 28;
    let ly = dlgY + 60;
    const lineH = 22;

    // Title
    this.addDialogText(layer, contentX, ly, `${t("replay.col_title")}: ${replay.title}`, "#f6f1e6", 16);
    ly += lineH + 4;

    // Mode & Time on same row
    const modeLabel = t(`replay.mode_${replay.mode}` as any) ?? replay.mode;
    this.addDialogText(layer, contentX, ly, `${t("replay.col_mode")}: ${modeLabel}    ${t("replay.col_time")}: ${formatSlotTime(replay.timestamp)}`, "#b7c7d8", 14);
    ly += lineH + 4;

    // ── Stage selector (story mode) ──────────────────────────────────────
    if (showStageTabs) {
      ly += 4;
      ly = this.drawStoryStageSelector(layer, contentX, ly, dlgW, replay);
      ly += 10;
    }

    // ── Loadout details (non-story only — story shows loadouts per stage) ─
    if (!showStageTabs) {
      ly = this.drawLoadoutInfo(layer, contentX, ly, replay.loadouts);
    }

    // ── Separator & battle list (non-story only) ───────────────────────
    if (!showStageTabs) {
      ly += 6;
      const sep = this.add.graphics();
      sep.lineStyle(1, 0x34475c, 0.5);
      sep.lineBetween(contentX, ly, dlgX + dlgW - 28, ly);
      layer.add(sep);
      ly += 10;

      for (let bi = 0; bi < replay.battles.length; bi += 1) {
        const battle = replay.battles[bi];
        const stageName = battle.stageTitle ?? `${t("replay.stage")} ${(battle.stageIndex ?? bi) + 1}`;
        const duration = formatBattleDuration(battle.inputs.length);
        const lineContent = `${bi + 1}. ${stageName} — ${duration}`;

        const isNextTooLow = ly + 30 > dlgY + dlgH - 50;

        if (isNextTooLow) {
          const remaining = replay.battles.length - bi;
          this.addDialogText(layer, contentX, ly, `… ${t("replay.battles", { count: remaining })}`, "#5c7185", 13);
          break;
        }

        this.addDialogText(layer, contentX, ly, lineContent, "#d7e3ef", 14);
        ly += 24;
      }
    }

    // Close button at bottom
    const closeBottomBtn = createFightButton(this, cx, dlgY + dlgH - 48, 140, 38, t("replay.close"), () => this.closeDialog(), { accent: 0x5c7185 });
    layer.add(closeBottomBtn.container);

    this.dialog = { layer, cleanup: () => this.closeDialog() };
  }

  private drawLoadoutInfo(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    loadouts: BattleLoadouts,
  ): number {
    const lineH = 20;

    // Player loadout
    this.addDialogText(layer, x, y, `【${t("replay.player_loadout")}】`, "#ffcf6e", 14);
    y += lineH + 2;

    const ply = loadouts.player;
    y = this.drawFighterLoadout(layer, x + 12, y, ply);

    // Spacer
    y += 4;

    // Opponent loadout
    this.addDialogText(layer, x, y, `【${t("replay.opponent_loadout")}】`, "#ffcf6e", 14);
    y += lineH + 2;

    const opp = loadouts.target;
    y = this.drawFighterLoadout(layer, x + 12, y, opp);

    return y;
  }

  private drawFighterLoadout(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    loadout: FighterLoadout,
  ): number {
    const lineH = 20;

    const priDef = getCharacterDefinition(loadout.primaryCharacterId);
    const altDef = getCharacterDefinition(loadout.alternateCharacterId);
    const priName = priDef?.name ?? loadout.primaryCharacterId;
    const altName = altDef?.name ?? loadout.alternateCharacterId;

    this.addDialogText(layer, x, y, `${t("replay.character", { name: `${priName} / ${altName}` })}`, "#d7e3ef", 14);
    y += lineH;

    const cardIds = loadout.cardIds ?? [];
    if (cardIds.length > 0) {
      const cardNames = cardIds.map((cid) => {
        const def = getAbilityCardDefinition(cid);
        return def?.name ?? cid;
      });
      const cardStr = cardNames.join(", ");
      this.addDialogText(layer, x, y, `${t("replay.card", { name: cardStr })}`, "#b7c7d8", 13);
      y += lineH;
    }

    return y;
  }

  // ── Story stage selector (tabs + info + loadout panel) ─────────────────

  private drawStoryStageSelector(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    dlgW: number,
    replay: ReplayFile,
  ): number {
    const tabH = 26;
    const tabW = 36;
    const tabGap = 6;
    const panelW = dlgW - 56;
    let selectedBi = 0;

    // Section label
    const label = this.add.text(x, y + 7, `${t("replay.select_stage")}:`, bodyStyle("#6e8496", 13));
    layer.add(label);

    // Build stage tab buttons
    const tabStartX = x + 90;
    const tabBgs: Phaser.GameObjects.Graphics[] = [];
    const tabTexts: Phaser.GameObjects.Text[] = [];

    const paintTab = (bg: Phaser.GameObjects.Graphics, tx: number, ty: number, selected: boolean) => {
      bg.clear();
      bg.fillStyle(selected ? 0xffcf6e : 0x1d2b36, selected ? 0.9 : 0.6);
      bg.fillRoundedRect(tx, ty, tabW, tabH, 4);
      if (selected) {
        bg.lineStyle(1, 0xffcf6e, 0.8);
        bg.strokeRoundedRect(tx, ty, tabW, tabH, 4);
      }
    };

    for (let bi = 0; bi < replay.battles.length; bi++) {
      const tx = tabStartX + bi * (tabW + tabGap);
      const ty = y;
      const isSelected = bi === selectedBi;

      const bg = this.add.graphics();
      paintTab(bg, tx, ty, isSelected);
      layer.add(bg);
      tabBgs.push(bg);

      const numText = this.add.text(tx + tabW / 2, ty + tabH / 2, `${bi + 1}`, {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "13px",
        fontStyle: "700",
        color: isSelected ? "#101820" : "#b7c7d8",
      }).setOrigin(0.5);
      layer.add(numText);
      tabTexts.push(numText);

      const hit = this.add.rectangle(tx + tabW / 2, ty + tabH / 2, tabW, tabH, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerup", () => {
        if (selectedBi === bi) return;

        // Deselect old tab
        const oldTx = tabStartX + selectedBi * (tabW + tabGap);
        paintTab(tabBgs[selectedBi], oldTx, y, false);
        tabTexts[selectedBi].setColor("#b7c7d8");

        // Select new tab
        selectedBi = bi;
        paintTab(tabBgs[bi], tx, ty, true);
        tabTexts[bi].setColor("#101820");

        // Update info panel + loadout
        infoContainer.removeAll(true);
        loadoutContainer.removeAll(true);
        renderInfo(bi);
      });
      layer.add(hit);
    }

    // Containers for selected-stage info and loadout
    const infoContainer = this.add.container(0, 0);
    layer.add(infoContainer);
    const loadoutContainer = this.add.container(0, 0);
    layer.add(loadoutContainer);

    y += tabH + 10;

    const renderInfo = (bi: number): void => {
      const battle = replay.battles[bi];
      const stageName = battle.stageTitle ?? `${t("replay.stage")} ${(battle.stageIndex ?? bi) + 1}`;
      const totalSecs = Math.round(battle.inputs.length / 60);

      // Info panel background
      const bg = this.add.graphics();
      bg.fillStyle(0x0b1118, 0.75);
      bg.fillRoundedRect(x, y, panelW, 66, 6);
      bg.lineStyle(1, 0xffcf6e, 0.3);
      bg.strokeRoundedRect(x, y, panelW, 66, 6);
      infoContainer.add(bg);

      // Stage title
      const titleText = this.add.text(x + 12, y + 8, stageName, bodyStyle("#ffcf6e", 15));
      infoContainer.add(titleText);

      // Info line: duration + map
      const mapStr = battle.mapId ? `  |  ${t("replay.map", { id: battle.mapId })}` : "";
      const infoLine = this.add.text(x + 12, y + 30,
        `${t("replay.duration", { seconds: totalSecs })}${mapStr}`,
        bodyStyle("#b7c7d8", 13));
      infoContainer.add(infoLine);

      // Player names
      const playerText = this.add.text(x + 12, y + 48,
        `${battle.playerName} vs ${battle.opponentName}`,
        bodyStyle("#d7e3ef", 13));
      infoContainer.add(playerText);

      // ── Loadout per stage ────────────────────────────────────────
      const lo = battle.loadouts ?? replay.loadouts;
      const ly = y + 74;

      const priCharDef = getCharacterDefinition(lo.player.primaryCharacterId);
      const altCharDef = getCharacterDefinition(lo.player.alternateCharacterId);
      const priName = priCharDef?.name ?? lo.player.primaryCharacterId;
      const altName = altCharDef?.name ?? lo.player.alternateCharacterId;

      const oppPriDef = getCharacterDefinition(lo.target.primaryCharacterId);
      const oppAltDef = getCharacterDefinition(lo.target.alternateCharacterId);
      const oppPriName = oppPriDef?.name ?? lo.target.primaryCharacterId;
      const oppAltName = oppAltDef?.name ?? lo.target.alternateCharacterId;

      // Player
      const playerLoadoutLabel = this.add.text(x, ly + 6,
        `【${t("replay.player_loadout")}】 ${priName} / ${altName}`,
        bodyStyle("#ffcf6e", 13));
      loadoutContainer.add(playerLoadoutLabel);

      const playerCards = (lo.player.cardIds ?? []).map((cid) => {
        const def = getAbilityCardDefinition(cid);
        return def?.name ?? cid;
      });
      if (playerCards.length > 0) {
        const cardText = this.add.text(x, ly + 26,
          `${t("replay.card", { name: playerCards.join(", ") })}`,
          bodyStyle("#b7c7d8", 12));
        loadoutContainer.add(cardText);
      }

      // Opponent
      const oppLoadoutLabel = this.add.text(x, ly + 44,
        `【${t("replay.opponent_loadout")}】 ${oppPriName} / ${oppAltName}`,
        bodyStyle("#ffcf6e", 13));
      loadoutContainer.add(oppLoadoutLabel);

      const oppCards = (lo.target.cardIds ?? []).map((cid) => {
        const def = getAbilityCardDefinition(cid);
        return def?.name ?? cid;
      });
      if (oppCards.length > 0) {
        const cardText = this.add.text(x, ly + 64,
          `${t("replay.card", { name: oppCards.join(", ") })}`,
          bodyStyle("#b7c7d8", 12));
        loadoutContainer.add(cardText);
      }
    };

    renderInfo(0);

    return y + 164; // panel 66 + gap 8 + loadout section 82 + gap 8
  }

  private addDialogText(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    content: string,
    color: string,
    size: number,
  ): Phaser.GameObjects.Text {
    const txt = this.add.text(x, y, content, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: `${size}px`,
      color,
    });
    layer.add(txt);
    return txt;
  }

  // ── Stage list dialog (story mode, shown on title click) ────────────

  private showStageListDialog(replay: ReplayFile): void {
    this.closeDialog();

    const layer = this.add.container(0, 0).setDepth(100);
    const veil = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7).setInteractive();
    veil.on("pointerup", () => this.closeDialog());
    layer.add(veil);

    // Dialog panel
    const dlgW = 560;
    const dlgH = Math.min(480, 80 + replay.battles.length * 50);
    const dlgX = (1280 - dlgW) / 2;
    const dlgY = (720 - dlgH) / 2;
    const cx = 640;

    const panel = this.add.graphics();
    panel.fillStyle(0x101820, 0.96);
    panel.fillRoundedRect(dlgX, dlgY, dlgW, dlgH, 8);
    panel.lineStyle(2, 0xffcf6e, 0.8);
    panel.strokeRoundedRect(dlgX, dlgY, dlgW, dlgH, 8);
    layer.add(panel);

    const blocker = this.add.rectangle(cx, dlgY + dlgH / 2, dlgW, dlgH, 0xffffff, 0.001)
      .setInteractive();
    layer.add(blocker);

    // Title
    const titleText = this.add.text(cx, dlgY + 28, t("replay.select_stage"), headingStyle(22))
      .setOrigin(0.5);
    layer.add(titleText);

    // Close X
    const closeBtn = createRectangleButton(this, dlgX + dlgW - 50, dlgY + 18, 36, 30, "✕", () => this.closeDialog(), { accent: 0x5c7185 });
    layer.add(closeBtn.container);

    // Stage list
    const startY = dlgY + 64;
    const rowH = 44;
    for (let i = 0; i < replay.battles.length; i += 1) {
      const battle = replay.battles[i];
      const by = startY + i * rowH;
      const stageTitle = battle.stageTitle ?? `${t("replay.stage")} ${(battle.stageIndex ?? i) + 1}`;
      const duration = formatBattleDuration(battle.inputs.length);

      const bg = this.add.graphics();
      bg.fillStyle(0x0b1118, 0.8);
      bg.fillRoundedRect(dlgX + 20, by, dlgW - 40, rowH - 4, 4);
      bg.lineStyle(1, 0x34475c, 0.6);
      bg.strokeRoundedRect(dlgX + 20, by, dlgW - 40, rowH - 4, 4);
      layer.add(bg);

      const label = this.add.text(dlgX + 34, by + 12, `${i + 1}. ${stageTitle} — ${duration}`, bodyStyle("#f6f1e6", 15));
      layer.add(label);

      const playArrow = this.add.text(dlgX + dlgW - 44, by + 12, "▶", bodyStyle("#ffcf6e", 16));
      layer.add(playArrow);

      const hit = this.add.rectangle(dlgX + dlgW / 2, by + rowH / 2 - 2, dlgW - 40, rowH - 4, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerup", () => {
        this.closeDialog();
        this.startPlayback(replay, i);
      });
      layer.add(hit);
    }

    this.dialog = { layer, cleanup: () => this.closeDialog() };
  }

  // ── Playback ────────────────────────────────────────────────────────

  private startPlayback(replay: ReplayFile, battleIndex: number): void {
    const battle = replay.battles[battleIndex];
    if (!battle || battle.inputs.length === 0) return;

    // Use per-battle loadouts (story mode) or fall back to the replay-level ones
    const loadouts = battle.loadouts ?? replay.loadouts;

    this.scene.start("loading", {
      mode: "ai",
      loadouts,
      mapId: battle.mapId as import("@repo/types").MapId | undefined,
      playerName: battle.playerName,
      opponentName: battle.opponentName,
      replayData: {
        inputs: battle.inputs,
        speed: 1,
        loadouts,
        mapId: battle.mapId,
        exitScene: "replay-playback",
      },
    } as import("../menu/shared").LoadingData);
  }

  private closeDialog(): void {
    this.dialog?.layer.destroy(true);
    this.dialog = undefined;
  }

  // ── Import local replay (browser) ────────────────────────────────────

  private handleImportLocalReplay(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.gz,.json.gz";
    input.style.display = "none";
    document.body.appendChild(input);

    input.addEventListener("change", async () => {
      document.body.removeChild(input);
      const file = input.files?.[0];
      if (!file) return;

      try {
        const data = await replayFileToJson(file);
        const replay = validateReplayJson(data);
        if (!replay) {
          this.showMessageDialog(t("replay.import_invalid") || "无效的回放文件");
          return;
        }

        // Navigate to the record scene so the user can pick a slot and save
        this.scene.start("replay-record", {
          replay,
          returnScene: "replay-playback",
        });
      } catch {
        this.showMessageDialog(t("replay.import_invalid") || "无效的回放文件");
      }
    });

    input.click();
  }

  private showMessageDialog(message: string): void {
    this.closeDialog();

    const layer = this.add.container(0, 0).setDepth(100);

    const veil = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setInteractive();
    veil.on("pointerup", () => layer.destroy(true));
    layer.add(veil);

    const dlgW = 420;
    const dlgH = 160;
    const dlgX = (1280 - dlgW) / 2;
    const dlgY = (720 - dlgH) / 2;

    const panel = this.add.graphics();
    panel.fillStyle(0x101820, 0.96);
    panel.fillRoundedRect(dlgX, dlgY, dlgW, dlgH, 8);
    panel.lineStyle(2, 0xffcf6e, 0.8);
    panel.strokeRoundedRect(dlgX, dlgY, dlgW, dlgH, 8);
    layer.add(panel);

    const msgText = this.add.text(640, dlgY + 55, message, {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#f6f1e6",
      wordWrap: { width: dlgW - 40 },
      align: "center",
    }).setOrigin(0.5);
    layer.add(msgText);

    const okBtn = createFightButton(this, 640, dlgY + dlgH - 40, 100, 32, t("replay.close"), () => {
      layer.destroy(true);
    }, { accent: 0x5c7185 });
    layer.add(okBtn.container);

    this.dialog = { layer, cleanup: () => layer.destroy(true) };
  }

  // ── Open replay folder (desktop) ─────────────────────────────────────

  private async handleOpenReplayFolder(): Promise<void> {
    try {
      await desktopOpenReplayFolder();
    } catch (e) {
      this.showMessageDialog(`无法打开回放文件夹: ${e}`);
    }
  }
}
