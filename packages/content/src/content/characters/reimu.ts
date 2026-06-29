import { fp } from "@shaisrc/fixed-point";

import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  hitCircleUnits,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
import { Vanilla } from "../decorators";

const CLEAR_RING_TICKS = secondsToTicks(2 / 3);
const BOMB_FORWARD_DELAY_TICKS = secondsToTicks(0.5);
const BOMB_REAR_DELAY_TICKS = secondsToTicks(0.75);
const BOMB_ORB_DISTANCE = hitCircleUnits(28);
const CENTER_SHOT_HIT_SIZE = 12;
const HOMING_SHOT_HIT_SIZE = 4;
const BOMB_ORB_SIZE = 38;

const NORMALSHOOT_CENTER_DAMAGE_BY_TIER = {
  1: 50,
  2: 50,
  3: 50,
  4: 40,
} as const;
const NORMALSHOOT_HOMING_DAMAGE_BY_TIER = {
  1: 20,
  2: 20,
  3: 15,
  4: 15,
} as const;
const BOMB_ORB_DAMAGE = 95;

export class ReimuBattleCharacter extends BattleCharacter {
  readonly id = "reimu" as CharacterDefinition["id"];
  readonly name = "content.characters.reimu.name";
  readonly cost = 4;
  readonly roleClass = "suppress" as CharacterDefinition["roleClass"];
  readonly description = "content.characters.reimu.description";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/reimu/portrait.png",
    attackPreviewAsset: "assets/characters/reimu/preview.png",
    combatAsset: "assets/characters/reimu/combat.png",
  };
  readonly normalAttackId = "reimu_homing_shot";
  readonly bombId = "reimu_clear_bomb";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;
  readonly moveSpeed = "medium" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "medium" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 5;
  readonly reloadTicksPerAmmo = secondsToTicks(1.2);
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
      this.spawnCenterShots(
        ctx,
        fighter,
        angle,
        repeat * 8,
        tier >= 2,
        NORMALSHOOT_CENTER_DAMAGE_BY_TIER[tier],
      );
    }
    for (let repeat = 0; repeat < sideRepeats; repeat += 1) {
      this.spawnSideHomingShots(
        ctx,
        fighter,
        angle,
        repeat * 8,
        NORMALSHOOT_HOMING_DAMAGE_BY_TIER[tier],
      );
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
    damage: number,
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
        textureKey: "bullet_type_7_offset_2",
        kind: "orb",
        x: position.x,
        y: position.y,
        angle,
        speedRank: "medium",
        width: CENTER_SHOT_HIT_SIZE,
        height: CENTER_SHOT_HIT_SIZE,
        homingTicks: 0,
        damage,
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
    damage: number,
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
        damage,
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
      textureKey: "bullet_type_1_offset_2",
      kind: "orb",
      x,
      y,
      angle,
      speedRank: "low",
      width: HOMING_SHOT_HIT_SIZE,
      height: HOMING_SHOT_HIT_SIZE,
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
      textureKey: "bullet_type_23_offset_0",
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

Vanilla.registerCharacter("reimu")(ReimuBattleCharacter);
