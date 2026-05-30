import Phaser from "phaser";

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

const TAB_DEFINITIONS: readonly SettingsTabDefinition[] = [
  { key: "online", label: "联机", render: renderOnlineTab },
  { key: "general", label: "通用", render: renderGeneralTab },
  { key: "about", label: "关于", render: renderAboutTab },
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
    this.add.text(90, 72, "设置", headingStyle(42));

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
    let hovering = false;
    const width = 118;
    const height = 46;
    const container = this.add.container(x, 0);
    const background = this.add.graphics();
    const label = this.add.text(width / 2, 21, tab.label, bodyStyle(selected ? "#101820" : "#f6f1e6", 18))
      .setOrigin(0.5);
    const hitArea = this.add.rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    const draw = () => {
      background.clear();
      const fill = selected ? 0xffcf6e : hovering ? 0x263244 : 0x151b26;
      const stroke = selected ? 0xffcf6e : hovering ? 0x9fd8ff : 0x5c7185;
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
      label.setColor(selected ? "#101820" : hovering ? "#ffcf6e" : "#f6f1e6");
    };

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
