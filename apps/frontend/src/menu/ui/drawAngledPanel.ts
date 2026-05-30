import Phaser from "phaser";

export function drawAngledPanel(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number, fill: number, stroke: number, alpha: number): void {
  const cut = Math.min(22, width * 0.16, height * 0.4);
  const points = [
    new Phaser.Math.Vector2(x + cut, y),
    new Phaser.Math.Vector2(x + width, y),
    new Phaser.Math.Vector2(x + width - cut, y + height),
    new Phaser.Math.Vector2(x, y + height),
  ];
  graphics.fillStyle(fill, alpha).fillPoints(points, true);
  graphics.lineStyle(2, stroke, alpha).strokePoints(points, true);
}