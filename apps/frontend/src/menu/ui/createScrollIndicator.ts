import Phaser from "phaser";

interface ScrollIndicatorOptions {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly width?: number;
}

export interface ScrollIndicator {
  readonly container: Phaser.GameObjects.Container;
  update(offset: number, viewHeight: number, contentHeight: number): void;
}

export function createScrollIndicator(
  scene: Phaser.Scene,
  options: ScrollIndicatorOptions,
): ScrollIndicator {
  const width = options.width ?? 8;
  const track = scene.add.graphics();
  const glow = scene.add.graphics();
  const thumb = scene.add.graphics();
  const container = scene.add.container(options.x, options.y, [track, glow, thumb]);

  const draw = (offset: number, viewHeight: number, contentHeight: number) => {
    track.clear();
    glow.clear();
    thumb.clear();

    const maxOffset = Math.max(0, contentHeight - viewHeight);
    if (maxOffset <= 0 || contentHeight <= 0) {
      container.setVisible(false);
      return;
    }

    container.setVisible(true);
    const visibleRatio = Phaser.Math.Clamp(viewHeight / contentHeight, 0, 1);
    const thumbHeight = Math.max(24, options.height * visibleRatio);
    const travel = Math.max(0, options.height - thumbHeight);
    const ratio = Phaser.Math.Clamp(offset / maxOffset, 0, 1);
    const thumbY = travel * ratio;

    track.fillStyle(0x5a4600, 0.28);
    track.fillRoundedRect(0, 0, width, options.height, width / 2);

    glow.fillStyle(0xffcf6e, 0.14);
    glow.fillRoundedRect(-2, thumbY - 2, width + 4, thumbHeight + 4, width / 2 + 2);

    thumb.fillStyle(0xffcf6e, 0.94);
    thumb.fillRoundedRect(0, thumbY, width, thumbHeight, width / 2);
    thumb.lineStyle(1, 0xfff0bf, 0.95);
    thumb.strokeRoundedRect(0.5, thumbY + 0.5, width - 1, thumbHeight - 1, width / 2);
  };

  draw(0, options.height, options.height);

  return {
    container,
    update: draw,
  };
}
