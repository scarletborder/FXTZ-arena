import Phaser from "phaser";
import { t } from "@repo/i18n";

import { bodyStyle, createBackButton, drawFightingBackdrop, headingStyle } from "./ui";
import { type SceneKey } from "./shared";

type ManualSection = {
  readonly key: string;
  readonly label: string;
  readonly content: string;
};

const MANUAL_SECTIONS: readonly ManualSection[] = [
  { key: "story", label: t("manual.story"), content: t("manual.story_content") },
  { key: "requirements", label: t("manual.requirements"), content: t("manual.requirements_content") },
  { key: "gameplay", label: t("manual.gameplay"), content: t("manual.gameplay_content") },
  { key: "controls", label: t("manual.controls"), content: t("manual.controls_content") },
  { key: "items", label: t("manual.items"), content: t("manual.items_content") },
];

export class ManualScene extends Phaser.Scene {
  private tocLayer!: Phaser.GameObjects.Container;
  private bodyLayer!: Phaser.GameObjects.Container;
  private activeSectionKey = MANUAL_SECTIONS[0]!.key;
  private tocScrollOffset = 0;
  private bodyScrollOffset = 0;
  private scrollAreas: Array<{ bounds: Phaser.Geom.Rectangle; scroll: (deltaY: number) => void }> = [];
  private dragScroll:
    | { readonly pointerId: number; readonly area: { bounds: Phaser.Geom.Rectangle; scroll: (deltaY: number) => void }; lastY: number }
    | undefined;

  private readonly onWheel = (pointer: Phaser.Input.Pointer, _gameObjects: unknown, _deltaX: number, deltaY: number): void => {
    for (const area of this.scrollAreas) {
      if (Phaser.Geom.Rectangle.Contains(area.bounds, pointer.x, pointer.y)) {
        area.scroll(deltaY);
        break;
      }
    }
  };

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    for (const area of this.scrollAreas) {
      if (Phaser.Geom.Rectangle.Contains(area.bounds, pointer.x, pointer.y)) {
        this.dragScroll = { pointerId: pointer.id, area, lastY: pointer.y };
        break;
      }
    }
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragScroll || this.dragScroll.pointerId !== pointer.id || !pointer.isDown) return;
    const deltaY = this.dragScroll.lastY - pointer.y;
    if (deltaY !== 0) {
      this.dragScroll.area.scroll(deltaY);
      this.dragScroll.lastY = pointer.y;
      pointer.event?.preventDefault();
    }
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.dragScroll?.pointerId === pointer.id) {
      this.dragScroll = undefined;
    }
  };

  constructor() {
    super("manual" satisfies SceneKey);
  }

  create(): void {
    drawFightingBackdrop(this, "MANUAL", "BOOK");
    this.add.text(90, 72, t("manual.title"), headingStyle(42));

    createBackButton(this, "home", 104, 62);
    this.add.line(0, 0, 320, 116, 320, 642, 0x5c7185, 1).setLineWidth(2);

    this.tocLayer = this.add.container(0, 0);
    this.bodyLayer = this.add.container(0, 0);
    this.input.on("wheel", this.onWheel);
    this.input.on("pointerdown", this.onPointerDown);
    this.input.on("pointermove", this.onPointerMove);
    this.input.on("pointerup", this.onPointerUp);
    this.input.on("pointerupoutside", this.onPointerUp);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("wheel", this.onWheel);
      this.input.off("pointerdown", this.onPointerDown);
      this.input.off("pointermove", this.onPointerMove);
      this.input.off("pointerup", this.onPointerUp);
      this.input.off("pointerupoutside", this.onPointerUp);
    });
    this.render();
  }

  private render(): void {
    this.tocLayer.removeAll(true);
    this.bodyLayer.removeAll(true);
    this.scrollAreas = [];
    this.dragScroll = undefined;

    this.renderToc();
    this.renderBody();
  }

  private renderToc(): void {
    const bounds = new Phaser.Geom.Rectangle(36, 150, 260, 470);
    const content = this.add.container(0, 0);
    const header = this.add.text(36, 132, t("manual.toc"), bodyStyle("#ffcf6e", 19));
    this.tocLayer.add(header);
    this.tocLayer.add(content);

    const rowHeight = 70;
    MANUAL_SECTIONS.forEach((section, index) => {
      const selected = section.key === this.activeSectionKey;
      const rowY = bounds.y + index * rowHeight;
      const row = this.add.container(bounds.x, rowY);
      const text = this.add.text(16, 20, section.label, bodyStyle(selected ? "#ffcf6e" : "#f6f1e6", 17));
      const underline = this.add.graphics();
      const hit = this.add.rectangle(0, 0, bounds.width, rowHeight - 8, 0xffffff, 0.001)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const draw = () => {
        text.setColor(selected ? "#ffcf6e" : "#f6f1e6");
        underline.clear();
        if (selected) {
          underline.lineStyle(2, 0xffcf6e, 1);
          underline.lineBetween(16, 45, bounds.width - 16, 45);
        }
      };
      hit.on("pointerup", () => {
        this.activeSectionKey = section.key;
        this.render();
      });
      row.add([text, underline, hit]);
      draw();
      content.add(row);
    });

    const contentHeight = MANUAL_SECTIONS.length * rowHeight;
    this.registerScrollArea(bounds, content, contentHeight, bounds.height, "toc");
  }

  private renderBody(): void {
    const bounds = new Phaser.Geom.Rectangle(356, 142, 884, 486);
    const content = this.add.container(0, 0);
    const section = MANUAL_SECTIONS.find((item) => item.key === this.activeSectionKey) ?? MANUAL_SECTIONS[0]!;
    const title = this.add.text(bounds.x, bounds.y, section.label, bodyStyle("#ffcf6e", 22));
    const text = this.add.text(bounds.x, bounds.y + 38, section.content, bodyStyle("#d7e3ef", 18))
      .setLineSpacing(10)
      .setWordWrapWidth(bounds.width - 8, true);
    content.add([title, text]);

    this.bodyLayer.add(content);
    this.registerScrollArea(bounds, content, 38 + text.height, bounds.height, "body");
  }

  private registerScrollArea(
    bounds: Phaser.Geom.Rectangle,
    container: Phaser.GameObjects.Container,
    contentHeight: number,
    viewHeight: number,
    kind: "toc" | "body",
  ): void {
    const maxOffset = Math.max(0, contentHeight - viewHeight);
    let offset = Phaser.Math.Clamp(kind === "toc" ? this.tocScrollOffset : this.bodyScrollOffset, 0, maxOffset);
    container.y = -offset;
    const scroll = (deltaY: number) => {
      if (maxOffset <= 0) return;
      offset = Phaser.Math.Clamp(offset + deltaY, 0, maxOffset);
      container.y = -offset;
      if (kind === "toc") {
        this.tocScrollOffset = offset;
      } else {
        this.bodyScrollOffset = offset;
      }
    };
    if (kind === "toc") {
      this.tocScrollOffset = offset;
    } else {
      this.bodyScrollOffset = offset;
    }
    this.scrollAreas.push({ bounds, scroll });
  }
}
