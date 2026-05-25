import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
import { Vanilla } from "../decorators";

const CLEAR_RING_TICKS = secondsToTicks(2 / 3);
const BOMB_FORWARD_DELAY_TICKS = secondsToTicks(0.5);
const BOMB_REAR_DELAY_TICKS = secondsToTicks(0.75);
const BOMB_ORB_DISTANCE = hitCircleUnits(28);
const BOMB_ORB_SIZE = hitCircleUnits(16);
const BOMB_ORB_DAMAGE = 15;

@Vanilla.RegisterCharacter("reimu")
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
  readonly reloadStartPolicy =
    "keep_current" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_per_ammo" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "low" as CharacterDefinition["bulletSpeed"];

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);
    const sideRepeats = tier >= 3 ? 2 : 1;
    const centerRepeats = tier >= 4 ? 2 : 1;

    for (let repeat = 0; repeat < centerRepeats; repeat += 1) {
      this.spawnCenterShots(ctx, fighter, angle, repeat * 8, tier >= 2);
    }
    for (let repeat = 0; repeat < sideRepeats; repeat += 1) {
      this.spawnSideHomingShots(ctx, fighter, angle, repeat * 8);
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter);
    this.setInvulnerable(fighter, secondsToTicks(2));
    const radius = this.clearProjectiles(ctx, fighter, 32, CLEAR_RING_TICKS);
    this.spawnClearRing(ctx, fighter, radius, 0xaec7ff, CLEAR_RING_TICKS);

    for (const angleOffset of [-Math.PI / 6, Math.PI / 6]) {
      this.spawnBombOrb(
        ctx,
        fighter,
        fighter.facing + angleOffset,
        BOMB_FORWARD_DELAY_TICKS,
      );
    }
    for (const angleOffset of [-Math.PI / 3, 0, Math.PI / 3]) {
      this.spawnBombOrb(
        ctx,
        fighter,
        fighter.facing + Math.PI + angleOffset,
        BOMB_REAR_DELAY_TICKS,
      );
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Reimu has no hit-time modifier by default.
  }

  private spawnCenterShots(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    frameDelay: number,
    parallel: boolean,
  ): void {
    const offsets = parallel ? [-hitCircleUnits(2), hitCircleUnits(2)] : [0];
    for (const offset of offsets) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        0,
        offset,
      );
      ctx.spawnBullet({
        owner: fighter.key,
        kind: "orb",
        x: position.x,
        y: position.y,
        angle,
        speedRank: "medium",
        width: hitCircleUnits(2),
        height: hitCircleUnits(1),
        homingTicks: 0,
        damage: 10,
        spawnOffset: 0,
        frame: ctx.frame + frameDelay,
      });
    }
  }

  private spawnSideHomingShots(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    frameDelay: number,
  ): void {
    const fpAngle = fp.fromFloat(angle);
    const fpPI4 = fp.fromFloat(Math.PI / 4);
    for (const fpOffset of [fp.negate(fpPI4), fpPI4]) {
      const fpShotAngle = fp.add(fpAngle, fpOffset);
      this.spawnHomingOrbAt(
        ctx,
        fighter,
        fighter.x,
        fighter.y,
        fp.toFloat(fpShotAngle),
        secondsToTicks(2),
        frameDelay,
        frameDelay === 0 ? 15 : 10,
      );
    }
  }

  private spawnHomingOrbAt(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    homingTicks: number,
    frameDelay = 0,
    damage = 15,
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
      damage,
      spawnOffset: 0,
      frame: ctx.frame + frameDelay,
    });
  }

  private spawnBombOrb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    angle: number,
    frameDelay: number,
  ): void {
    const fpAngle = fp.fromFloat(angle);
    const fpX = fp.add(
      fp.fromFloat(fighter.x),
      fp.mul(fp.cos(fpAngle), fp.fromFloat(BOMB_ORB_DISTANCE)),
    );
    const fpY = fp.add(
      fp.fromFloat(fighter.y),
      fp.mul(fp.sin(fpAngle), fp.fromFloat(BOMB_ORB_DISTANCE)),
    );
    ctx.spawnBullet({
      owner: fighter.key,
      kind: "orb",
      x: fp.toFloat(fpX),
      y: fp.toFloat(fpY),
      angle,
      speedRank: "high",
      width: BOMB_ORB_SIZE,
      height: BOMB_ORB_SIZE,
      homingTicks: 0,
      damage: BOMB_ORB_DAMAGE,
      spawnOffset: 0,
      pausedUntil: ctx.frame + frameDelay,
      retargetAt: ctx.frame + frameDelay,
      couldClear: true,
      clearsProjectiles: true,
      piercesTargets: true,
    });
  }
}
