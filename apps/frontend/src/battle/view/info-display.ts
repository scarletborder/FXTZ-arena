import Phaser from "phaser";

import { END_OVERLAY_HEIGHT, END_OVERLAY_WIDTH, GAME_HEIGHT, GAME_WIDTH, HUD_TOP, SIDEBAR_LEFT } from "../constants";
import type { BattleModel } from "../model";

export class InfoDisplayView {
  private readonly sidebarBody: Phaser.GameObjects.Text;
  private readonly bottomHud: Phaser.GameObjects.Text;
  private readonly endOverlay: Phaser.GameObjects.Container;
  private readonly endTitle: Phaser.GameObjects.Text;
  private readonly endBody: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.sidebarBody = scene.add.text(SIDEBAR_LEFT + 14, 58, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "15px",
      color: "#d7e3ef",
      lineSpacing: 8,
    }).setWordWrapWidth(258).setDepth(11);
    this.bottomHud = scene.add.text(42, HUD_TOP + 12, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "15px",
      color: "#d7e3ef",
    }).setDepth(11);

    this.endOverlay = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    const overlay = scene.add.rectangle(0, 0, END_OVERLAY_WIDTH, END_OVERLAY_HEIGHT, 0x04070b, 0.92).setStrokeStyle(1, 0x273548, 1);
    this.endTitle = scene.add.text(0, -44, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "28px",
      color: "#f6f1e6",
    }).setOrigin(0.5).setDepth(20);
    this.endBody = scene.add.text(0, 10, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "18px",
      color: "#d7e3ef",
      align: "center",
    }).setOrigin(0.5).setDepth(20);
    const hint = scene.add.text(0, 64, "回车重开", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "16px",
      color: "#97b3c8",
    }).setOrigin(0.5).setDepth(20);
    this.endOverlay.add([overlay, this.endTitle, this.endBody, hint]);
    this.endOverlay.setVisible(false);
  }

  render(model: BattleModel): void {
    this.renderSidebar(model);
    this.renderBottomHud(model);
    this.renderGameOver(model);
  }

  private renderSidebar(model: BattleModel): void {
    const player = model.player;
    const target = model.target;
    const lines = [
      `玩家 ${player.activeCharacter.name}`,
      `副位 ${player.alternateCharacter.name}`,
      `命数 ${Math.max(0, player.lives)}  bomb ${player.bombs}`,
      `弹夹 ${Math.floor(player.ammo)}/${player.ammoCapacity}`,
      `能力卡 ${player.activeCard?.name ?? "无"} ${player.activeCardUses}`,
      `射击 ${player.shotsFired}  命中 ${player.hits}`,
      `靶子 ${target.activeCharacter.name}`,
      `靶命 ${Math.max(0, target.lives)}  bomb ${target.bombs}`,
      `总命中 ${model.stats.hits}  总伤害 ${model.stats.damage}`,
      `时长 ${(model.stats.elapsedTicks / 60).toFixed(1)}s`,
    ];
    this.sidebarBody.setText(lines.join("\n"));
  }

  private renderBottomHud(model: BattleModel): void {
    this.bottomHud.setText(`我方 ${model.player.lives} 命 / ${model.player.bombs} bomb / ${Math.floor(model.player.ammo)}/${model.player.ammoCapacity} 弹夹    靶子 ${model.target.lives} 命 ${model.target.bombs} bomb`);
  }

  private renderGameOver(model: BattleModel): void {
    this.endOverlay.setVisible(model.gameOver);
    this.endTitle.setText("结算");
    this.endBody.setText(`射击 ${model.stats.shots}  命中 ${model.stats.hits}\nbomb ${model.stats.bombUses}  伤害 ${model.stats.damage}`);
  }
}
