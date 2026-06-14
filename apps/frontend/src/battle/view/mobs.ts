import Phaser from "phaser";

import type { NeutralMobState } from "@repo/types";
import type { ArenaBounds } from "@repo/constants";
import type { FighterState } from "@repo/raid-logic";
import { Depth } from "../../utils/depth";
import { smoothValue } from "./smooth";

interface EnemyConfigJson {
  readonly enemy_config: readonly EnemyConfigEntry[];
}

interface BulletConfigJson {
  readonly bullet_break_anim?: BulletBreakAnimConfig;
}

interface BulletBreakAnimConfig {
  readonly source: string;
  readonly scale: readonly number[];
  readonly anim: readonly BulletBreakAnimFrameConfig[];
}

interface BulletBreakAnimFrameConfig {
  readonly frame: readonly number[];
  readonly duration: number;
}

interface BulletBreakVisualConfig {
  readonly source: string;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly frames: readonly BulletBreakVisualFrame[];
  readonly totalDurationMs: number;
}

interface BulletBreakVisualFrame {
  readonly frame: string;
  readonly width: number;
  readonly height: number;
  readonly endTimeMs: number;
}

interface EnemyConfigEntry {
  readonly id: string;
  readonly source: string;
  readonly rect: readonly number[];
  readonly scale: readonly number[];
  readonly anim: readonly EnemyAnimationConfig[];
}

interface EnemyAnimationConfig {
  readonly name: string;
  readonly anim_type: "loop" | "no_loop";
  readonly anim_frames: readonly EnemyAnimationFrameConfig[];
}

interface EnemyAnimationFrameConfig {
  readonly frame: readonly number[];
  readonly duration: number;
}

interface EnemyVisualConfig {
  readonly id: string;
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly animations: ReadonlyMap<EnemyAnimationName, string>;
}

type EnemyAnimationName = "default" | "turn" | "move";

interface MobAnimationState {
  readonly textureKey: string;
  readonly animation: EnemyAnimationName;
  readonly direction: -1 | 1;
}

interface MobBreakEffect {
  readonly image: Phaser.GameObjects.Image;
  readonly startedAtMs: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

interface BossDirectionIndicatorTriangle {
  readonly tipX: number;
  readonly tipY: number;
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
}

interface BossDirectionIndicatorPose {
  readonly centerX: number;
  readonly centerY: number;
  readonly angle: number;
}

interface BossDirectionIndicatorState {
  current: BossDirectionIndicatorPose;
  target: BossDirectionIndicatorPose | null;
}

const BOSS_DIRECTION_INDICATOR_DISTANCE = 180;
const BOSS_DIRECTION_INDICATOR_MIN_DISTANCE = 180;
const BOSS_DIRECTION_INDICATOR_LENGTH = 32;
const BOSS_DIRECTION_INDICATOR_WIDTH = 24;
const BOSS_DIRECTION_INDICATOR_UPDATE_INTERVAL = 10;
const BOSS_DIRECTION_INDICATOR_SMOOTH_BLEND = 0.28;

function mobMotionConfig(mob: NeutralMobState): {
  readonly animation: EnemyAnimationName;
  readonly direction: -1 | 1;
} {
  const dx = mob.x - mob.previousX;
  const dy = mob.y - mob.previousY;
  const isHorizontal = Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 0.5;
  if (!isHorizontal) {
    return { animation: "default", direction: 1 };
  }
  return { animation: "move", direction: dx < 0 ? -1 : 1 };
}

export class MobView {
  private readonly sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private readonly damageTags = new Map<number, Phaser.GameObjects.Text>();
  private readonly healthRings = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly bossDirectionIndicators: Phaser.GameObjects.Graphics;
  private readonly bossDirectionIndicatorStates = new Map<
    number,
    BossDirectionIndicatorState
  >();
  private readonly animationStates = new Map<number, MobAnimationState>();
  private readonly enemyConfigs: ReadonlyMap<string, EnemyVisualConfig>;
  private readonly breakAnimConfig?: BulletBreakVisualConfig;
  private readonly breakEffects = new Map<number, MobBreakEffect>();
  private nextBreakEffectId = 1;

  constructor(private readonly scene: Phaser.Scene) {
    this.enemyConfigs = createEnemyAnimations(scene);
    this.breakAnimConfig = createBulletBreakAnimation(scene);
    this.bossDirectionIndicators = scene.add
      .graphics()
      .setDepth(Depth.GrazeCircle + 1);
  }

  render(
    neutralMobs: readonly NeutralMobState[],
    localFighter: FighterState,
    frame: number,
    arenaBounds: ArenaBounds,
    alpha = 1,
    rollbackBlend = 1,
  ): void {
    const active = new Set<number>();

    for (const mob of neutralMobs) {
      if (!mob.active) {
        continue;
      }
      active.add(mob.id);

      const textureKey = mob.textureKey;
      if (!textureKey) {
        continue;
      }
      const config = this.enemyConfigs.get(textureKey);
      if (!config) {
        continue;
      }
      const motion = mobMotionConfig(mob);
      const x = lerp(mob.previousX, mob.x, alpha);
      const y = lerp(mob.previousY, mob.y, alpha);
      let sprite = this.sprites.get(mob.id);
      if (!sprite) {
        sprite = this.scene.add
          .sprite(x, y, config.source, `${textureKey}_default_0`)
          .setOrigin(0.5)
          .setDepth(Depth.Character)
          .setDisplaySize(
            config.width * config.scaleX,
            config.height * config.scaleY,
          );
        this.sprites.set(mob.id, sprite);
      }
      sprite.setPosition(
        smoothValue(sprite.x, x, rollbackBlend),
        smoothValue(sprite.y, y, rollbackBlend),
      );
      sprite.setAlpha(smoothValue(sprite.alpha, 1, rollbackBlend));
      sprite.setDisplaySize(
        config.width * config.scaleX,
        config.height * config.scaleY,
      );
      sprite.setFlipX(motion.direction < 0);
      sprite.setVisible(true);
      this.playMobAnimation(mob.id, sprite, config, motion);
      this.renderHealthRing(
        mob,
        x,
        y,
        sprite.displayWidth,
        sprite.displayHeight,
        rollbackBlend,
      );

      let damageTag = this.damageTags.get(mob.id);
      if (mob.kind === "immortal_fairy") {
        if (!damageTag) {
          damageTag = this.scene.add
            .text(x, y - 28, "", {
              fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
              fontSize: "13px",
              color: "#f6f1e6",
              stroke: "#15203a",
              strokeThickness: 3,
            })
            .setOrigin(0.5)
            .setDepth(Depth.FloatingText);
          this.damageTags.set(mob.id, damageTag);
        }
        damageTag.setPosition(
          smoothValue(damageTag.x, x, rollbackBlend),
          smoothValue(damageTag.y, y - 28, rollbackBlend),
        );
        damageTag.setAlpha(smoothValue(damageTag.alpha, 1, rollbackBlend));
        damageTag.setText(`[${Math.max(0, Math.floor(mob.damageTaken ?? 0))}]`);
        damageTag.setVisible(true);
      } else if (damageTag) {
        damageTag.setVisible(false);
      }
    }

    // Cleanup destroyed mobs
    for (const [id, sprite] of this.sprites) {
      if (!active.has(id)) {
        this.spawnBreakEffect(
          sprite.x,
          sprite.y,
          sprite.displayWidth,
          sprite.displayHeight,
        );
        sprite.destroy();
        this.sprites.delete(id);
        this.animationStates.delete(id);
        this.bossDirectionIndicatorStates.delete(id);
      }
    }
    for (const [id, ring] of this.healthRings) {
      if (!active.has(id)) {
        ring.destroy();
        this.healthRings.delete(id);
      }
    }
    for (const [id, damageTag] of this.damageTags) {
      if (!active.has(id)) {
        damageTag.destroy();
        this.damageTags.delete(id);
      }
    }
    this.renderBossDirectionIndicators(
      neutralMobs,
      localFighter,
      frame,
      arenaBounds,
      alpha,
    );
    this.renderBreakEffects();
  }

  private renderBossDirectionIndicators(
    neutralMobs: readonly NeutralMobState[],
    localFighter: FighterState,
    frame: number,
    arenaBounds: ArenaBounds,
    alpha: number,
  ): void {
    if (frame % BOSS_DIRECTION_INDICATOR_UPDATE_INTERVAL === 0) {
      this.updateBossDirectionIndicatorTargets(
        neutralMobs,
        localFighter,
        arenaBounds,
        alpha,
      );
    }
    this.bossDirectionIndicators.clear();
    this.bossDirectionIndicators.fillStyle(0x8f1020, 0.92);

    for (const state of this.bossDirectionIndicatorStates.values()) {
      if (!state.target) {
        continue;
      }
      state.current = smoothIndicatorPose(
        state.current,
        state.target,
        BOSS_DIRECTION_INDICATOR_SMOOTH_BLEND,
      );
      const triangle = bossDirectionIndicatorTriangleFromPose(state.current);
      this.bossDirectionIndicators.fillTriangle(
        triangle.tipX,
        triangle.tipY,
        triangle.leftX,
        triangle.leftY,
        triangle.rightX,
        triangle.rightY,
      );
    }
    this.bossDirectionIndicators.setVisible(true);
  }

  private updateBossDirectionIndicatorTargets(
    neutralMobs: readonly NeutralMobState[],
    localFighter: FighterState,
    arenaBounds: ArenaBounds,
    alpha: number,
  ): void {
    const activeIndicatorIds = new Set<number>();
    const playerX = lerp(localFighter.previousX, localFighter.x, alpha);
    const playerY = lerp(localFighter.previousY, localFighter.y, alpha);

    for (const mob of neutralMobs) {
      if (!mob.active || (mob.class !== "elite" && mob.class !== "boss")) {
        continue;
      }
      activeIndicatorIds.add(mob.id);
      const target = bossDirectionIndicatorPose(
        mob,
        playerX,
        playerY,
        arenaBounds,
        alpha,
      );
      const state = this.bossDirectionIndicatorStates.get(mob.id);
      if (!target) {
        if (state) {
          state.target = null;
        }
        continue;
      }
      if (state) {
        state.target = target;
      } else {
        this.bossDirectionIndicatorStates.set(mob.id, {
          current: bossDirectionIndicatorInitialPose(
            target,
            playerX,
            playerY,
            arenaBounds,
          ),
          target,
        });
      }
    }

    for (const id of this.bossDirectionIndicatorStates.keys()) {
      if (!activeIndicatorIds.has(id)) {
        this.bossDirectionIndicatorStates.delete(id);
      }
    }
  }

  private renderHealthRing(
    mob: NeutralMobState,
    x: number,
    y: number,
    mobWidth: number,
    mobHeight: number,
    rollbackBlend: number,
  ): void {
    const shouldRender =
      (mob.class === "elite" || mob.class === "boss") && mob.spellCard;
    let ring = this.healthRings.get(mob.id);
    if (!shouldRender || !mob.spellCard) {
      if (ring) {
        ring.setVisible(false);
      }
      return;
    }
    if (!ring) {
      ring = this.scene.add
        .graphics()
        .setDepth(Depth.GrazeCircle)
        .setVisible(true);
      this.healthRings.set(mob.id, ring);
    }

    const radius = Math.max(mobWidth, mobHeight, mob.hitRadius * 2) * 0.56;
    const ratio = clampRatio(
      mob.spellCard.currentHealth / mob.spellCard.maxHealth,
    );
    const start = -Math.PI / 2;
    const end = start - Math.PI * 2 * ratio;
    const ringX = smoothValue(ring.x, x, rollbackBlend);
    const ringY = smoothValue(ring.y, y, rollbackBlend);
    ring.setPosition(ringX, ringY);
    ring.clear();
    ring.lineStyle(5, 0x25151b, 0.72);
    ring.strokeCircle(0, 0, radius);
    ring.lineStyle(4, 0xf04444, 0.95);
    ring.beginPath();
    ring.arc(0, 0, radius, start, end, true);
    ring.strokePath();

    if (mob.spellCard.phase === "non_spell" && mob.spellCard.maxHealth > 0) {
      const markerRatio = clampRatio(
        mob.spellCard.nonSpellThresholdHealth / mob.spellCard.maxHealth,
      );
      const markerAngle = start + Math.PI * 2 * markerRatio;
      const inner = radius - 8;
      const outer = radius + 8;
      ring.lineStyle(3, 0x5dc8ff, 1);
      ring.lineBetween(
        Math.cos(markerAngle) * inner,
        Math.sin(markerAngle) * inner,
        Math.cos(markerAngle) * outer,
        Math.sin(markerAngle) * outer,
      );
    }
    ring.setAlpha(1);
    ring.setVisible(true);
  }

  private spawnBreakEffect(
    x: number,
    y: number,
    mobWidth: number,
    mobHeight: number,
  ): void {
    const config = this.breakAnimConfig;
    const firstFrame = config?.frames[0];
    if (!config || !firstFrame) {
      return;
    }

    const id = this.nextBreakEffectId;
    this.nextBreakEffectId += 1;
    const displaySize = breakEffectDisplaySize(
      config,
      firstFrame,
      mobWidth,
      mobHeight,
    );
    const image = this.scene.add
      .image(x, y, config.source, firstFrame.frame)
      .setOrigin(0.5)
      .setDepth(Depth.Effect)
      .setDisplaySize(displaySize.width, displaySize.height);
    this.breakEffects.set(id, {
      image,
      startedAtMs: this.scene.time.now,
      displayWidth: displaySize.width,
      displayHeight: displaySize.height,
    });
  }

  private renderBreakEffects(): void {
    const config = this.breakAnimConfig;
    if (!config) {
      return;
    }

    const now = this.scene.time.now;
    for (const [id, effect] of this.breakEffects) {
      const elapsedMs = now - effect.startedAtMs;
      if (elapsedMs >= config.totalDurationMs) {
        effect.image.destroy();
        this.breakEffects.delete(id);
        continue;
      }

      const frame =
        config.frames.find((candidate) => elapsedMs < candidate.endTimeMs) ??
        config.frames[config.frames.length - 1];
      effect.image.setFrame(frame.frame);
      effect.image.setDisplaySize(effect.displayWidth, effect.displayHeight);
      effect.image.setVisible(true);
    }
  }

  private playMobAnimation(
    mobId: number,
    sprite: Phaser.GameObjects.Sprite,
    config: EnemyVisualConfig,
    motion: {
      readonly animation: EnemyAnimationName;
      readonly direction: -1 | 1;
    },
  ): void {
    const previous = this.animationStates.get(mobId);
    if (
      previous?.textureKey === config.id &&
      previous.animation === motion.animation &&
      previous.direction === motion.direction
    ) {
      return;
    }

    const animationKey = config.animations.get(motion.animation);
    if (!animationKey) {
      return;
    }

    if (
      motion.animation === "move" &&
      previous?.textureKey === config.id &&
      previous.animation === "default"
    ) {
      const turnKey = config.animations.get("turn");
      if (turnKey) {
        sprite.anims.chain();
        sprite.play(turnKey, true);
        sprite.chain(animationKey);
      } else {
        sprite.anims.chain();
        sprite.play(animationKey, true);
      }
    } else {
      sprite.anims.chain();
      sprite.play(animationKey, true);
    }

    this.animationStates.set(mobId, {
      textureKey: config.id,
      animation: motion.animation,
      direction: motion.direction,
    });
  }
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function isPointInsideArena(
  x: number,
  y: number,
  arenaBounds: ArenaBounds,
): boolean {
  return x >= 0 && x <= arenaBounds.width && y >= 0 && y <= arenaBounds.height;
}

function bossDirectionIndicatorPose(
  mob: NeutralMobState,
  playerX: number,
  playerY: number,
  arenaBounds: ArenaBounds,
  alpha: number,
): BossDirectionIndicatorPose | null {
  const mobX = lerp(mob.previousX, mob.x, alpha);
  const mobY = lerp(mob.previousY, mob.y, alpha);
  const dx = mobX - playerX;
  const dy = mobY - playerY;
  const distance = Math.hypot(dx, dy);
  if (
    distance <= BOSS_DIRECTION_INDICATOR_MIN_DISTANCE ||
    !Number.isFinite(distance)
  ) {
    return null;
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const centerX = playerX + ux * BOSS_DIRECTION_INDICATOR_DISTANCE;
  const centerY = playerY + uy * BOSS_DIRECTION_INDICATOR_DISTANCE;
  const angle = Math.atan2(uy, ux);
  const triangle = bossDirectionIndicatorTriangleFromPose({
    centerX,
    centerY,
    angle,
  });

  if (
    !isPointInsideArena(triangle.tipX, triangle.tipY, arenaBounds) ||
    !isPointInsideArena(triangle.leftX, triangle.leftY, arenaBounds) ||
    !isPointInsideArena(triangle.rightX, triangle.rightY, arenaBounds)
  ) {
    return null;
  }

  return {
    centerX,
    centerY,
    angle,
  };
}

function bossDirectionIndicatorTriangleFromPose(
  pose: BossDirectionIndicatorPose,
): BossDirectionIndicatorTriangle {
  const ux = Math.cos(pose.angle);
  const uy = Math.sin(pose.angle);
  const halfLength = BOSS_DIRECTION_INDICATOR_LENGTH / 2;
  const halfWidth = BOSS_DIRECTION_INDICATOR_WIDTH / 2;
  const tipX = pose.centerX + ux * halfLength;
  const tipY = pose.centerY + uy * halfLength;
  const baseX = pose.centerX - ux * halfLength;
  const baseY = pose.centerY - uy * halfLength;
  const px = -uy;
  const py = ux;
  const leftX = baseX + px * halfWidth;
  const leftY = baseY + py * halfWidth;
  const rightX = baseX - px * halfWidth;
  const rightY = baseY - py * halfWidth;

  return {
    tipX,
    tipY,
    leftX,
    leftY,
    rightX,
    rightY,
  };
}

function bossDirectionIndicatorInitialPose(
  target: BossDirectionIndicatorPose,
  playerX: number,
  playerY: number,
  arenaBounds: ArenaBounds,
): BossDirectionIndicatorPose {
  const startDistance = Math.min(
    BOSS_DIRECTION_INDICATOR_DISTANCE,
    Math.max(0, BOSS_DIRECTION_INDICATOR_MIN_DISTANCE * 0.45),
  );
  const centerX = Phaser.Math.Clamp(
    playerX + Math.cos(target.angle) * startDistance,
    BOSS_DIRECTION_INDICATOR_LENGTH,
    Math.max(
      BOSS_DIRECTION_INDICATOR_LENGTH,
      arenaBounds.width - BOSS_DIRECTION_INDICATOR_LENGTH,
    ),
  );
  const centerY = Phaser.Math.Clamp(
    playerY + Math.sin(target.angle) * startDistance,
    BOSS_DIRECTION_INDICATOR_LENGTH,
    Math.max(
      BOSS_DIRECTION_INDICATOR_LENGTH,
      arenaBounds.height - BOSS_DIRECTION_INDICATOR_LENGTH,
    ),
  );
  return {
    centerX,
    centerY,
    angle: target.angle,
  };
}

function smoothIndicatorPose(
  current: BossDirectionIndicatorPose,
  target: BossDirectionIndicatorPose,
  blend: number,
): BossDirectionIndicatorPose {
  return {
    centerX: smoothValue(current.centerX, target.centerX, blend),
    centerY: smoothValue(current.centerY, target.centerY, blend),
    angle: smoothAngle(current.angle, target.angle, blend),
  };
}

function smoothAngle(current: number, target: number, blend: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.max(0, Math.min(1, blend));
}

function createEnemyAnimations(
  scene: Phaser.Scene,
): ReadonlyMap<string, EnemyVisualConfig> {
  const config = scene.cache.json.get("enemy-config") as
    | EnemyConfigJson
    | undefined;
  const entries = new Map<string, EnemyVisualConfig>();
  if (!config) {
    return entries;
  }

  for (const enemy of config.enemy_config) {
    if (!scene.textures.exists(enemy.source)) {
      continue;
    }
    const texture = scene.textures.get(enemy.source);
    const animations = new Map<EnemyAnimationName, string>();

    for (const anim of enemy.anim) {
      if (!isEnemyAnimationName(anim.name)) {
        continue;
      }
      const frames = anim.anim_frames.map((frame, index) => {
        const frameName = `${enemy.id}_${anim.name}_${index}`;
        if (!texture.has(frameName)) {
          texture.add(
            frameName,
            0,
            frame.frame[0],
            frame.frame[1],
            frame.frame[2],
            frame.frame[3],
          );
        }
        return {
          key: enemy.source,
          frame: frameName,
          duration: frame.duration * 1000,
        };
      });
      const animationKey = `${enemy.id}_${anim.name}`;
      if (!scene.anims.exists(animationKey)) {
        scene.anims.create({
          key: animationKey,
          frames,
          repeat: anim.anim_type === "loop" ? -1 : 0,
        });
      }
      animations.set(anim.name, animationKey);
    }

    entries.set(enemy.id, {
      id: enemy.id,
      source: enemy.source,
      width: enemy.rect[2],
      height: enemy.rect[3],
      scaleX: enemy.scale[0],
      scaleY: enemy.scale[1],
      animations,
    });
  }

  return entries;
}

function isEnemyAnimationName(name: string): name is EnemyAnimationName {
  return name === "default" || name === "turn" || name === "move";
}

function breakEffectDisplaySize(
  config: BulletBreakVisualConfig,
  frame: BulletBreakVisualFrame,
  mobWidth: number,
  mobHeight: number,
): { readonly width: number; readonly height: number } {
  const mobPadding = 1.18;
  return {
    width: Math.max(frame.width * config.scaleX, mobWidth * mobPadding),
    height: Math.max(frame.height * config.scaleY, mobHeight * mobPadding),
  };
}

function createBulletBreakAnimation(
  scene: Phaser.Scene,
): BulletBreakVisualConfig | undefined {
  const config = scene.cache.json.get("bullet-config") as
    | BulletConfigJson
    | undefined;
  const breakAnim = config?.bullet_break_anim;
  if (!breakAnim || !scene.textures.exists(breakAnim.source)) {
    return undefined;
  }

  const texture = scene.textures.get(breakAnim.source);
  let elapsedMs = 0;
  const frames = breakAnim.anim.map((animFrame, index) => {
    const frameName = `bullet_break_anim_${index}`;
    const [x, y, width, height] = animFrame.frame;
    if (!texture.has(frameName)) {
      texture.add(frameName, 0, x, y, width, height);
    }
    elapsedMs += animFrame.duration * 1000;
    return {
      frame: frameName,
      width,
      height,
      endTimeMs: elapsedMs,
    };
  });

  return {
    source: breakAnim.source,
    scaleX: breakAnim.scale[0] ?? 1,
    scaleY: breakAnim.scale[1] ?? 1,
    frames,
    totalDurationMs: elapsedMs,
  };
}
