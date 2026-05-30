import Phaser from "phaser";

import { FONT, GAME_HEIGHT, GAME_WIDTH } from "./constants";

export function drawFightingBackdrop(scene: Phaser.Scene, word: string, subWord: string): void {
  const graphics = scene.add.graphics();
  graphics.fillGradientStyle(0x0a0e14, 0x101820, 0x15171d, 0x0a0e14, 1);
  graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  graphics.lineStyle(1, 0x273548, 0.36);
  for (let x = -240; x < GAME_WIDTH + 260; x += 42) {
    graphics.lineBetween(x, GAME_HEIGHT, x + 320, 0);
  }
  graphics.fillStyle(0xe33d44, 0.2);
  graphics.fillTriangle(0, 128, 360, 90, 0, 214);
  graphics.fillStyle(0x26c6da, 0.14);
  graphics.fillTriangle(GAME_WIDTH, 520, 840, 650, GAME_WIDTH, 684);
  scene.add.text(720, 62, word, {
    fontFamily: FONT,
    fontSize: "92px",
    fontStyle: "900",
    color: "#ffffff",
  }).setOrigin(0.5).setAlpha(0.055);
  scene.add.text(722, 136, subWord, {
    fontFamily: FONT,
    fontSize: "34px",
    fontStyle: "900",
    color: "#ffffff",
  }).setOrigin(0.5).setAlpha(0.07);
}