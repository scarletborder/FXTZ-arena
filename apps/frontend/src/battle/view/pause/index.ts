import Phaser from "phaser";
import { t } from "@repo/i18n";

import AudioCmd from "../../../commands/AudioCmd";
import { Depth } from "../../../utils/depth";

const RESTART_HOLD_MS = 1100;
const MENU_WIDTH = 360;
const MENU_BUTTON_HEIGHT = 48;
const MENU_LEFT_MARGIN = 32;
const MENU_BOTTOM_MARGIN = 64;
const RESTART_KEY_RADIUS = 15;

type PauseConfirmAction = "mainMenu" | "restart";

interface PauseMenuButton {
  readonly key: "resume" | "mainMenu" | "restart";
  readonly container: Phaser.GameObjects.Container;
  readonly label: Phaser.GameObjects.Text;
  readonly progressRing?: Phaser.GameObjects.Graphics;
  readonly enabled: boolean;
}

interface PauseMenuState {
  readonly layer: Phaser.GameObjects.Container;
  readonly buttons: readonly PauseMenuButton[];
  readonly rKey: Phaser.Input.Keyboard.Key;
  confirmLayer?: Phaser.GameObjects.Container;
  confirmAction?: PauseConfirmAction;
  restartHoldMs: number;
  restartTriggered: boolean;
}

export interface BattlePauseMenuOptions {
  readonly restartEnabled: boolean;
  readonly onPauseOpened: () => void;
  readonly onResumed: () => void;
  readonly onRestart: () => void;
  readonly onMainMenu: () => void;
  readonly canOpen?: () => boolean;
  /** Replay playback speed (0.5, 1, 2, 4, 8). When set, show replay-specific menu. */
  readonly replaySpeed?: number;
  /** Called when user toggles playback speed. */
  readonly onSpeedChange?: (speed: number) => void;
}

export class BattlePauseMenuController {
  private menu: PauseMenuState | undefined;
  private paused = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: BattlePauseMenuOptions,
  ) {
    this.installInput();
  }

  isPaused(): boolean {
    return this.paused;
  }

  update(delta: number): void {
    const menu = this.menu;
    if (!this.paused || !menu || menu.confirmLayer || !this.options.restartEnabled) {
      if (menu) {
        this.setRestartHoldProgress(menu, 0);
      }
      return;
    }

    if (menu.rKey.isDown) {
      menu.restartHoldMs = Math.min(RESTART_HOLD_MS, menu.restartHoldMs + delta);
      this.setRestartHoldProgress(menu, menu.restartHoldMs / RESTART_HOLD_MS);
      if (menu.restartHoldMs >= RESTART_HOLD_MS && !menu.restartTriggered) {
        menu.restartTriggered = true;
        this.options.onRestart();
      }
      return;
    }

    menu.restartHoldMs = 0;
    menu.restartTriggered = false;
    this.setRestartHoldProgress(menu, 0);
  }

  destroy(): void {
    this.destroyMenu();
  }

  private installInput(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) {
      return;
    }
    keyboard.addCapture("ESC,R");
    keyboard.on("keydown-ESC", this.handleEscape, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.off("keydown-ESC", this.handleEscape, this);
    });
  }

  private handleEscape(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.options.canOpen && !this.options.canOpen()) {
      return;
    }
    if (this.menu?.confirmLayer) {
      this.closeConfirm();
      return;
    }
    if (this.paused) {
      this.resume();
      return;
    }
    this.open();
  }

  private open(): void {
    if (this.paused) {
      return;
    }
    this.paused = true;
    this.scene.input.setDefaultCursor("auto");
    AudioCmd.Play("se_pause");
    AudioCmd.Reset();
    this.options.onPauseOpened();
    this.menu = this.createMenu();
  }

  private resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.destroyMenu();
    this.scene.input.setDefaultCursor("none");
    this.options.onResumed();
  }

  private createMenu(): PauseMenuState {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const layer = this.scene.add.container(0, 0).setDepth(Depth.Tooltip + 50);
    const veil = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.58)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive();
    layer.add(veil);

    const menuCenterX = MENU_LEFT_MARGIN + MENU_WIDTH / 2;
    const menuCenterY = Math.max(220, height - MENU_BOTTOM_MARGIN - MENU_BUTTON_HEIGHT / 2 - 64);

    const isReplay = this.options.replaySpeed !== undefined;
    const title = this.scene.add
      .text(menuCenterX, menuCenterY - 138, isReplay ? t("pause.replay_title") : t("pause.title"), {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "30px",
        fontStyle: "900",
        color: "#f6f1e6",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    layer.add(title);
    const titleLine = this.scene.add
      .rectangle(menuCenterX, menuCenterY - 106, 220, 2, 0xf6f1e6, 0.28)
      .setOrigin(0.5)
      .setScrollFactor(0);
    layer.add(titleLine);

    const buttons: PauseMenuButton[] = [];

    if (isReplay) {
      buttons.push(
        this.createMenuButton(layer, menuCenterX, menuCenterY - 64, t("pause.resume"), true, () => this.resume(), "resume"),
        this.createMenuButton(layer, menuCenterX, menuCenterY, t("pause.exit_replay"), true, () => this.options.onMainMenu(), "mainMenu"),
        this.createMenuButton(layer, menuCenterX, menuCenterY + 64, t("pause.restart"), true, () => this.openConfirm("restart"), "restart"),
      );
      const speedLabel = `${t("pause.speed")} ${this.options.replaySpeed}x`;
      buttons.push(
        this.createMenuButton(layer, menuCenterX, menuCenterY + 128, speedLabel, true, () => this.cycleSpeed(), "restart"),
      );
    } else {
      buttons.push(
        this.createMenuButton(layer, menuCenterX, menuCenterY - 64, t("pause.resume"), true, () => this.resume(), "resume"),
        this.createMenuButton(layer, menuCenterX, menuCenterY, t("pause.main_menu"), true, () => this.openConfirm("mainMenu"), "mainMenu"),
        this.createMenuButton(
          layer,
          menuCenterX,
          menuCenterY + 64,
          t("pause.restart"),
          this.options.restartEnabled,
          () => this.openConfirm("restart"),
          "restart",
        ),
      );
    }

    this.setRestartHoldProgress({ buttons }, 0);

    return {
      layer,
      buttons,
      rKey: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R, true, false),
      restartHoldMs: 0,
      restartTriggered: false,
    };
  }

  private cycleSpeed(): void {
    const current = this.options.replaySpeed ?? 1;
    const speeds = [0.5, 1, 2, 4, 8];
    const idx = speeds.indexOf(current);
    const next = speeds[(idx + 1) % speeds.length];
    this.options.onSpeedChange?.(next);
    // Rebuild menu to show updated speed label
    const oldState = this.menu;
    if (oldState) {
      oldState.layer.destroy(true);
      oldState.confirmLayer?.destroy(true);
    }
    this.menu = this.createMenu();
  }

  private createMenuButton(
    layer: Phaser.GameObjects.Container,
    centerX: number,
    centerY: number,
    text: string,
    enabled: boolean,
    onClick: () => void,
    key: PauseMenuButton["key"],
  ): PauseMenuButton {
    const width = MENU_WIDTH;
    const height = MENU_BUTTON_HEIGHT;
    const container = this.scene.add.container(centerX - width / 2, centerY - height / 2).setScrollFactor(0);
    const hover = this.scene.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0, 0);
    const label = this.scene.add
      .text(width / 2, height / 2, text, {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "24px",
        fontStyle: "900",
        color: enabled ? "#f6f1e6" : "#6e8496",
        align: "center",
      })
      .setOrigin(0.5);
    const restartKeyX = Math.min(width - 34, width / 2 + label.width / 2 + 28);
    const restartKey = key === "restart"
      ? this.scene.add
        .text(restartKeyX, height / 2, "R", {
          fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
          fontSize: "17px",
          fontStyle: "900",
          color: enabled ? "#f6f1e6" : "#6e8496",
        })
        .setOrigin(0.5)
      : undefined;
    const progressRing = key === "restart"
      ? this.scene.add.graphics({ x: restartKeyX, y: height / 2 })
      : undefined;

    container.add(hover);
    container.add(label);
    if (progressRing) {
      container.add(progressRing);
    }
    if (restartKey) {
      container.add(restartKey);
    }

    if (enabled) {
      hover.setInteractive({ useHandCursor: true });
      hover.on("pointerover", () => {
        label.setColor(key === "resume" ? "#ffcf6e" : "#ff5c66");
        hover.setFillStyle(0xffffff, 0.06);
      });
      hover.on("pointerout", () => {
        label.setColor("#f6f1e6");
        hover.setFillStyle(0xffffff, 0);
      });
      hover.on("pointerup", onClick);
    }

    layer.add(container);
    return { key, container, label, progressRing, enabled };
  }

  private setRestartHoldProgress(menu: Pick<PauseMenuState, "buttons">, progress: number): void {
    const restart = menu.buttons.find((button) => button.key === "restart");
    const ring = restart?.progressRing;
    if (!ring) {
      return;
    }
    const clamped = Phaser.Math.Clamp(progress, 0, 1);
    ring.clear();
    ring.lineStyle(3, restart.enabled ? 0x2c3e50 : 0x1d2b36, 0.92);
    ring.strokeCircle(0, 0, RESTART_KEY_RADIUS);
    if (clamped <= 0 || !restart.enabled) {
      return;
    }
    ring.lineStyle(4, 0xff5c66, 0.96);
    ring.beginPath();
    ring.arc(
      0,
      0,
      RESTART_KEY_RADIUS,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + 360 * clamped),
      false,
    );
    ring.strokePath();
  }

  private openConfirm(action: PauseConfirmAction): void {
    const menu = this.menu;
    if (!menu) {
      return;
    }
    if (action === "restart" && !this.options.restartEnabled) {
      return;
    }
    menu.confirmLayer?.destroy(true);

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const confirmLayer = this.scene.add.container(0, 0).setDepth(Depth.Tooltip + 60);
    const blocker = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.28)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive();
    const message = this.scene.add
      .text(
        width / 2,
        height / 2 - 32,
        action === "mainMenu" ? t("pause.confirm_main_menu") : t("pause.confirm_restart"),
        {
          fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
          fontSize: "22px",
          fontStyle: "900",
          color: "#f6f1e6",
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0);

    confirmLayer.add(blocker);
    confirmLayer.add(message);
    confirmLayer.add(this.createConfirmButton(width / 2 - 86, height / 2 + 32, t("pause.cancel"), "#d7e3ef", () => this.closeConfirm()));
    confirmLayer.add(this.createConfirmButton(width / 2 + 86, height / 2 + 32, t("pause.confirm"), "#ff5c66", () => {
      if (action === "mainMenu") {
        this.options.onMainMenu();
      } else {
        this.options.onRestart();
      }
    }));

    menu.confirmLayer = confirmLayer;
    menu.confirmAction = action;
  }

  private createConfirmButton(
    centerX: number,
    centerY: number,
    text: string,
    color: string,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const width = 132;
    const height = 40;
    const container = this.scene.add.container(centerX - width / 2, centerY - height / 2).setScrollFactor(0);
    const hit = this.scene.add
      .rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    const label = this.scene.add
      .text(width / 2, height / 2, text, {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "20px",
        fontStyle: "900",
        color,
      })
      .setOrigin(0.5);
    hit.on("pointerover", () => hit.setFillStyle(0xffffff, 0.07));
    hit.on("pointerout", () => hit.setFillStyle(0xffffff, 0));
    hit.on("pointerup", onClick);
    container.add([hit, label]);
    return container;
  }

  private closeConfirm(): void {
    const menu = this.menu;
    if (!menu) {
      return;
    }
    menu.confirmLayer?.destroy(true);
    menu.confirmLayer = undefined;
    menu.confirmAction = undefined;
  }

  private destroyMenu(): void {
    this.menu?.layer.destroy(true);
    this.menu?.confirmLayer?.destroy(true);
    this.menu = undefined;
  }
}
