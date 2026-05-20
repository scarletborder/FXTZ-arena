import type { CharacterDefinition, CharacterGalleryAssets } from "@repo/content";

import type { FighterState } from "../../types";
import type { BattleHitContext } from "../ability-cards";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";

const CLEAR_RING_TICKS = secondsToTicks(2 / 3);

export class ReimuBattleCharacter extends BattleCharacter {
  readonly id = "reimu" as CharacterDefinition["id"];
  readonly name = "博丽灵梦";
  readonly cost = 4;
  readonly roleClass = "suppress" as CharacterDefinition["roleClass"];
  readonly description = "低速诱导弹与清弹 bomb，适合压制弹幕空间。";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/reimu/portrait.png",
    attackPreviewAsset: "assets/characters/reimu/attack-preview.png",
  };
  readonly normalAttackId = "reimu_homing_shot";
  readonly bombId = "reimu_clear_bomb";
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 5;
  readonly reloadTicksPerAmmo = secondsToTicks(0.8);
  readonly reloadStartPolicy = "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy = "commit_per_ammo" as CharacterDefinition["reloadCommitPolicy"];

  shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    for (const offset of [-Math.PI / 4, 0, Math.PI / 4]) {
      this.spawnHomingOrb(ctx, fighter, angle + offset, secondsToTicks(2));
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter);
    this.setInvulnerable(fighter, secondsToTicks(2));
    const radius = this.clearProjectiles(ctx, fighter, 6);
    this.spawnClearRing(ctx, fighter, radius, 0xaec7ff, CLEAR_RING_TICKS);

    for (let index = 0; index < 12; index += 1) {
      const spawnAngle = (index / 12) * Math.PI * 2;
      const x = fighter.x + Math.cos(spawnAngle) * radius;
      const y = fighter.y + Math.sin(spawnAngle) * radius;
      const shotAngle = Math.atan2(ctx.opponent.y - y, ctx.opponent.x - x);
      this.spawnHomingOrbAt(
        ctx,
        fighter,
        x,
        y,
        shotAngle,
        secondsToTicks(1.5),
      );
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Reimu has no hit-time modifier by default.
  }

  private spawnHomingOrb(ctx: CharacterActionContext, fighter: FighterState, angle: number, homingTicks: number): void {
    this.spawnHomingOrbAt(ctx, fighter, fighter.x, fighter.y, angle, homingTicks);
  }

  private spawnHomingOrbAt(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    homingTicks: number,
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      kind: "orb",
      x,
      y,
      angle,
      speedRank: "low",
      width: hitCircleUnits(2),
      height: hitCircleUnits(1),
      homingTicks,
      spawnOffset: 0,
    });
  }
}
