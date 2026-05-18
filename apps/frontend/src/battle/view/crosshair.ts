import Phaser from "phaser";

export class CrosshairView {
  private readonly crosshair: Phaser.GameObjects.Image;
  private readonly ammoBack: Phaser.GameObjects.Rectangle;
  private readonly ammoFill: Phaser.GameObjects.Rectangle;
  private readonly ammoOutline: Phaser.GameObjects.Rectangle;
  private readonly ammoText: Phaser.GameObjects.Text;
  private readonly bombIcons: readonly Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene) {
    this.crosshair = scene.add.image(640, 360, "cursor").setOrigin(0.5).setScale(0.22).setDepth(12);
    this.ammoBack = scene.add.rectangle(0, 0, 10, 58, 0x111820, 0.9).setOrigin(0.5, 0).setDepth(12);
    this.ammoFill = scene.add.rectangle(0, 0, 8, 56, 0x8b99aa, 1).setOrigin(0.5, 0).setDepth(13);
    this.ammoOutline = scene.add.rectangle(0, 0, 10, 58, 0x000000, 0).setOrigin(0.5, 0).setStrokeStyle(2, 0xd7e3ef, 0.9).setDepth(14);
    this.ammoText = scene.add.text(0, 0, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "13px",
      color: "#d7e3ef",
    }).setOrigin(0.5).setDepth(14);
    this.bombIcons = Array.from({ length: 6 }, () =>
      scene.add.image(0, 0, "bomb").setOrigin(0.5).setScale(0.085).setTint(0xaec7ff).setDepth(12),
    );
  }

  render(params: {
    readonly pointerX: number;
    readonly pointerY: number;
    readonly danger: boolean;
    readonly ammoDisplay: number;
    readonly ammoCount: number;
    readonly ammoMax: number;
    readonly bombs: number;
  }): void {
    const barX = params.pointerX + 44;
    const barY = params.pointerY - 28;
    const ratio = Math.max(0, Math.min(1, params.ammoDisplay / Math.max(1, params.ammoMax)));
    const fillHeight = 56 * ratio;
    this.crosshair.setPosition(params.pointerX, params.pointerY);
    this.crosshair.setTint(params.danger ? 0xff5a5a : 0xffffff);
    this.ammoBack.setPosition(barX, barY);
    this.ammoFill.setPosition(barX, barY + (56 - fillHeight));
    this.ammoFill.setDisplaySize(8, fillHeight);
    this.ammoFill.setFillStyle(params.danger ? 0xff5a5a : 0x4e7fff, 1);
    this.ammoOutline.setPosition(barX, barY);
    this.ammoText.setPosition(barX, barY + 74);
    this.ammoText.setText(`${Math.floor(params.ammoCount)}/${params.ammoMax}`);

    for (let index = 0; index < this.bombIcons.length; index += 1) {
      const icon = this.bombIcons[index];
      icon.setPosition(params.pointerX - 28 + index * 14, params.pointerY + 58);
      icon.setVisible(index < params.bombs);
    }
  }
}
