import Phaser from "phaser";

import type { NeutralMobState } from "@repo/types";

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
    mob: NeutralMobState,
    x: number,
    y: number,
    frame: number,
    rollbackBlend: number,
  ): RenderedMobSprite | undefined {
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
    mob: NeutralMobState,
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
    mob: NeutralMobState,
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
