import Phaser from "phaser";
import {
  createRaidLogicRuntime,
  type RaidLogicRuntime,
} from "@repo/raid-logic";
import type {
  BattleOutputFrame,
  BattleOutputState,
  FighterState,
} from "@repo/types";
import { FIXED_STEP_MS, GAME_WIDTH } from "@repo/constants";
import {
  createBattleInput,
  type BattleInputBundle,
} from "../battle/input-controller/input";
import type { BattleKeyMap } from "../battle/input-controller";
import type { BattleMobileControls } from "../battle/input-controller";
import { BattleView } from "../battle/view";
import { createBattleViewModel } from "../battle/view/model";
import { resolveArenaBounds } from "../battle/utils/battle-helpers";
import { BattlePauseMenuController } from "../battle/view/pause";
import { BattleAudioDirector } from "../battle/sfx/audio";
import { Depth } from "../utils/depth";
import type { BattleSceneData } from "../battle/loadout";
import type { ReplayFile } from "./types";
import { FONT } from "../menu/ui/constants";
import type { BattleBgmBridge } from "../sound";
import { cardName } from "../menu/shared";

// ---------------------------------------------------------------------------
// Player info overlay panel
// ---------------------------------------------------------------------------

interface PanelState {
  readonly container: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Graphics;
  readonly lines: Phaser.GameObjects.Text[];
  readonly hoverHit: Phaser.GameObjects.Rectangle;
  hovered: boolean;
}

function createInfoPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
): PanelState {
  const panelWidth = 220;
  const panelHeight = 130;
  const padding = 8;
  const lineHeight = 20;

  const container = scene.add.container(x, y).setDepth(Depth.Tooltip);

  const bg = scene.add.graphics();
  bg.fillStyle(0x0b1118, 1);
  bg.fillRoundedRect(0, 0, panelWidth, panelHeight, 6);
  bg.lineStyle(1, 0x34475c, 0.72);
  bg.strokeRoundedRect(0, 0, panelWidth, panelHeight, 6);
  container.add(bg);

  const lines: Phaser.GameObjects.Text[] = [];
  for (let i = 0; i < 6; i += 1) {
    const t = scene.add.text(padding, padding + i * lineHeight, "", {
      fontFamily: FONT,
      fontSize: "13px",
      color: "#d7e3ef",
    });
    container.add(t);
    lines.push(t);
  }

  // Interactive hit area for hover detection
  const hoverHit = scene.add
    .rectangle(
      panelWidth / 2,
      panelHeight / 2,
      panelWidth,
      panelHeight,
      0xffffff,
      0.001,
    )
    .setInteractive({ useHandCursor: false });
  container.add(hoverHit);

  const state: PanelState = { container, bg, lines, hoverHit, hovered: false };

  hoverHit.on("pointerover", () => {
    state.hovered = true;
    container.setAlpha(1);
  });
  hoverHit.on("pointerout", () => {
    state.hovered = false;
    container.setAlpha(0.2);
  });

  // Start at 20 % opacity
  container.setAlpha(0.2);

  return state;
}

function updateInfoPanel(
  panel: PanelState,
  state: BattleOutputState,
  fighter: FighterState,
  playerName: string,
): void {
  const reloading = fighter.reloadRemaining > 0;
  const ammoStr = `${fighter.ammo} / ${fighter.ammoCapacity}`;
  const reloadStr = reloading ? " [Reloading]" : "";

  // Line 0: player name
  panel.lines[0].setText(playerName);

  // Line 1: lives & bombs
  panel.lines[1].setText(
    `❤ ${Math.max(0, fighter.lives)}    \u{1F4A3} ${fighter.bombs}`,
  );

  // Line 2: ammo
  panel.lines[2].setText(`Ammo: ${ammoStr}${reloadStr}`);

  // Line 3: active card info
  if (fighter.activeCard) {
    const uses = fighter.activeCardUses;
    const limit = fighter.activeCard.useLimit;
    const limitStr = limit === "infinite" ? "∞" : `${limit}`;
    panel.lines[3].setText(
      `Card: ${cardName(fighter.activeCard)} (${uses}/${limitStr})`,
    );
  } else {
    panel.lines[3].setText("Card: ---");
  }

  // Line 4: cooldown
  const remainingFrames = Math.max(
    0,
    fighter.activeCardCooldownUntil - state.frame,
  );
  const cooldownTotal = fighter.activeCard?.cooldownTicks ?? 0;
  if (remainingFrames > 0 && cooldownTotal > 0) {
    const remainingSec = (remainingFrames / 60).toFixed(1);
    const totalSec = (cooldownTotal / 60).toFixed(1);
    panel.lines[4].setText(`CD: ${remainingSec}s / ${totalSec}s`);
  } else {
    panel.lines[4].setText("");
  }

  // Line 5: empty
  panel.lines[5].setText("");
}

function destroyInfoPanel(panel: PanelState): void {
  panel.container.destroy(true);
}

// ---------------------------------------------------------------------------
// ReplayBattleOverride  —  middleware that intercepts battle-scene logic
// ---------------------------------------------------------------------------

export interface ReplayBattleDeps {
  readonly keys: BattleKeyMap;
  readonly mobileControls?: BattleMobileControls;
  readonly bgmBridge?: BattleBgmBridge;
}

export class ReplayBattleOverride {
  // Replay state
  private accumulator = 0;
  private currentOutput!: BattleOutputFrame;
  private lastInput!: BattleInputBundle;
  private logicReady = false;
  private runtime: RaidLogicRuntime;
  private view!: BattleView;
  private replayCurrentFrame = 0;
  private replaySpeed: number;
  private replayFrames: ReplayFile["battles"][number]["inputs"];
  private exitScene: string;
  private resultScheduled = false;

  // UI
  private pauseMenu: BattlePauseMenuController;
  private readonly audioDirector = new BattleAudioDirector();
  private player1Panel: PanelState;
  private player2Panel: PanelState;

  // Names
  private playerName: string;
  private opponentName: string;

  // Stored for scene restart
  private initialData: BattleSceneData;

  constructor(
    private readonly scene: Phaser.Scene,
    data: BattleSceneData,
    deps: ReplayBattleDeps,
  ) {
    const replayData = data.replayData!;
    this.replaySpeed = replayData.speed;
    this.replayFrames = replayData.inputs;
    this.exitScene = replayData.exitScene ?? "replay-playback";
    this.playerName = data.playerName ?? "Player";
    this.opponentName = data.opponentName ?? "Opponent";
    this.initialData = data;

    // --- Runtime ---
    // Always create a fresh runtime for replay playback. The loading scene
    // may have created a runtime with "ai" mode, but replay needs "online"
    // mode to step both player and target inputs simultaneously.
    this.runtime = createRaidLogicRuntime({
      mode: "online",
      loadouts: replayData.loadouts,
      mapId: replayData.mapId,
      playerInitPoint: replayData.playerInitPoint,
      opponentInitPoint: replayData.opponentInitPoint,
    });
    this.logicReady = false;
    this.runtime.initialize().then(() => {
      if (!this.scene.scene.isActive()) return;
      this.logicReady = true;
    });

    // --- View ---
    this.view = new BattleView(
      this.scene,
      "ai",
      replayData.mapId as import("@repo/types").MapId | undefined,
    );

    // --- Input (used for pointer position during render) ---
    this.lastInput = createBattleInput(
      this.scene,
      deps.keys,
      deps.mobileControls,
    );

    // --- Pause menu ---
    this.pauseMenu = new BattlePauseMenuController(this.scene, {
      restartEnabled: true,
      canOpen: () => !this.resultScheduled,
      onPauseOpened: () => {
        this.accumulator = 0;
        deps.bgmBridge?.pause();
      },
      onResumed: () => deps.bgmBridge?.resume(),
      onRestart: () => this.restart(),
      onMainMenu: () => this.exitToMenu(),
      replaySpeed: this.replaySpeed,
      getReplaySpeed: () => this.replaySpeed,
      onSpeedChange: (speed) => {
        this.replaySpeed = speed;
      },
    });

    // --- Info panels (top-left and top-right) ---
    this.player1Panel = createInfoPanel(this.scene, 10, 10);
    this.player2Panel = createInfoPanel(this.scene, GAME_WIDTH - 230, 10);

    // Register shutdown
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Called every frame from BattleScene.update(). */
  update(delta: number): void {
    if (this.pauseMenu.isPaused()) {
      this.pauseMenu.update(delta);
      return;
    }

    this.accumulator += delta;
    const stepCount = Math.max(1, Math.round(this.replaySpeed));

    while (this.accumulator >= FIXED_STEP_MS) {
      if (
        this.logicReady &&
        this.replayCurrentFrame < this.replayFrames.length
      ) {
        for (
          let s = 0;
          s < stepCount && this.replayCurrentFrame < this.replayFrames.length;
          s += 1
        ) {
          const frame = this.replayFrames[this.replayCurrentFrame];
          if (!frame) break;
          this.runtime.step({
            mode: "online",
            player: frame.player1,
            target: frame.player2,
          });
          this.drainOutput();
          this.replayCurrentFrame += 1;
        }
      } else if (
        this.replayCurrentFrame >= this.replayFrames.length &&
        this.logicReady
      ) {
        // Replay finished — schedule exit
        if (!this.resultScheduled) {
          this.resultScheduled = true;
          this.scene.time.delayedCall(1200, () => this.exitToMenu());
        }
      }

      this.accumulator -= FIXED_STEP_MS;
    }

    // Render with overrides
    this.renderFrame();
  }

  getExitScene(): string {
    return this.exitScene;
  }

  destroy(): void {
    this.pauseMenu.destroy();
    destroyInfoPanel(this.player1Panel);
    destroyInfoPanel(this.player2Panel);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private restart(): void {
    if (!this.replayFrames.length) return;
    // Full scene restart — override is auto-destroyed, new one created in create()
    this.scene.scene.start("battle", {
      ...this.initialData,
      replayData: {
        inputs: this.replayFrames,
        speed: this.replaySpeed,
        loadouts: this.initialData.replayData?.loadouts ?? {
          player: {
            primaryCharacterId: "reimu",
            alternateCharacterId: "marisa",
          },
          target: {
            primaryCharacterId: "sakuya",
            alternateCharacterId: "cirno",
          },
        },
        mapId: this.initialData.replayData?.mapId,
        playerInitPoint: this.initialData.replayData?.playerInitPoint,
        opponentInitPoint: this.initialData.replayData?.opponentInitPoint,
        exitScene: this.exitScene,
      },
    } satisfies BattleSceneData);
  }

  private exitToMenu(): void {
    this.scene.scene.start(this.exitScene);
  }

  private drainOutput(): void {
    const outputs = this.runtime.outputQueue.drainAll();
    for (const output of outputs) {
      this.currentOutput = output;
      this.audioDirector.sync(output.state, {
        eventTypes: output.events.map((event) => event.type),
      });
    }
  }

  private renderFrame(): void {
    if (!this.currentOutput) return;

    // 1. Render the normal view
    this.view.render(
      createBattleViewModel({
        state: this.currentOutput.state,
        input: this.lastInput,
        localFighterKey: "Player1",
        arenaBounds: resolveArenaBounds(this.initialData.replayData?.mapId),
        alpha: this.accumulator / FIXED_STEP_MS,
      }),
    );

    // 2. Hide crosshair
    this.hideCrosshair();

    // 3. Force all projectiles to full opacity
    this.forceFullBulletOpacity();

    // 4. Update info panels
    this.updatePanels(this.currentOutput.state);
  }

  private hideCrosshair(): void {
    this.scene.children.each((child) => {
      if (
        "depth" in child &&
        (child.depth === Depth.Crosshair ||
          child.depth === Depth.CrosshairFill ||
          child.depth === Depth.CrosshairText) &&
        "setVisible" in child
      ) {
        (child as { setVisible(visible: boolean): unknown }).setVisible(false);
      }
    });
  }

  private forceFullBulletOpacity(): void {
    this.scene.children.each((child) => {
      if (
        "depth" in child &&
        child.depth === Depth.Projectile &&
        "setAlpha" in child
      ) {
        (child as Phaser.GameObjects.Image).setAlpha(1);
      }
    });
  }

  private updatePanels(state: BattleOutputState): void {
    updateInfoPanel(this.player1Panel, state, state.player, this.playerName);
    updateInfoPanel(this.player2Panel, state, state.target, this.opponentName);
  }
}
