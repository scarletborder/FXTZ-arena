import Phaser from "phaser";
import type { BattleOutputState } from "@repo/raid-logic";

import { HUD_TOP, SIDEBAR_LEFT } from "@repo/constants";

export class InfoDisplayView {
  private readonly sidebarBody: Phaser.GameObjects.Text;
  private readonly bottomHud: Phaser.GameObjects.Text;

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
  }

  render(model: BattleOutputState): void {
    this.renderSidebar(model);
    this.renderBottomHud(model);
  }

  private renderSidebar(model: BattleOutputState): void {
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

  private renderBottomHud(model: BattleOutputState): void {
    this.bottomHud.setText(`我方 ${model.player.lives} 命 / ${model.player.bombs} bomb / ${Math.floor(model.player.ammo)}/${model.player.ammoCapacity} 弹夹    靶子 ${model.target.lives} 命 ${model.target.bombs} bomb`);
  }

}
