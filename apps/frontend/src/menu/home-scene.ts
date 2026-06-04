import Phaser from "phaser";
import { t } from "@repo/i18n";

import { bodyStyle, createFightButton, drawBuildLabel, drawFightingBackdrop, drawTitleBlock } from "./ui";
import { installMenuAudioUnlock, type SelectionData, type SceneKey } from "./shared";
import { showPublicServerConnectivityDialog } from "./public-server-connectivity-dialog";
import { setSelfAuthed, uiSettings } from "../store/settings";
import { showLanguageDialog } from "./language-dialog";

export class HomeScene extends Phaser.Scene {
  private publicServerConnectivityDialog: Phaser.GameObjects.Container | undefined;

  constructor() {
    super("home" satisfies SceneKey);
  }

  create(): void {
    installMenuAudioUnlock(this);
    drawFightingBackdrop(this, "FXTZ ARENA", "LOCAL M5 BUILD");
    drawTitleBlock(this, "FXTZ ARENA", t("menu.subtitle"));

    const buttons = [
      { label: t("menu.start_game"), onClick: () => this.scene.start("battle-start") },
      { label: t("menu.practice_range"), onClick: () => this.scene.start("select", { mode: "training" } satisfies SelectionData) },
      { label: t("menu.codex"), onClick: () => this.scene.start("codex") },
      { label: t("menu.manual"), onClick: () => this.scene.start("manual") },
      { label: t("menu.settings"), onClick: () => this.scene.start("settings") },
    ];

    buttons.forEach((button, index) => {
      createFightButton(this, 642, 286 + index * 78, 310, 58, button.label, button.onClick);
    });

    this.add.text(1254, 674, t("menu.ai_declaration"), {
      ...bodyStyle("#9fb4c8", 14),
      align: "right",
    }).setOrigin(1, 1).setAlpha(0.82);
    this.createLanguageIcon();
    drawBuildLabel(this);
    this.showPublicServerConnectivityDialog();
  }

  private showPublicServerConnectivityDialog(): void {
    if (uiSettings.selfAuthed || this.publicServerConnectivityDialog) {
      return;
    }
    this.publicServerConnectivityDialog = showPublicServerConnectivityDialog(this, {
      onClose: () => {
        setSelfAuthed(true);
        this.publicServerConnectivityDialog = undefined;
      },
    });
  }

  private createLanguageIcon(): void {
    const size = 28;
    // 将 Container 定位在中心点，便于进行居中缩放动画
    const centerX = 1218 + size / 2; // 1232
    const centerY = 624 + size / 2; // 638
    let hovering = false;

    const container = this.add.container(centerX, centerY);
    const background = this.add.graphics();
    const globe = this.add.graphics();

    // 交互区域：使用中心对齐的矩形
    const hitArea = this.add.rectangle(0, 0, size, size, 0xffffff, 0.0001)
      .setInteractive({ useHandCursor: true });

    const draw = () => {
      // 1. 清理画布
      background.clear();
      globe.clear();

      // 2. 颜色配置 (融入了原版的金色 hover 调性)
      const bgColor = hovering ? 0x243046 : 0x151b26;          // 背景圆填充
      const bgStrokeColor = hovering ? 0xffcf6e : 0x3b4e68;    // 背景外框 (Hover时变金)

      const oceanColor = hovering ? 0x3b82f6 : 0x1d4ed8;       // 海洋 (亮蓝 / 深蓝)
      const landColor = hovering ? 0x4ade80 : 0x10b981;        // 陆地 (亮绿 / 翡翠绿)
      const globeBorderColor = hovering ? 0xffcf6e : 0x94a3b8; // 地球外轮廓 (Hover时变金)

      const gridColor = 0xffffff;                              // 经纬线颜色 (白色)
      const gridAlpha = hovering ? 0.6 : 0.3;                  // 经纬线透明度 (Hover时亮起)

      // 3. 绘制背景
      background.fillStyle(bgColor, 1).fillCircle(0, 0, 14);
      background.lineStyle(1.5, bgStrokeColor, 1).strokeCircle(0, 0, 14);

      // 4. 绘制地球底色 - 蓝色海洋 (半径 8)
      globe.fillStyle(oceanColor, 1);
      globe.fillCircle(0, 0, 8);

      // 5. 绘制地球陆地 - 绿色板块 (通过精确圆心和半径，确保完全包裹在半径 8 以内)
      globe.fillStyle(landColor, 1);
      globe.fillCircle(-3, -1, 4.5); // 左侧美洲/亚洲板块
      globe.fillCircle(3, 2, 4);     // 右下大洋洲板块
      globe.fillCircle(1, -4, 2.5);  // 上方欧洲/极地板块

      // 6. 绘制地球网格线 (叠加在陆地之上，增加科技感与细节)
      globe.lineStyle(1.1, gridColor, gridAlpha);
      globe.lineBetween(-8, 0, 8, 0);    // 赤道
      globe.lineBetween(0, -8, 0, 8);    // 本初子午线
      globe.strokeEllipse(0, 0, 9, 16);  // 经线弧度

      // 7. 绘制地球最外层轮廓线 (压在最上层使边缘更干净)
      globe.lineStyle(1.2, globeBorderColor, 1);
      globe.strokeCircle(0, 0, 8);
    };

    // 悬停事件：触发重绘与缓动缩放
    hitArea.on("pointerover", () => {
      hovering = true;
      draw();
      this.tweens.killTweensOf(container);
      this.tweens.add({
        targets: container,
        scale: 1.1,
        duration: 120,
        ease: "Quad.easeOut"
      });
    });

    // 移出事件：恢复原状
    hitArea.on("pointerout", () => {
      hovering = false;
      draw();
      this.tweens.killTweensOf(container);
      this.tweens.add({
        targets: container,
        scale: 1.0,
        duration: 120,
        ease: "Quad.easeOut"
      });
    });

    hitArea.on("pointerup", () => showLanguageDialog(this));

    container.add([background, globe, hitArea]);
    draw();
  }
}
