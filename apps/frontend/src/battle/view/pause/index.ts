import Phaser from "phaser";
import { t } from "@repo/i18n";

import AudioCmd from "../../../commands/AudioCmd";
import { Depth } from "../../../utils/depth";
import type { BattleKeyMap } from "../../input-controller";
import type { BattleJoystickController } from "../../input-controller/gamepad";
import type { BattleMobileControls } from "../../input-controller/mobile";

const RESTART_HOLD_MS = 1100;
const MENU_WIDTH = 360;
const MENU_BUTTON_HEIGHT = 48;
const MENU_LEFT_MARGIN = 32;
const MENU_BOTTOM_MARGIN = 64;
const RESTART_KEY_RADIUS = 15;

type PauseConfirmAction = "mainMenu" | "restart";

interface PauseMenuButton {
  readonly key: "resume" | "mainMenu" | "restart" | "speed";
  readonly container: Phaser.GameObjects.Container;
  readonly hover: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly progressRing?: Phaser.GameObjects.Graphics;
  readonly enabled: boolean;
  readonly onSelect: () => void;
}

interface PauseMenuState {
  readonly layer: Phaser.GameObjects.Container;
  readonly buttons: readonly PauseMenuButton[];
  readonly rKey: Phaser.Input.Keyboard.Key;
  confirmLayer?: Phaser.GameObjects.Container;
  confirmAction?: PauseConfirmAction;
  restartHoldMs: number;
  restartTriggered: boolean;
  selectedIndex: number;
  confirmButtons?: readonly PauseConfirmButton[];
  confirmSelectedIndex: number;
}

interface PauseConfirmButton {
  readonly container: Phaser.GameObjects.Container;
  readonly hit: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly onSelect: () => void;
}

export interface BattlePauseMenuOptions {
  readonly restartEnabled: boolean;
  readonly onPauseOpened: () => void;
  readonly onResumed: () => void;
  readonly onRestart: () => void;
  readonly onMainMenu: () => void;
  readonly canOpen?: () => boolean;
  /** Replay playback speed (1, 2, 4, 8). When set, show replay-specific menu. */
  readonly replaySpeed?: number;
  /** Reads the current replay playback speed when the menu is opened. */
  readonly getReplaySpeed?: () => number;
  /** Called when user toggles playback speed. */
  readonly onSpeedChange?: (speed: number) => void;
  /** Spectator menu keeps the battle running and only exposes resume/exit. */
  readonly spectator?: boolean;
  readonly getInputSources?: () => {
    readonly keys: BattleKeyMap;
    readonly mobileControls?: BattleMobileControls;
    readonly joystickControls?: BattleJoystickController;
  } | undefined;
}

const REPLAY_SPEEDS = [1, 2, 4, 8] as const;

export class BattlePauseMenuController {
  private menu: PauseMenuState | undefined;
  private paused = false;
  private lastPauseDown = false;
  private lastUpDown = false;
  private lastDownDown = false;
  private lastConfirmDown = false;

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
    this.updateNavigation();
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
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard.removeCapture("ESC,R");
    });
  }

  private handlePauseInput(): void {
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
    this.refreshSelection();
  }

  private resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.destroyMenu();
    this.scene.input.setDefaultCursor(this.options.spectator ? "auto" : "none");
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
    const isSpectator = this.options.spectator === true;
    const title = this.scene.add
      .text(menuCenterX, menuCenterY - 138, isSpectator ? t("pause.spectator_title") : isReplay ? t("pause.replay_title") : t("pause.title"), {
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

    if (isSpectator) {
      buttons.push(
        this.createMenuButton(layer, menuCenterX, menuCenterY - 32, t("pause.resume"), true, () => this.resume(), "resume"),
        this.createMenuButton(layer, menuCenterX, menuCenterY + 32, t("pause.exit_spectator"), true, () => this.options.onMainMenu(), "mainMenu"),
      );
    } else if (isReplay) {
      let currentSpeed = this.options.getReplaySpeed?.() ?? this.options.replaySpeed ?? 1;
      const speedButton = this.createMenuButton(
        layer,
        menuCenterX,
        menuCenterY + 64,
        t("pause.speed_value", { speed: formatSpeed(currentSpeed) }),
        true,
        () => {
          currentSpeed = nextReplaySpeed(currentSpeed);
          this.options.onSpeedChange?.(currentSpeed);
          speedButton.label.setText(t("pause.speed_value", { speed: formatSpeed(currentSpeed) }));
        },
        "speed",
      );
      buttons.push(
        this.createMenuButton(layer, menuCenterX, menuCenterY - 64, t("pause.resume"), true, () => this.resume(), "resume"),
        this.createMenuButton(layer, menuCenterX, menuCenterY, t("pause.exit_replay"), true, () => this.options.onMainMenu(), "mainMenu"),
        speedButton,
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
      selectedIndex: firstEnabledIndex(buttons),
      confirmSelectedIndex: 0,
    };
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
        const menu = this.menu;
        const index = menu?.buttons.findIndex((button) => button.container === container) ?? -1;
        if (menu && index >= 0) {
          menu.selectedIndex = index;
          this.refreshSelection();
        }
      });
      hover.on("pointerout", () => {
        this.refreshSelection();
      });
      hover.on("pointerup", onClick);
    }

    layer.add(container);
    return { key, container, hover, label, progressRing, enabled, onSelect: onClick };
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
    const cancelButton = this.createConfirmButton(width / 2 - 86, height / 2 + 32, t("pause.cancel"), "#d7e3ef", () => this.closeConfirm());
    const confirmButton = this.createConfirmButton(width / 2 + 86, height / 2 + 32, t("pause.confirm"), "#ff5c66", () => {
      if (action === "mainMenu") {
        this.options.onMainMenu();
      } else {
        this.options.onRestart();
      }
    });
    confirmLayer.add(cancelButton.container);
    confirmLayer.add(confirmButton.container);

    menu.confirmLayer = confirmLayer;
    menu.confirmAction = action;
    menu.confirmButtons = [cancelButton, confirmButton];
    menu.confirmSelectedIndex = 0;
    this.refreshSelection();
  }

  private createConfirmButton(
    centerX: number,
    centerY: number,
    text: string,
    color: string,
    onClick: () => void,
  ): PauseConfirmButton {
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
    return { container, hit, label, onSelect: onClick };
  }

  private closeConfirm(): void {
    const menu = this.menu;
    if (!menu) {
      return;
    }
    menu.confirmLayer?.destroy(true);
    menu.confirmLayer = undefined;
    menu.confirmAction = undefined;
    menu.confirmButtons = undefined;
    menu.confirmSelectedIndex = 0;
    this.refreshSelection();
  }

  private destroyMenu(): void {
    this.menu?.layer.destroy(true);
    this.menu?.confirmLayer?.destroy(true);
    this.menu = undefined;
  }

  private updateNavigation(): void {
    const sources = this.options.getInputSources?.();
    const menu = this.menu;
    const joystickState = this.paused ? sources?.joystickControls?.readPauseMenuState() : undefined;
    const mobileState = this.paused ? sources?.mobileControls?.readPauseMenuState() : undefined;
    const pauseDown = Boolean(
      sources?.keys.pause.isDown ||
      (this.paused ? joystickState?.pausePressed : sources?.joystickControls?.readPausePressed()) ||
      (this.paused ? mobileState?.pausePressed : sources?.mobileControls?.readPausePressed()),
    );
    if (pauseDown && !this.lastPauseDown) {
      this.handlePauseInput();
      this.lastPauseDown = pauseDown;
      return;
    }
    this.lastPauseDown = pauseDown;

    if (!this.paused || !menu) {
      this.lastUpDown = false;
      this.lastDownDown = false;
      this.lastConfirmDown = false;
      return;
    }
    const upDown = Boolean(
      sources?.keys.moveUp.isDown ||
      joystickState?.moveY === -1 ||
      mobileState?.moveY === -1,
    );
    const downDown = Boolean(
      sources?.keys.moveDown.isDown ||
      joystickState?.moveY === 1 ||
      mobileState?.moveY === 1,
    );
    if (upDown && !this.lastUpDown) {
      this.moveSelection(-1);
    }
    if (downDown && !this.lastDownDown) {
      this.moveSelection(1);
    }
    this.lastUpDown = upDown;
    this.lastDownDown = downDown;

    const confirmPressed = Boolean(
      joystickState?.bombPressed ||
      mobileState?.bombPressed,
    );
    if (confirmPressed && !this.lastConfirmDown) {
      this.selectCurrent();
    }
    this.lastConfirmDown = confirmPressed;
  }

  private moveSelection(direction: -1 | 1): void {
    const menu = this.menu;
    if (!menu) return;
    if (menu.confirmLayer && menu.confirmButtons) {
      menu.confirmSelectedIndex = Phaser.Math.Wrap(menu.confirmSelectedIndex + direction, 0, menu.confirmButtons.length);
      this.refreshSelection();
      return;
    }
    const enabledIndices = menu.buttons
      .map((button, index) => button.enabled ? index : -1)
      .filter((index) => index >= 0);
    if (enabledIndices.length === 0) return;
    const currentEnabledIndex = enabledIndices.indexOf(menu.selectedIndex);
    const nextIndex = enabledIndices[Phaser.Math.Wrap(currentEnabledIndex + direction, 0, enabledIndices.length)] ?? enabledIndices[0]!;
    menu.selectedIndex = nextIndex;
    this.refreshSelection();
  }

  private selectCurrent(): void {
    const menu = this.menu;
    if (!menu) return;
    if (menu.confirmLayer && menu.confirmButtons) {
      menu.confirmButtons[menu.confirmSelectedIndex]?.onSelect();
      return;
    }
    menu.buttons[menu.selectedIndex]?.onSelect();
  }

  private refreshSelection(): void {
    const menu = this.menu;
    if (!menu) return;
    menu.buttons.forEach((button, index) => {
      const selected = index === menu.selectedIndex && button.enabled && !menu.confirmLayer;
      button.hover.setFillStyle(0xffffff, selected ? 0.08 : 0);
      button.label.setColor(selected ? (button.key === "resume" || button.key === "speed" ? "#ffcf6e" : "#ff5c66") : button.enabled ? "#f6f1e6" : "#6e8496");
    });
    menu.confirmButtons?.forEach((button, index) => {
      const selected = index === menu.confirmSelectedIndex;
      button.hit.setFillStyle(0xffffff, selected ? 0.09 : 0);
      button.label.setScale(selected ? 1.04 : 1);
    });
  }
}

function firstEnabledIndex(buttons: readonly PauseMenuButton[]): number {
  const index = buttons.findIndex((button) => button.enabled);
  return index >= 0 ? index : 0;
}

function nextReplaySpeed(speed: number): number {
  const currentIndex = REPLAY_SPEEDS.findIndex((value) => value === speed);
  return REPLAY_SPEEDS[(currentIndex + 1) % REPLAY_SPEEDS.length] ?? 1;
}

function formatSpeed(speed: number): string {
  return Number.isInteger(speed) ? `${speed}` : speed.toString();
}
