import type { CharacterDefinition, CharacterGalleryAssets } from "./types";
import type { FighterState } from "../battle-types";
import {
  BattleCharacter,
  BulletCmd,
  DEFAULT_POINT_COLLECT_RADIUS,
  LaserCmd,
  secondsToTicks,
  type CharacterActionContext,
} from "./base";
import { Vanilla } from "../decorators";

const NORMAL_BULLET_TEXTURE = "bullet_type_6_offset_10";
const BOMB_BULLET_TEXTURE = "bullet_type_3_offset_0";
const LASER_WINDUP_TICKS = secondsToTicks(0.4);
const LASER_DURATION_TICKS = 60;
const LASER_SPAWN_TICKS = 6;
const LASER_DESPAWN_TICKS = 6;
const LASER_THICKNESS = 16;
const FAMILIAR_FORWARD_OFFSET = 32;
const FAMILIAR_GAP = 32;
const FAST_BULLET_SIZE = 10;
const FAST_BULLET_ANGLE = degreesToRadians(20);
const FAST_BULLET_ROUND_INTERVAL = 8;
const BOMB_RADII = [96, 76, 56, 36] as const;
const BOMB_RADIUS_INTERVAL = 12;
const BOMB_TANGENT_POINTS = 8;
const BOMB_ROW_COUNT = 6;
const BOMB_ROW_SPACING = 10;
const BOMB_BULLET_SIZE = 8;
const BOMB_SELF_RING_COUNT = 24;
const BOMB_SELF_RING_VOLLEYS = 6;
const BOMB_SELF_RING_INTERVAL = 24;
const BOMB_LAST_TICK = (BOMB_SELF_RING_VOLLEYS - 1) * BOMB_SELF_RING_INTERVAL;

export class YukaBattleCharacter extends BattleCharacter {
  readonly id = "yuka" as CharacterDefinition["id"];
  readonly name = "content.characters.yuka.name";
  readonly cost = 5;
  readonly roleClass = "sniper" as CharacterDefinition["roleClass"];
  readonly moveSpeed = "high" as CharacterDefinition["moveSpeed"];
  readonly fireRate = "low" as CharacterDefinition["fireRate"];
  readonly ammoCapacity = 1;
  readonly reloadTicksPerAmmo = secondsToTicks(2);
  readonly reloadStartPolicy =
    "reset_to_zero" as CharacterDefinition["reloadStartPolicy"];
  readonly reloadCommitPolicy =
    "commit_on_finish" as CharacterDefinition["reloadCommitPolicy"];
  readonly bulletSpeed = "high" as CharacterDefinition["bulletSpeed"];
  readonly description = "content.characters.yuka.description";
  readonly gallery: CharacterGalleryAssets = {
    portraitAsset: "assets/characters/yuka/portrait.png",
    attackPreviewAsset: "assets/characters/yuka/preview.png",
    combatAsset: "assets/characters/yuka/combat.png",
  };
  readonly normalAttackId = "yuka_familiar_laser";
  readonly bombId = "yuka_shrinking_tangent_ring";
  readonly pointCollectRadius = DEFAULT_POINT_COLLECT_RADIUS;

  shoot(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    const axisAngle = this.aimAngle(fighter, aimX, aimY);
    const tier = this.pointPowerTier(fighter);
    const familiarSides =
      tier >= 3 ? [-FAMILIAR_GAP / 2, FAMILIAR_GAP / 2] : [0];

    for (const side of familiarSides) {
      const familiar = this.offsetPosition(
        fighter.x,
        fighter.y,
        axisAngle,
        FAMILIAR_FORWARD_OFFSET,
        side,
      );
      this.scheduleLaser(ctx, fighter, familiar.x, familiar.y, axisAngle);
    }

    if (tier >= 2) {
      const rounds = tier >= 4 ? 2 : 1;
      for (const angleOffset of [-FAST_BULLET_ANGLE, FAST_BULLET_ANGLE]) {
        ctx.schedule(
          new BulletCmd({
            owner: fighter.key,
            sourceCharacterId: this.id,
            textureKey: NORMAL_BULLET_TEXTURE,
            kind: "orb",
            x: fighter.x,
            y: fighter.y,
            angle: axisAngle + angleOffset,
            speedRank: "high",
            width: FAST_BULLET_SIZE,
            height: FAST_BULLET_SIZE,
            homingTicks: 0,
            damage: 20,
          }).repeat(rounds, FAST_BULLET_ROUND_INTERVAL),
        );
      }
    }
  }

  useBomb(
    ctx: CharacterActionContext,
    fighter: FighterState,
    aimX: number,
    aimY: number,
  ): void {
    this.startBomb(ctx, fighter, BOMB_LAST_TICK + 1);
    this.setInvulnerable(fighter, BOMB_LAST_TICK + 1);
    ctx.spawnEffectRing({
      x: aimX,
      y: aimY,
      scale:
        BOMB_RADII[0] / 100 -
        (BOMB_RADII[BOMB_RADII.length - 1] - BOMB_RADII[0]) /
          (100 * BOMB_RADIUS_INTERVAL * (BOMB_RADII.length - 1)),
      scalePerTick:
        (BOMB_RADII[BOMB_RADII.length - 1] - BOMB_RADII[0]) /
        (100 * BOMB_RADIUS_INTERVAL * (BOMB_RADII.length - 1)),
      tint: 0x80e050,
      duration: BOMB_RADIUS_INTERVAL * (BOMB_RADII.length - 1) + 1,
    });

    for (
      let radiusIndex = 0;
      radiusIndex < BOMB_RADII.length;
      radiusIndex += 1
    ) {
      const radius = BOMB_RADII[radiusIndex]!;
      const clockwise = radiusIndex % 2 === 1;
      for (let point = 0; point < BOMB_TANGENT_POINTS; point += 1) {
        const radialAngle = (point * Math.PI * 2) / BOMB_TANGENT_POINTS;
        const tangentAngle =
          radialAngle + (clockwise ? Math.PI / 2 : -Math.PI / 2);
        const pointPosition = this.offsetPosition(
          aimX,
          aimY,
          radialAngle,
          radius,
          0,
        );
        const rowStart = this.offsetPosition(
          pointPosition.x,
          pointPosition.y,
          tangentAngle,
          -((BOMB_ROW_COUNT - 1) * BOMB_ROW_SPACING) / 2,
          0,
        );
        ctx.schedule(
          new BulletCmd({
            owner: fighter.key,
            sourceCharacterId: this.id,
            textureKey: BOMB_BULLET_TEXTURE,
            kind: "orb",
            x: rowStart.x,
            y: rowStart.y,
            angle: tangentAngle,
            speedRank: "medium",
            width: BOMB_BULLET_SIZE,
            height: BOMB_BULLET_SIZE,
            homingTicks: 0,
            damage: 5,
          })
            .after(radiusIndex * BOMB_RADIUS_INTERVAL)
            .burstLine(BOMB_ROW_COUNT, 0, BOMB_ROW_SPACING),
        );
      }
    }

    for (let shot = 0; shot < BOMB_SELF_RING_COUNT; shot += 1) {
      ctx.schedule(
        new BulletCmd({
          owner: fighter.key,
          sourceCharacterId: this.id,
          textureKey: BOMB_BULLET_TEXTURE,
          kind: "orb",
          x: fighter.x,
          y: fighter.y,
          angle: (shot * Math.PI * 2) / BOMB_SELF_RING_COUNT,
          speedRank: "low",
          width: BOMB_BULLET_SIZE,
          height: BOMB_BULLET_SIZE,
          homingTicks: 0,
          damage: 10,
        }).repeat(BOMB_SELF_RING_VOLLEYS, BOMB_SELF_RING_INTERVAL),
      );
    }
  }

  onHit(): void {}

  private scheduleLaser(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
  ): void {
    ctx.schedule(
      new LaserCmd({
        owner: fighter.key,
        sourceCharacterId: this.id,
        x,
        y,
        angle,
        renderHeight: LASER_THICKNESS,
        initialLength: Number.POSITIVE_INFINITY,
        maxLength: Number.POSITIVE_INFINITY,
        lengthGrowthPerTick: 0,
        damage: 0,
        spawnOffset: 0,
        pinned: true,
        anchored: true,
        rayLike: true,
        expireTicks: LASER_WINDUP_TICKS,
        couldClear: false,
      }),
    );
    ctx.schedule(
      new LaserCmd({
        owner: fighter.key,
        sourceCharacterId: this.id,
        x,
        y,
        angle,
        height: LASER_THICKNESS,
        renderHeight: LASER_THICKNESS,
        laserVisualStyle: "th06",
        laserFramePairStartOffset: 1,
        laserSpawnTicks: LASER_SPAWN_TICKS,
        laserDespawnTicks: LASER_DESPAWN_TICKS,
        initialLength: Number.POSITIVE_INFINITY,
        maxLength: Number.POSITIVE_INFINITY,
        lengthGrowthPerTick: 0,
        damage: 2,
        spawnOffset: 0,
        pinned: true,
        anchored: true,
        rayLike: true,
        expireTicks: LASER_DURATION_TICKS,
        couldClear: false,
      }).after(LASER_WINDUP_TICKS),
    );
  }
}

Vanilla.registerCharacter("yuka")(YukaBattleCharacter);

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
