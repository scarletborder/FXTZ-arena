import Phaser from "phaser";

import type { FighterState, PointState } from "@repo/raid-logic";
import { Depth } from "../../utils/depth";
import { smoothValue } from "./smooth";

interface PointVisual {
  readonly box: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly container: Phaser.GameObjects.Container;
}

export class PointView {
  private readonly visuals = new Map<number, PointVisual>();

  constructor(private readonly scene: Phaser.Scene) { }

  render(params: {
    readonly points: readonly PointState[];
    readonly player: FighterState;
    readonly target: FighterState;
    readonly alpha?: number;
    readonly rollbackBlend?: number;
  }): void {
    const alpha = params.alpha ?? 1;
    const rollbackBlend = params.rollbackBlend ?? 1;
    const active = new Set<number>();
    for (const point of params.points) {
      if (!point.active) {
        continue;
      }
      active.add(point.id);
      let visual = this.visuals.get(point.id);
      if (!visual) {
        visual = this.createVisual(point);
        this.visuals.set(point.id, visual);
      }

      const display = pointDisplay(point, params.player, params.target, alpha);
      const collectRatio = point.collectingBy ? Math.max(0, point.collectTicksRemaining / 10) : 1;
      const scale = point.collectingBy ? 1 + (1 - collectRatio) * 0.35 : 1;
      visual.container.setScale(scale);
      visual.container.setPosition(smoothValue(visual.container.x, display.x, rollbackBlend), smoothValue(visual.container.y, display.y, rollbackBlend));
      visual.container.setAlpha(smoothValue(visual.container.alpha, point.collectingBy ? collectRatio : 1, rollbackBlend));
      visual.container.setVisible(true);
      visual.box.setDisplaySize(point.size, point.size);
      visual.box.setFillStyle(point.rewardKind === "money" ? 0xffd45c : 0xffffff, 1);
      visual.box.setStrokeStyle(2, point.rewardKind === "money" ? 0xb87a00 : 0x2f7fff, 1);
      visual.label.setText(point.rewardKind === "money" ? "M" : "P");
      visual.label.setColor(point.rewardKind === "money" ? "#7a4a00" : "#2f7fff");
      visual.label.setFontSize(Math.max(8, point.size - 1));
    }

    for (const [id, visual] of this.visuals) {
      if (!active.has(id)) {
        visual.container.destroy(true);
        this.visuals.delete(id);
      }
    }
  }

  private createVisual(point: PointState): PointVisual {
    const isMoney = point.rewardKind === "money";
    const box = this.scene.add.rectangle(0, 0, point.size, point.size, isMoney ? 0xffd45c : 0xffffff, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, isMoney ? 0xb87a00 : 0x2f7fff, 1);
    const label = this.scene.add.text(0, 0, isMoney ? "M" : "P", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: `${Math.max(8, point.size - 1)}px`,
      fontStyle: "700",
      color: isMoney ? "#7a4a00" : "#2f7fff",
    }).setOrigin(0.5);
    const container = this.scene.add.container(point.x, point.y, [box, label]).setDepth(Depth.Point);
    return { box, label, container };
  }
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function pointDisplay(
  point: PointState,
  player: FighterState,
  target: FighterState,
  alpha: number,
): { readonly x: number; readonly y: number } {
  if (!point.collectingBy) {
    return {
      x: lerp(point.previousX, point.x, alpha),
      y: lerp(point.previousY, point.y, alpha),
    };
  }
  const fighter = point.collectingBy === "Player1" ? player : target;
  const targetX = lerp(fighter.previousX, fighter.x, alpha);
  const targetY = lerp(fighter.previousY, fighter.y, alpha);
  const progress = Math.max(0, Math.min(1, (10 - point.collectTicksRemaining + alpha) / 10));
  return {
    x: lerp(point.x, targetX, progress),
    y: lerp(point.y, targetY, progress),
  };
}
