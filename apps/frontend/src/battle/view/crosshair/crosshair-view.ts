import Phaser from "phaser";

import { Depth } from "../../../utils/depth";
import { CrosshairActiveCardStatus } from "./active-card-status";
import { CrosshairAmmoStatus } from "./ammo-status";
import { CrosshairStatusMarkers } from "./status-markers";
import type { CrosshairRenderParams } from "./types";

export class CrosshairView {
  private readonly crosshair: Phaser.GameObjects.Image;
  private readonly ammoStatus: CrosshairAmmoStatus;
  private readonly activeCardStatus: CrosshairActiveCardStatus;
  private readonly statusMarkers: CrosshairStatusMarkers;

  constructor(scene: Phaser.Scene) {
    this.crosshair = scene.add
      .image(640, 360, "cursor")
      .setOrigin(0.5)
      .setScale(0.22)
      .setDepth(Depth.Crosshair);
    this.ammoStatus = new CrosshairAmmoStatus(scene);
    this.activeCardStatus = new CrosshairActiveCardStatus(scene);
    this.statusMarkers = new CrosshairStatusMarkers(scene);
  }

  render(params: CrosshairRenderParams): void {
    const barX = params.pointerX + 44;
    const barY = params.pointerY - 28;
    const statusLeft = params.pointerX - 28;

    this.crosshair.setPosition(params.pointerX, params.pointerY);
    this.crosshair.setTint(crosshairTint(params));
    this.ammoStatus.render({
      x: barX,
      y: barY,
      ammoDisplay: params.ammoDisplay,
      ammoCount: params.ammoCount,
      ammoMax: params.ammoMax,
      pointCount: params.pointCount,
      danger: params.danger,
      highlight: params.highlight,
    });
    this.activeCardStatus.render(params, statusLeft, params.pointerY + 38);
    this.statusMarkers.render({
      x: statusLeft,
      y: params.pointerY,
      lives: params.lives,
      bombs: params.bombs,
    });
  }
}

function crosshairTint(
  params: Pick<CrosshairRenderParams, "danger" | "highlight">,
): number {
  if (params.highlight) return 0x4dff88;
  if (params.danger) return 0xff5a5a;
  return 0xffffff;
}
