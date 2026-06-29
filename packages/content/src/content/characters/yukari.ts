import type { CharacterDefinition, CharacterGalleryAssets } from "./types";

import type { FighterKey, FighterState } from "../battle-types";
import type { BattleHitContext } from "../ability-cards/base";
import {
  BattleCharacter,
  DEFAULT_POINT_COLLECT_RADIUS,
  hitCircleUnits,
  secondsToTicks,
  type BattleBulletSpawnParams,
  type BattleLaserSpawnParams,
  type CharacterActionContext,
} from "./base";
import { Vanilla } from "../decorators";
import { fp } from "@shaisrc/fixed-point";
import { fpAtan2 } from "../fp";
import {
  FamiliarMob,
  bulletSpeedRankToPixelsPerTick,
  speedRankToPixelsPerTick,
  type FamiliarMobState,
  type NeutralMobDeathSource,
} from "@repo/types";

const CENTER_TEXTURE = "bullet_type_5_offset_3";
const SIDE_TEXTURE = "bullet_type_5_offset_6";
const RAN_BULLET_TEXTURE = "bullet_type_5_offset_13";
const RAN_COMPANION_TEXTURE = "character_ran_companion";
const BOMB_BULLET_TEXTURE_PREFIX = "bullet_type_9";
const BOMB_BULLET_OFFSET_MIN = 2;
const BOMB_BULLET_OFFSET_MAX = 6;

const BULLET_HIT_SIZE = 6;
const CENTER_DAMAGE_BY_TIER = {
  1: 90,
  2: 55,
  3: 50,
  4: 45,
} as const;
const SIDE_DAMAGE = 20;
const RAN_COLLISION_DAMAGE = 1;
const RAN_HEALTH = Number.MAX_SAFE_INTEGER;
const RAN_BULLET_DAMAGE_DEFAULT = 30;
const RAN_BULLET_DAMAGE_TIER3 = 20;
const SNIPER_DAMAGE = 120;
const RAN_SPEED = "low" as const;
const RAN_KIND = "ran_familiar";
const NORMAL_BULLET_SPEED = "medium" as const;
const CENTER_SIDE_GAP = hitCircleUnits(3);
const CENTER_TIER4_GAP = hitCircleUnits(4);
const WINGMAN_FORWARD_OFFSET = -hitCircleUnits(16);
const WINGMAN_SIDE_OFFSET = hitCircleUnits(8);
const RAN_DIRECTION_ALIGN_THRESHOLD = 0.05; // radians

// Bomb — 弹幕结界
const YUKARI_BOMB_WARNING_TICKS = secondsToTicks(0.8);
const YUKARI_BOMB_HEX_SIDE_LENGTH = 328;
const YUKARI_BOMB_BULLET_SPACING = 28;
const YUKARI_BOMB_BULLETS_PER_HALF_SIDE = 6; // 6 per direction, 12 per edge
const YUKARI_BOMB_BULLET_SIZE = 12;
const YUKARI_BOMB_DAMAGE = 5;
const YUKARI_BOMB_PAUSE_TICKS = secondsToTicks(1);
const YUKARI_BOMB_INWARD_TICKS = secondsToTicks(1.1);
const YUKARI_BOMB_WARNING_HALF_WIDTH = 3;
const YUKARI_BOMB_LOCK_TICKS = secondsToTicks(4);
const YUKARI_BOMB_CLEAR_MULTIPLIER = 24;
const YUKARI_BOMB_CLEAR_DURATION = secondsToTicks(1);
const YUKARI_BOMB_RETARGET_SPEED = bulletSpeedRankToPixelsPerTick("high");

const FULL_CIRCLE = Math.PI * 2;
type PlayerFighterKey = Exclude<FighterKey, "Neutral">;

export class YukariBattleCharacter extends BattleCharacter {
  readonly id = "yukari" as CharacterDefinition["id"];
  readonly name = "content.characters.yukari.name";
  readonly cost = 5;
  readonly roleClass = "sniper" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "low" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "low" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 2;
  readonly reloadTicksPerAmmo = secondsToTicks(1);
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = NORMAL_BULLET_SPEED;
  readonly description = "content.characters.yukari.description";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/yukari/portrait.png",
    attackPreviewAsset: "assets/characters/yukari/preview.png",
    combatAsset: "assets/characters/yukari/combat.png",
  };
  readonly normalAttackId = "yukari_gap_shot";
  readonly bombId = "yukari_boundary_bomb";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);

    for (const side of centerShotSides(tier)) {
      const position = this.offsetPosition(
        fighter.x,
        fighter.y,
        angle,
        0,
        side,
      );
      this.spawnBullet(ctx, fighter, {
        x: position.x,
        y: position.y,
        angle,
        textureKey: CENTER_TEXTURE,
        damage: CENTER_DAMAGE_BY_TIER[tier],
      });
    }

    if (tier >= 3) {
      for (const side of [-WINGMAN_SIDE_OFFSET, WINGMAN_SIDE_OFFSET]) {
        const position = this.offsetPosition(
          fighter.x,
          fighter.y,
          angle,
          WINGMAN_FORWARD_OFFSET,
          side,
        );
        this.spawnBullet(ctx, fighter, {
          x: position.x,
          y: position.y,
          angle,
          textureKey: SIDE_TEXTURE,
          damage: SIDE_DAMAGE,
        });
      }
    }

    const ran = this.findRanCompanion(ctx, fighter.key);
    if (!ran) {
      return;
    }
    const ranAngle = fpAtan2(
      fp.fromFloat(aimY - ran.y),
      fp.fromFloat(aimX - ran.x),
    );
    this.fireRanBullets(ctx, fighter, ran, ranAngle, tier, angle);
  }

  useBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    this.startBomb(ctx, fighter, YUKARI_BOMB_LOCK_TICKS);
    fighter.switchLockedUntil = Math.max(
      fighter.switchLockedUntil,
      YUKARI_BOMB_LOCK_TICKS,
    );

    const radius = this.clearProjectiles(
      ctx,
      fighter,
      YUKARI_BOMB_CLEAR_MULTIPLIER,
      YUKARI_BOMB_CLEAR_DURATION,
    );
    this.spawnClearRing(
      ctx,
      fighter,
      radius,
      0xb88cff,
      YUKARI_BOMB_CLEAR_DURATION,
    );

    const vertices = regularHexagonVertices(
      aimX,
      aimY,
      YUKARI_BOMB_HEX_SIDE_LENGTH,
    );

    // Spawn warning segments along each hexagon edge.
    for (let index = 0; index < vertices.length; index += 1) {
      const from = vertices[index]!;
      const to = vertices[(index + 1) % vertices.length]!;
      ctx.spawnSegment({
        owner: fighter.key,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        halfWidth: YUKARI_BOMB_WARNING_HALF_WIDTH,
        renderHalfWidth: YUKARI_BOMB_WARNING_HALF_WIDTH,
        damage: 0,
        duration: YUKARI_BOMB_WARNING_TICKS,
        frame: ctx.frame,
        couldClear: false,
      });
      this.spawnBombEdgeBullets(ctx, fighter, from, to, aimX, aimY, index);
    }
  }

  onHit(_ctx: BattleHitContext): void {
    // Yukari has no hit-time modifier by default.
  }

  onPostUpdate(ctx: CharacterActionContext, fighter: FighterState): void {
    const existing = this.findRanCompanion(ctx, fighter.key);
    const isActive = fighter.activeCharacter.id === this.id;

    if (existing) {
      updateRanCompanion(existing, fighter, ctx.aim, isActive);
      return;
    }

    if (!ctx.spawnMob) {
      return;
    }
    ctx.spawnMob(
      new RanFamiliar(ranFamiliarId(fighter.key), fighter),
    );
  }

  onAfterFire(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const ran = this.findRanCompanion(ctx, fighter.key);
    if (!ran) {
      return;
    }

    const ranAngle = fpAtan2(
      fp.fromFloat(aimY - ran.y),
      fp.fromFloat(aimX - ran.x),
    );
    this.fireRanBullets(
      ctx,
      fighter,
      ran,
      ranAngle,
      this.pointPowerTier(fighter),
    );
  }

  private fireRanBullets(
    ctx: CharacterActionContext,
    fighter: FighterState,
    ran: RanFamiliarState,
    ranAngle: number,
    tier: number,
    fighterAngle?: number,
  ): void {
    // When the direction from Ran to crosshair is already aligned with the
    // fighter→crosshair direction, fire a single high-damage sniper bullet.
    if (fighterAngle !== undefined) {
      const angleDiff = normalizeRadians(ranAngle - fighterAngle);
      if (Math.abs(angleDiff) <= RAN_DIRECTION_ALIGN_THRESHOLD) {
        this.spawnBullet(ctx, fighter, {
          x: ran.x,
          y: ran.y,
          angle: ranAngle,
          textureKey: RAN_BULLET_TEXTURE,
          damage: SNIPER_DAMAGE,
        });
        return;
      }
    }

    for (const side of tier >= 3 ? [-CENTER_SIDE_GAP, CENTER_SIDE_GAP] : [0]) {
      const position = this.offsetPosition(ran.x, ran.y, ranAngle, 0, side);
      this.spawnBullet(ctx, fighter, {
        x: position.x,
        y: position.y,
        angle: ranAngle,
        textureKey: RAN_BULLET_TEXTURE,
        damage: tier >= 3 ? RAN_BULLET_DAMAGE_TIER3 : RAN_BULLET_DAMAGE_DEFAULT,
      });
    }
  }

  private spawnBullet(
    ctx: CharacterActionContext,
    fighter: FighterState,
    params: {
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly textureKey: string;
      readonly damage: number;
    },
  ): void {
    ctx.spawnBullet({
      owner: fighter.key,
      sourceCharacterId: this.id,
      textureKey: params.textureKey,
      kind: "orb",
      x: params.x,
      y: params.y,
      angle: params.angle,
      speedRank: NORMAL_BULLET_SPEED,
      width: BULLET_HIT_SIZE,
      height: BULLET_HIT_SIZE,
      homingTicks: 0,
      damage: params.damage,
      spawnOffset: 0,
      couldClear: false,
    });
  }

  private findRanCompanion(
    ctx: CharacterActionContext,
    owner: FighterKey,
  ): RanFamiliarState | undefined {
    if (owner === "Neutral") {
      return undefined;
    }
    return ctx.mobs
      ?.map((mob) => mob.state)
      .find(
        (mob): mob is RanFamiliarState =>
          mob.key === owner && mob.kind === RAN_KIND,
      );
  }

  private spawnBombEdgeBullets(
    ctx: CharacterActionContext,
    fighter: FighterState,
    from: HexPoint,
    to: HexPoint,
    centerX: number,
    centerY: number,
    edgeIndex: number,
  ): void {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const angleToFrom = fpAtan2(
      fp.fromFloat(from.y - midY),
      fp.fromFloat(from.x - midX),
    );
    const angleToTo = fpAtan2(
      fp.fromFloat(to.y - midY),
      fp.fromFloat(to.x - midX),
    );

    const visibleFrom = ctx.frame + YUKARI_BOMB_WARNING_TICKS;
    const startMovingAt = visibleFrom + YUKARI_BOMB_PAUSE_TICKS;
    const switchToOutwardAt = startMovingAt + YUKARI_BOMB_INWARD_TICKS;

    const offsetCount = BOMB_BULLET_OFFSET_MAX - BOMB_BULLET_OFFSET_MIN + 1;
    const fpFar = fp.fromFloat(1000);

    // Place bullets from edge centre toward each vertex.
    let dirIdx = 0;
    for (const direction of [angleToFrom, angleToTo]) {
      const fpDir = fp.fromFloat(direction);
      const fpCosDir = fp.cos(fpDir);
      const fpSinDir = fp.sin(fpDir);

      for (let k = 1; k <= YUKARI_BOMB_BULLETS_PER_HALF_SIDE; k += 1) {
        const fpDist = fp.fromFloat(k * YUKARI_BOMB_BULLET_SPACING);
        const bx = midX + fp.toFloat(fp.mul(fpCosDir, fpDist));
        const by = midY + fp.toFloat(fp.mul(fpSinDir, fpDist));

        // Cycle through offsets 2–6 in a cascading gradient along each edge.
        const offset =
          ((edgeIndex * 2 + dirIdx + k - 1) % offsetCount) +
          BOMB_BULLET_OFFSET_MIN;
        const textureKey = `${BOMB_BULLET_TEXTURE_PREFIX}_offset_${offset}`;

        // Inward phase: move toward the hexagon centre.
        const towardCenter = fpAtan2(
          fp.fromFloat(centerY - by),
          fp.fromFloat(centerX - bx),
        );
        // Outward phase: reverse direction.
        const awayFromCenter = towardCenter + Math.PI;

        const fpAway = fp.fromFloat(awayFromCenter);
        const fpCosAway = fp.cos(fpAway);
        const fpSinAway = fp.sin(fpAway);

        ctx.spawnBullet({
          owner: fighter.key,
          sourceCharacterId: this.id,
          textureKey,
          kind: "orb",
          x: bx,
          y: by,
          angle: towardCenter,
          speedRank: "low",
          width: YUKARI_BOMB_BULLET_SIZE,
          height: YUKARI_BOMB_BULLET_SIZE,
          homingTicks: 0,
          damage: YUKARI_BOMB_DAMAGE,
          spawnOffset: 0,
          frame: visibleFrom,
          pausedUntil: startMovingAt,
          retargetAt: switchToOutwardAt,
          retargetX: bx + fp.toFloat(fp.mul(fpCosAway, fpFar)),
          retargetY: by + fp.toFloat(fp.mul(fpSinAway, fpFar)),
          retargetSpeed: YUKARI_BOMB_RETARGET_SPEED,
          couldClear: true,
        });
      }
      dirIdx += 1;
    }
  }
}

function centerShotSides(tier: number): readonly number[] {
  if (tier >= 4) return [-CENTER_TIER4_GAP, 0, CENTER_TIER4_GAP];
  if (tier >= 2) return [-CENTER_SIDE_GAP, CENTER_SIDE_GAP];
  return [0];
}

function normalizeRadians(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

interface RanFamiliarState extends FamiliarMobState {
  readonly kind: typeof RAN_KIND;
  readonly textureKey: typeof RAN_COMPANION_TEXTURE;
  readonly followAimOwner: PlayerFighterKey;
  readonly followWhileActiveCharacterId: "yukari";
  damageTaken: number;
  vx: number;
  vy: number;
  angle: number;
}

class RanFamiliar extends FamiliarMob<
  RanFamiliarState,
  BattleBulletSpawnParams,
  BattleLaserSpawnParams
> {
  readonly state: RanFamiliarState;

  constructor(id: number, fighter: FighterState) {
    super();
    this.state = {
      id,
      key: playerFighterKey(fighter.key),
      mobKind: "familiar",
      kind: RAN_KIND,
      textureKey: RAN_COMPANION_TEXTURE,
      x: fighter.x,
      y: fighter.y,
      previousX: fighter.x,
      previousY: fighter.y,
      hitRadius: BULLET_HIT_SIZE,
      waveId: 0,
      movementVariant: "follow_aim",
      form: "default",
      MaxHealth: RAN_HEALTH,
      CurrentHealth: RAN_HEALTH,
      damageTaken: 0,
      active: true,
      ageTicks: 0,
      physicalAttack: true,
      physicalAttackDamage: RAN_COLLISION_DAMAGE,
      sfxFlags: 0,
      rollUntil: 0,
      rollStartedAt: 0,
      followAimOwner: playerFighterKey(fighter.key),
      followWhileActiveCharacterId: "yukari",
      vx: 0,
      vy: 0,
      angle: fighter.facing,
    };
    updateRanCompanion(this.state, fighter, undefined, true);
  }

  move(): void {
    this.state.x += this.state.vx;
    this.state.y += this.state.vy;
  }

  fire(): void {}
  switchForm(): void {}
  die(): void {
    this.state.active = true;
    this.state.CurrentHealth = RAN_HEALTH;
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) {
      return "ignored";
    }
    this.state.damageTaken += damage;
    this.state.CurrentHealth = RAN_HEALTH;
    return "accepted";
  }

  onDeath(_source: NeutralMobDeathSource): void {}
}

function playerFighterKey(key: FighterKey): PlayerFighterKey {
  if (key === "Neutral") {
    throw new Error("Ran familiar must belong to a player");
  }
  return key;
}

function ranFamiliarId(owner: FighterKey): number {
  return playerFighterKey(owner) === "Player1" ? -1001 : -1002;
}

function updateRanCompanion(
  ran: RanFamiliarState,
  fighter: FighterState,
  aim: CharacterActionContext["aim"],
  active: boolean,
): void {
  ran.active = true;
  if (!active || !aim) {
    ran.vx = 0;
    ran.vy = 0;
    return;
  }

  const dx = aim.x - ran.x;
  const dy = aim.y - ran.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001) {
    ran.vx = 0;
    ran.vy = 0;
    return;
  }

  const speed = speedRankToPixelsPerTick(RAN_SPEED);
  ran.vx = (dx / distance) * speed;
  ran.vy = (dy / distance) * speed;
  ran.angle = Math.atan2(ran.vy, ran.vx);
}

interface HexPoint {
  readonly x: number;
  readonly y: number;
}

/** Returns the 6 vertices of a regular hexagon, pointy-top orientation. */
function regularHexagonVertices(
  centerX: number,
  centerY: number,
  sideLength: number,
): readonly [HexPoint, HexPoint, HexPoint, HexPoint, HexPoint, HexPoint] {
  // Circumradius of a regular hexagon equals its side length.
  const fpRadius = fp.fromFloat(sideLength);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + (FULL_CIRCLE * index) / 6;
    const fpAngle = fp.fromFloat(angle);
    return {
      x: centerX + fp.toFloat(fp.mul(fp.cos(fpAngle), fpRadius)),
      y: centerY + fp.toFloat(fp.mul(fp.sin(fpAngle), fpRadius)),
    };
  }) as [HexPoint, HexPoint, HexPoint, HexPoint, HexPoint, HexPoint];
}

Vanilla.registerCharacter("yukari")(YukariBattleCharacter);
