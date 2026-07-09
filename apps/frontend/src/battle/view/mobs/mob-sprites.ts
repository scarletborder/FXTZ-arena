import Phaser from "phaser";

import type { MobState } from "@repo/types";
import { DEFAULT_FAMILIAR_TEXTURE_KEY } from "@repo/content";

import { Depth } from "../../../utils/depth";
import { smoothValue } from "../smooth";
import { createEnemyAnimations } from "./enemy-animations";
import {
  characterMobDisplaySize,
  characterMobMotionConfig,
  mobMotionConfig,
} from "./motion";
import type {
  CharacterMobMotionConfig,
  EnemyAnimationName,
  EnemyVisualConfig,
  MobAnimationState,
} from "./types";

export interface RenderedMobSprite {
  readonly sprite: Phaser.GameObjects.Sprite;
}

export class MobSpriteView {
  private readonly sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private readonly animationStates = new Map<number, MobAnimationState>();
  private readonly enemyConfigs: ReadonlyMap<string, EnemyVisualConfig>;

  constructor(private readonly scene: Phaser.Scene) {
    this.enemyConfigs = createEnemyAnimations(scene);
  }

  render(
    mob: MobState,
    x: number,
    y: number,
    frame: number,
    rollbackBlend: number,
  ): RenderedMobSprite | undefined {
    if (
      mob.textureKey === "card-backdoor-familiar" ||
      mob.textureKey === "card-ufo-helper-familiar"
    ) {
      return this.renderDefensiveFamiliarSprite(mob, x, y, rollbackBlend);
    }
    if (mob.textureKey === DEFAULT_FAMILIAR_TEXTURE_KEY) {
      return this.renderDefaultFamiliarSprite(mob, x, y, rollbackBlend);
    }
    if (mob.textureKey === "character_ran_companion") {
      return this.renderRanFamiliarSprite(mob, x, y, frame, rollbackBlend);
    }

    const characterTextureKey = mob.characterId
      ? `character-combat-${mob.characterId}`
      : undefined;
    if (
      characterTextureKey !== undefined &&
      this.scene.textures.exists(characterTextureKey)
    ) {
      return this.renderCharacterMobSprite(
        mob,
        characterTextureKey,
        x,
        y,
        frame,
        rollbackBlend,
      );
    }

    return this.renderEnemyMobSprite(mob, x, y, rollbackBlend);
  }

  removeInactive(
    activeIds: ReadonlySet<number>,
    onRemoved: (sprite: Phaser.GameObjects.Sprite, id: number) => void,
  ): void {
    for (const [id, sprite] of this.sprites) {
      if (!activeIds.has(id)) {
        onRemoved(sprite, id);
        sprite.destroy();
        this.sprites.delete(id);
        this.animationStates.delete(id);
      }
    }
  }

  private renderEnemyMobSprite(
    mob: MobState,
    x: number,
    y: number,
    rollbackBlend: number,
  ): RenderedMobSprite | undefined {
    const textureKey = mob.textureKey;
    if (!textureKey) {
      return undefined;
    }
    const config = this.enemyConfigs.get(textureKey);
    if (!config) {
      return undefined;
    }
    const motion = mobMotionConfig(mob);
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
    if (sprite.texture.key !== config.source) {
      sprite.setTexture(config.source, `${textureKey}_default_0`);
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
    return { sprite };
  }

  private renderCharacterMobSprite(
    mob: MobState,
    textureKey: string,
    x: number,
    y: number,
    frame: number,
    rollbackBlend: number,
  ): RenderedMobSprite {
    const motion = characterMobMotionConfig(mob, frame);
    const displaySize = characterMobDisplaySize(mob);
    let sprite = this.sprites.get(mob.id);
    if (!sprite) {
      sprite = this.scene.add
        .sprite(x, y, textureKey, motion.frame)
        .setOrigin(0.5)
        .setDepth(Depth.Character)
        .setDisplaySize(displaySize, displaySize);
      this.sprites.set(mob.id, sprite);
    }
    if (sprite.texture.key !== textureKey) {
      sprite.setTexture(textureKey, motion.frame);
    }
    sprite.setPosition(
      smoothValue(sprite.x, x, rollbackBlend),
      smoothValue(sprite.y, y, rollbackBlend),
    );
    sprite.setAlpha(smoothValue(sprite.alpha, 1, rollbackBlend));
    sprite.setDisplaySize(displaySize, displaySize);
    sprite.setFlipX(motion.flipX);
    sprite.setVisible(true);
    this.playCharacterMobFrame(mob.id, sprite, textureKey, motion);
    return { sprite };
  }

  private renderRanFamiliarSprite(
    mob: MobState,
    x: number,
    y: number,
    frame: number,
    rollbackBlend: number,
  ): RenderedMobSprite | undefined {
    const rolling = frame < (mob.rollUntil ?? 0);
    const textureKey = rolling ? "character-ran-roll" : "character-ran-combat";
    if (!this.scene.textures.exists(textureKey)) {
      return undefined;
    }

    const angle = ranAngle(mob);
    let sprite = this.sprites.get(mob.id);
    if (!sprite) {
      sprite = this.scene.add
        .sprite(x, y, textureKey)
        .setOrigin(0.5)
        .setDepth(Depth.Character)
        .setDisplaySize(88, 88);
      this.sprites.set(mob.id, sprite);
    }
    if (sprite.texture.key !== textureKey) {
      sprite.setTexture(textureKey);
    }

    if (rolling) {
      sprite.setFrame(Math.floor(frame / 4) % 2);
      sprite.setRotation((frame - (mob.rollStartedAt ?? frame)) * 0.48);
    } else {
      const pose = combatPoseForFacing(angle);
      const animStep = Math.floor(frame / 10) % 2;
      sprite.setFrame(pose.column + animStep * 3);
      sprite.setFlipX(pose.flipX);
      sprite.setRotation(angle + Math.PI / 2);
    }

    sprite.setPosition(
      smoothValue(sprite.x, x, rollbackBlend),
      smoothValue(sprite.y, y, rollbackBlend),
    );
    sprite.setAlpha(smoothValue(sprite.alpha, 1, rollbackBlend));
    sprite.setDisplaySize(88, 88);
    sprite.setVisible(true);
    this.animationStates.set(mob.id, {
      textureKey,
      visualKind: "character",
      animation: "default",
      characterFrame: Number(sprite.frame.name) || 0,
      direction: sprite.flipX ? 1 : -1,
    });
    return { sprite };
  }

  private renderDefaultFamiliarSprite(
    mob: MobState,
    x: number,
    y: number,
    rollbackBlend: number,
  ): RenderedMobSprite | undefined {
    const textureKey = defaultFamiliarTextureKey(mob);
    if (!this.scene.textures.exists(textureKey)) {
      return undefined;
    }

    const angle = ranAngle(mob);
    const hitWidth = mob.hitWidth ?? mob.hitRadius * 2;
    const hitHeight = mob.hitHeight ?? mob.hitRadius * 2;
    const displaySize = Math.max(hitWidth, hitHeight) * 1.7;

    let sprite = this.sprites.get(mob.id);
    if (!sprite) {
      sprite = this.scene.add
        .sprite(x, y, textureKey)
        .setOrigin(0.5)
        .setDepth(Depth.Character)
        .setDisplaySize(displaySize, displaySize);
      this.sprites.set(mob.id, sprite);
    }
    if (sprite.texture.key !== textureKey) {
      sprite.setTexture(textureKey);
    }

    sprite.setPosition(
      smoothValue(sprite.x, x, rollbackBlend),
      smoothValue(sprite.y, y, rollbackBlend),
    );
    sprite.setAlpha(smoothValue(sprite.alpha, 1, rollbackBlend));
    sprite.setDisplaySize(displaySize, displaySize);
    sprite.setRotation(
      defaultFamiliarNeedsRotation(mob) ? angle + Math.PI / 2 : 0,
    );
    sprite.setVisible(true);
    this.animationStates.set(mob.id, {
      textureKey,
      visualKind: "character",
      animation: "default",
      characterFrame: 0,
      direction: 1,
    });
    return { sprite };
  }

  private renderDefensiveFamiliarSprite(
    mob: MobState,
    x: number,
    y: number,
    rollbackBlend: number,
  ): RenderedMobSprite | undefined {
    const textureKey = mob.textureKey;
    if (!textureKey || !this.scene.textures.exists(textureKey)) {
      return undefined;
    }

    const width = mob.hitWidth ?? mob.hitRadius * 2;
    const height = mob.hitHeight ?? mob.hitRadius * 2;
    const angle = ranAngle(mob);

    let sprite = this.sprites.get(mob.id);
    if (!sprite) {
      sprite = this.scene.add
        .sprite(x, y, textureKey)
        .setOrigin(0.5)
        .setDepth(Depth.Character)
        .setDisplaySize(width * 1.8, height * 1.8);
      this.sprites.set(mob.id, sprite);
    }
    if (sprite.texture.key !== textureKey) {
      sprite.setTexture(textureKey);
    }

    sprite.setPosition(
      smoothValue(sprite.x, x, rollbackBlend),
      smoothValue(sprite.y, y, rollbackBlend),
    );
    sprite.setAlpha(smoothValue(sprite.alpha, 1, rollbackBlend));
    sprite.setDisplaySize(width * 1.8, height * 1.8);
    sprite.setRotation(angle);
    sprite.setVisible(true);
    this.animationStates.set(mob.id, {
      textureKey,
      visualKind: "character",
      animation: "default",
      characterFrame: 0,
      direction: 1,
    });
    return { sprite };
  }

  private playCharacterMobFrame(
    mobId: number,
    sprite: Phaser.GameObjects.Sprite,
    textureKey: string,
    motion: CharacterMobMotionConfig,
  ): void {
    const previous = this.animationStates.get(mobId);
    if (
      previous?.visualKind === "character" &&
      previous.textureKey === textureKey &&
      previous.characterFrame === motion.frame
    ) {
      return;
    }

    sprite.anims.stop();
    sprite.setFrame(motion.frame);
    this.animationStates.set(mobId, {
      textureKey,
      visualKind: "character",
      animation: "default",
      characterFrame: motion.frame,
      direction: motion.flipX ? 1 : -1,
    });
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
      previous?.visualKind === "enemy" &&
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
      previous?.visualKind === "enemy" &&
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
      visualKind: "enemy",
      animation: motion.animation,
      direction: motion.direction,
    });
  }
}

function defaultFamiliarTextureKey(mob: MobState): string {
  const form = mob.form === "invisible" ? "invisible" : "normal";
  const motion = mob.movementVariant === "moving" ? "moving" : "static";
  return `default-familiar-${form}-${motion}`;
}

function defaultFamiliarNeedsRotation(mob: MobState): boolean {
  return mob.form === "normal" && mob.movementVariant === "moving";
}

function ranAngle(mob: MobState): number {
  const maybeAngle = (mob as MobState & { readonly angle?: number }).angle;
  if (maybeAngle !== undefined) {
    return maybeAngle;
  }
  return Math.atan2(mob.y - mob.previousY, mob.x - mob.previousX);
}

function combatPoseForFacing(angle: number): {
  readonly column: 0 | 1 | 2;
  readonly flipX: boolean;
} {
  const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
  const absSin = Math.abs(Math.sin(normalized));
  const absCos = Math.abs(Math.cos(normalized));
  if (absSin > absCos) {
    return { column: normalized < 0 ? 1 : 0, flipX: false };
  }
  return { column: 2, flipX: Math.cos(normalized) >= 0 };
}
