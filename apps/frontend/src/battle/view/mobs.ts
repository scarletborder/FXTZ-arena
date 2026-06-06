import Phaser from "phaser";

import type { NeutralMobState } from "@repo/types";
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
  private readonly animationStates = new Map<number, MobAnimationState>();
  private readonly enemyConfigs: ReadonlyMap<string, EnemyVisualConfig>;
  private readonly breakAnimConfig?: BulletBreakVisualConfig;
  private readonly breakEffects = new Map<number, MobBreakEffect>();
  private nextBreakEffectId = 1;

  constructor(private readonly scene: Phaser.Scene) {
    this.enemyConfigs = createEnemyAnimations(scene);
    this.breakAnimConfig = createBulletBreakAnimation(scene);
  }

  render(neutralMobs: readonly NeutralMobState[], alpha = 1, rollbackBlend = 1): void {
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
        sprite = this.scene.add.sprite(x, y, config.source, `${textureKey}_default_0`)
          .setOrigin(0.5)
          .setDepth(Depth.Character)
          .setDisplaySize(config.width * config.scaleX, config.height * config.scaleY);
        this.sprites.set(mob.id, sprite);
      }
      sprite.setPosition(smoothValue(sprite.x, x, rollbackBlend), smoothValue(sprite.y, y, rollbackBlend));
      sprite.setAlpha(smoothValue(sprite.alpha, 1, rollbackBlend));
      sprite.setDisplaySize(config.width * config.scaleX, config.height * config.scaleY);
      sprite.setFlipX(motion.direction < 0);
      sprite.setVisible(true);
      this.playMobAnimation(mob.id, sprite, config, motion);

      let damageTag = this.damageTags.get(mob.id);
      if (mob.kind === "immortal_fairy") {
        if (!damageTag) {
          damageTag = this.scene.add.text(x, y - 28, "", {
            fontFamily: "Arial, 'Microsoft YaHei', sans-serif",
            fontSize: "13px",
            color: "#f6f1e6",
            stroke: "#15203a",
            strokeThickness: 3,
          }).setOrigin(0.5).setDepth(Depth.FloatingText);
          this.damageTags.set(mob.id, damageTag);
        }
        damageTag.setPosition(smoothValue(damageTag.x, x, rollbackBlend), smoothValue(damageTag.y, y - 28, rollbackBlend));
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
        this.spawnBreakEffect(sprite.x, sprite.y, sprite.displayWidth, sprite.displayHeight);
        sprite.destroy();
        this.sprites.delete(id);
        this.animationStates.delete(id);
      }
    }
    for (const [id, damageTag] of this.damageTags) {
      if (!active.has(id)) {
        damageTag.destroy();
        this.damageTags.delete(id);
      }
    }
    this.renderBreakEffects();
  }

  private spawnBreakEffect(x: number, y: number, mobWidth: number, mobHeight: number): void {
    const config = this.breakAnimConfig;
    const firstFrame = config?.frames[0];
    if (!config || !firstFrame) {
      return;
    }

    const id = this.nextBreakEffectId;
    this.nextBreakEffectId += 1;
    const displaySize = breakEffectDisplaySize(config, firstFrame, mobWidth, mobHeight);
    const image = this.scene.add.image(x, y, config.source, firstFrame.frame)
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

      const frame = config.frames.find((candidate) => elapsedMs < candidate.endTimeMs)
        ?? config.frames[config.frames.length - 1];
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
