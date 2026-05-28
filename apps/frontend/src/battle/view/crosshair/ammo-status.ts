import Phaser from "phaser";

import { Depth } from "../../../utils/depth";

export class CrosshairAmmoStatus {
  private readonly back: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly outline: Phaser.GameObjects.Rectangle;
  private readonly ammoText: Phaser.GameObjects.Text;
  private readonly pointText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.back = scene.add
      .rectangle(0, 0, 10, 58, 0x111820, 0.9)
      .setOrigin(0.5, 0)
      .setDepth(Depth.Crosshair);
    this.fill = scene.add
      .rectangle(0, 0, 8, 56, 0x8b99aa, 1)
      .setOrigin(0.5, 0)
      .setDepth(Depth.CrosshairFill);
    this.outline = scene.add
      .rectangle(0, 0, 10, 58, 0x000000, 0)
      .setOrigin(0.5, 0)
      .setStrokeStyle(2, 0xd7e3ef, 0.9)
      .setDepth(Depth.CrosshairText);
    this.ammoText = scene.add
      .text(0, 0, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "13px",
        color: "#d7e3ef",
      })
      .setOrigin(0.5)
      .setDepth(Depth.CrosshairText);
    this.pointText = scene.add
      .text(0, 0, "", {
        fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
        fontSize: "12px",
        color: "#7fb4ff",
      })
      .setOrigin(0.5)
      .setDepth(Depth.CrosshairText);
  }

  render(params: {
    readonly x: number;
    readonly y: number;
    readonly ammoDisplay: number;
    readonly ammoCount: number;
    readonly ammoMax: number;
    readonly pointCount: number;
    readonly danger: boolean;
    readonly highlight?: boolean;
  }): void {
    const ratio = Math.max(
      0,
      Math.min(1, params.ammoDisplay / Math.max(1, params.ammoMax)),
    );
    const fillHeight = 56 * ratio;

    this.back.setPosition(params.x, params.y);
    this.fill.setPosition(params.x, params.y + (56 - fillHeight));
    this.fill.setDisplaySize(8, fillHeight);
    this.fill.setFillStyle(
      params.highlight ? 0x4dff88 : params.danger ? 0xff5a5a : 0x4e7fff,
      1,
    );
    this.outline.setPosition(params.x, params.y);
    this.ammoText.setPosition(params.x, params.y + 74);
    this.ammoText.setText(`${Math.floor(params.ammoCount)}/${params.ammoMax}`);
    this.pointText.setPosition(params.x, params.y + 90);
    this.pointText.setText(`P ${formatPointDisplay(params.pointCount)}`);
  }
}

function formatPointDisplay(pointCount: number): string {
  return ((pointCount + 100) / 100).toFixed(2);
}
