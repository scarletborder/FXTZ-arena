import Phaser from "phaser";

export function fitImageToBounds(
  image: Phaser.GameObjects.Image,
  width: number,
  height: number,
  mode: "contain" | "cover" = "contain",
): Phaser.GameObjects.Image {
  const sourceWidth = image.width || 1;
  const sourceHeight = image.height || 1;
  const scale = mode === "cover"
    ? Math.max(width / sourceWidth, height / sourceHeight)
    : Math.min(width / sourceWidth, height / sourceHeight);
  image.setDisplaySize(sourceWidth * scale, sourceHeight * scale);
  image.setPosition(image.x, image.y);
  return image;
}

export function createFittedImage(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textureKey: string,
  width: number,
  height: number,
  mode: "contain" | "cover" = "contain",
): Phaser.GameObjects.Image {
  const image = scene.add.image(x, y, textureKey);
  return fitImageToBounds(image, width, height, mode);
}
