import Phaser from "phaser";
import { t } from "@repo/i18n";

import {
  bodyStyle,
  createBackButton,
  drawFightingBackdrop,
  headingStyle,
} from "../ui";
import type { SceneKey } from "../shared";
import type { SettingsTabDefinition, SettingsTabKey } from "./types";
import { renderOnlineTab } from "./online-tab";
import { renderGeneralTab } from "./general-tab";
import { renderAboutTab } from "./about-tab";
import { renderDebugTab } from "./debug-tab";
import { renderKeyboardTab } from "./keyboard-tab";

const TAB_DEFINITIONS: readonly SettingsTabDefinition[] = [
  { key: "online", label: t("settings.online"), render: renderOnlineTab },
  { key: "general", label: t("settings.general"), render: renderGeneralTab },
  {
    key: "keyboard",
    label: t("settings.keyboard") ?? "键盘控制",
    render: renderKeyboardTab,
    // 如果不是 PC 桌面设备，则禁用该 Tab
    disabled: (scene) => !scene.sys.game.device.os.desktop
  },
  { key: "debug", label: t("settings.debug"), render: renderDebugTab },
  { key: "about", label: t("settings.about"), render: renderAboutTab },
];

export class SettingsScene extends Phaser.Scene {
  private activeTab: SettingsTabKey = "online";
  private tabLayer: Phaser.GameObjects.Container | undefined;
  private contentLayer: Phaser.GameObjects.Container | undefined;
  private cleanupCallbacks: Array<() => void> = [];

  constructor() {
    super("settings" satisfies SceneKey);
  }

  init(): void {
    this.cleanupContent();
    this.tabLayer = undefined;
    this.contentLayer = undefined;
  }

  create(): void {
    drawFightingBackdrop(this, "OPTIONS", "SYSTEM");
    createBackButton(this);
    this.add.text(90, 72, t("settings.title"), headingStyle(42));

    this.tabLayer = this.add.container(74, 138);
    this.contentLayer = this.add.container(74, 190);
    this.renderTabs();
    this.renderActiveTab();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cleanupContent();
      this.tabLayer = undefined;
      this.contentLayer = undefined;
    });
  }

  addCleanup(cleanup: () => void): void {
    this.cleanupCallbacks.push(cleanup);
  }

  switchTab(key: SettingsTabKey): void {
    if (this.activeTab === key) {
      return;
    }
    this.activeTab = key;
    this.renderTabs();
    this.renderActiveTab();
  }

  private renderTabs(): void {
    this.tabLayer?.removeAll(true);
    TAB_DEFINITIONS.forEach((tab, index) => {
      this.tabLayer?.add(this.createTabBookmark(index * 132, tab));
    });
  }

  private createTabBookmark(x: number, tab: SettingsTabDefinition): Phaser.GameObjects.Container {
    const selected = tab.key === this.activeTab;
    const disabled = tab.disabled ? tab.disabled(this) : false; // 检测是否置灰

    let hovering = false;
    const width = 118;
    const height = 46;
    const container = this.add.container(x, 0);
    const background = this.add.graphics();
    const label = this.add.text(width / 2, 21, tab.label, bodyStyle(selected ? "#101820" : "#f6f1e6", 18))
      .setOrigin(0.5);

    // 仅在非置灰状态下提供手势指针和交互
    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0);

    if (!disabled) {
      hitArea.setInteractive({ useHandCursor: true });
    }

    const draw = () => {
      background.clear();
      // 置灰态与普通态的颜色逻辑
      let fill = selected ? 0xffcf6e : hovering ? 0x263244 : 0x151b26;
      let stroke = selected ? 0xffcf6e : hovering ? 0x9fd8ff : 0x5c7185;

      if (disabled) {
        fill = 0x15171c;     // 较暗的置灰底色
        stroke = 0x2c3540;   // 较弱的边框
      }

      const cut = 14;
      const points = [
        new Phaser.Math.Vector2(0, height),
        new Phaser.Math.Vector2(0, cut),
        new Phaser.Math.Vector2(cut, 0),
        new Phaser.Math.Vector2(width - cut, 0),
        new Phaser.Math.Vector2(width, cut),
        new Phaser.Math.Vector2(width, height),
      ];
      background.fillStyle(fill, selected ? 1 : 0.98).fillPoints(points, true);
      background.lineStyle(2, stroke, 1).strokePoints(points, false, true);
      if (disabled) {
        label.setColor("#4c5b6b"); // 灰暗色文字
      } else {
        label.setColor(selected ? "#101820" : hovering ? "#ffcf6e" : "#f6f1e6");
      }
    };

    // 仅在非置灰状态下注册事件
    if (!disabled) {
      hitArea.on("pointerover", () => {
        hovering = true;
        draw();
      });
      hitArea.on("pointerout", () => {
        hovering = false;
        draw();
      });
      hitArea.on("pointerup", () => {
        this.switchTab(tab.key);
      });
    }

    container.add([background, label, hitArea]);
    draw();
    return container;
  }

  private renderActiveTab(): void {
    if (!this.contentLayer) {
      return;
    }
    this.cleanupContent();
    this.contentLayer.removeAll(true);
    const background = this.add.graphics();
    background.fillStyle(0x101820, 0.9);
    background.fillRect(0, 0, 1130, 438);
    background.lineStyle(2, 0x34475c, 0.9);
    background.strokeRect(0, 0, 1130, 438);
    this.contentLayer.add(background);

    const tab = TAB_DEFINITIONS.find((item) => item.key === this.activeTab) ?? TAB_DEFINITIONS[0];
    tab.render(this, this.contentLayer);
  }

  private cleanupContent(): void {
    const callbacks = this.cleanupCallbacks;
    this.cleanupCallbacks = [];
    callbacks.forEach((cleanup) => cleanup());
  }
}
