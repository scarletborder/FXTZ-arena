import Phaser from "phaser";
import type { BattleOutputState } from "@repo/raid-logic";

import { SIDEBAR_LEFT } from "@repo/constants";
import type { BattleViewMode } from "./stage";

export class InfoDisplayView {
  private readonly sidebarBody: Phaser.GameObjects.Text;
  private readonly mode: BattleViewMode;

  constructor(scene: Phaser.Scene, mode: BattleViewMode) {
    this.mode = mode;
    this.sidebarBody = scene.add.text(SIDEBAR_LEFT + 14, 58, "", {
      fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
      fontSize: "15px",
      color: "#d7e3ef",
      lineSpacing: 8,
    }).setWordWrapWidth(258).setDepth(11);
  }

  render(model: BattleOutputState): void {
    if (this.mode !== "training") {
      this.sidebarBody.setVisible(false);
      return;
    }

    this.sidebarBody.setVisible(true);
    this.renderSidebar(model);
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
      `判定点 (${formatCoord(player.x)}, ${formatCoord(player.y)})`,
      `靶子 ${target.activeCharacter.name}`,
      `靶判定点 (${formatCoord(target.x)}, ${formatCoord(target.y)})`,
      `靶命 ${Math.max(0, target.lives)}  bomb ${target.bombs}`,
      `总命中 ${model.stats.hits}  总伤害 ${model.stats.damage}`,
      `妖精受伤 ${immortalFairyDamage(model)}`,
      `时长 ${(model.stats.elapsedTicks / 60).toFixed(1)}s`,
    ];
    this.sidebarBody.setText(lines.join("\n"));
  }
}

function immortalFairyDamage(model: BattleOutputState): number {
  const fairy = model.neutralMobs.find((mob) => mob.kind === "immortal_fairy");
  return fairy?.damageTaken ?? 0;
}

function formatCoord(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
