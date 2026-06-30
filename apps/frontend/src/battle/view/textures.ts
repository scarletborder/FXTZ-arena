import Phaser from "phaser";

export function createBattleTextures(scene: Phaser.Scene): void {
  const make = (
    name: string,
    draw: (g: Phaser.GameObjects.Graphics) => void,
  ): void => {
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
    g.strokePoints(
      [
        new Phaser.Math.Vector2(128, 24),
        new Phaser.Math.Vector2(212, 208),
        new Phaser.Math.Vector2(44, 208),
      ],
      true,
    );
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
  make("bullet-diamond", (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(128, 8),
        new Phaser.Math.Vector2(248, 128),
        new Phaser.Math.Vector2(128, 248),
        new Phaser.Math.Vector2(8, 128),
      ],
      true,
    );
    g.lineStyle(12, 0xffffff, 1);
    g.strokePoints(
      [
        new Phaser.Math.Vector2(128, 8),
        new Phaser.Math.Vector2(248, 128),
        new Phaser.Math.Vector2(128, 248),
        new Phaser.Math.Vector2(8, 128),
      ],
      true,
    );
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
  make("cursor-x", (g) => {
    g.lineStyle(7, 0xffffff, 1);
    g.lineBetween(82, 82, 174, 174);
    g.lineBetween(174, 82, 82, 174);
    g.lineStyle(3, 0xffffff, 0.82);
    g.strokeCircle(128, 128, 42);
  });
  make("bomb", (g) => {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(128, 128, 34);
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(128, 128, 34);
  });

  // ---- Neutral mob textures ------------------------------------------------

  make("mob-example-fairy-front", (g) => {
    // Body: centered rectangle
    g.fillStyle(0xffffff, 1);
    g.fillRect(88, 64, 80, 128);
    // Left wing: obtuse triangle (apex angle > 90°)
    g.fillTriangle(88, 64, 88, 192, 28, 128);
    // Right wing: obtuse triangle (mirror)
    g.fillTriangle(168, 64, 168, 192, 228, 128);
  });
  make("mob-example-fairy-side", (g) => {
    // Body: rectangle on the left
    g.fillStyle(0xffffff, 1);
    g.fillRect(48, 64, 64, 128);
    // Upper wing: obtuse triangle extending up-right
    g.fillTriangle(112, 74, 112, 164, 192, 54);
    // Lower wing: obtuse triangle extending down-right
    g.fillTriangle(112, 92, 112, 182, 192, 202);
  });

  make("default-familiar-normal-static", (g) => {
    drawDefaultFamiliarMagicCircle(g);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(128, 128, 52);
    g.lineStyle(4, 0xf8fbff, 0.95);
    g.strokeCircle(128, 128, 52);
  });
  make("default-familiar-normal-moving", (g) => {
    drawDefaultFamiliarMagicCircle(g);
    g.fillStyle(0xffffff, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(128, 54),
        new Phaser.Math.Vector2(172, 122),
        new Phaser.Math.Vector2(148, 196),
        new Phaser.Math.Vector2(128, 222),
        new Phaser.Math.Vector2(108, 196),
        new Phaser.Math.Vector2(84, 122),
      ],
      true,
    );
    g.fillEllipse(128, 120, 108, 132);
    g.lineStyle(4, 0xf8fbff, 0.95);
    g.strokePoints(
      [
        new Phaser.Math.Vector2(128, 54),
        new Phaser.Math.Vector2(172, 122),
        new Phaser.Math.Vector2(148, 196),
        new Phaser.Math.Vector2(128, 222),
        new Phaser.Math.Vector2(108, 196),
        new Phaser.Math.Vector2(84, 122),
      ],
      true,
    );
  });
  make("default-familiar-invisible-static", (g) => {
    drawDefaultFamiliarMagicCircle(g);
  });
  make("default-familiar-invisible-moving", (g) => {
    drawDefaultFamiliarMagicCircle(g);
  });
}

function drawDefaultFamiliarMagicCircle(
  g: Phaser.GameObjects.Graphics,
): void {
  const outerRadius = 68;
  const starRadius = 58;

  g.lineStyle(6, 0xc94646, 0.95);
  g.strokeCircle(128, 128, outerRadius);
  g.lineStyle(3, 0xc94646, 0.55);
  g.strokeCircle(128, 128, outerRadius - 12);

  g.lineStyle(5, 0x8f5dff, 0.92);
  g.strokePoints(
    equilateralTrianglePoints(128, 128, starRadius, -Math.PI / 2),
    true,
  );
  g.strokePoints(
    equilateralTrianglePoints(128, 128, starRadius, -Math.PI / 6),
    true,
  );
}

function equilateralTrianglePoints(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
): Phaser.Math.Vector2[] {
  return Array.from({ length: 3 }, (_, index) => {
    const angle = startAngle + (Math.PI * 2 * index) / 3;
    return new Phaser.Math.Vector2(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
    );
  });
}
