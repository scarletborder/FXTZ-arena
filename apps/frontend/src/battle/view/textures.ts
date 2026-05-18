import Phaser from "phaser";

export function createBattleTextures(scene: Phaser.Scene): void {
  const make = (name: string, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
    if (scene.textures.exists(name)) {
      return;
    }
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(name, 256, 256);
    g.destroy();
  };

  make("fighter-player", (g) => {
    g.lineStyle(5, 0xffffff, 1);
    g.strokePoints([new Phaser.Geom.Point(128, 24), new Phaser.Geom.Point(212, 208), new Phaser.Geom.Point(44, 208)], true);
  });
  make("fighter-target", (g) => {
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(128, 128, 74);
    g.lineStyle(3, 0xffffff, 0.95);
    g.strokeCircle(128, 128, 44);
  });
  make("bullet-orb", (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(128, 128, 116);
    g.lineStyle(12, 0xffffff, 1);
    g.strokeCircle(128, 128, 116);
  });
  make("bullet-knife", (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(18, 8, 220, 240);
    g.lineStyle(12, 0xffffff, 1);
    g.strokeRect(18, 8, 220, 240);
  });
  make("bullet-laser", (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(4, 24, 248, 208);
    g.lineStyle(12, 0xffffff, 1);
    g.strokeRect(4, 24, 248, 208);
  });
  make("bullet-ray-preview", (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 28, 256, 200);
  });
  make("bullet-spark", (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillRect(66, 12, 190, 232);
    g.fillEllipse(66, 128, 124, 232);
    g.lineStyle(10, 0xffffff, 1);
    g.strokeRect(66, 12, 190, 232);
    g.strokeEllipse(66, 128, 124, 232);
  });
  make("effect-ring", (g) => {
    g.lineStyle(4, 0xffffff, 1);
    g.strokeCircle(128, 128, 100);
  });
  make("effect-burst", (g) => {
    g.lineStyle(5, 0xffffff, 1);
    g.lineBetween(128, 24, 128, 232);
    g.lineBetween(24, 128, 232, 128);
    g.lineBetween(46, 46, 210, 210);
    g.lineBetween(210, 46, 46, 210);
  });
  make("cursor", (g) => {
    g.lineStyle(6, 0xffffff, 1);
    g.strokeCircle(128, 128, 34);
    g.lineStyle(4, 0xffffff, 1);
    g.lineBetween(128, 64, 128, 98);
    g.lineBetween(128, 158, 128, 192);
    g.lineBetween(64, 128, 98, 128);
    g.lineBetween(158, 128, 192, 128);
  });
  make("bomb", (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(128, 128, 34);
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(128, 128, 34);
  });
}
