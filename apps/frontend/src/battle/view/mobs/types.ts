import type Phaser from "phaser";

export interface EnemyConfigJson {
  readonly enemy_config: readonly EnemyConfigEntry[];
}

export interface BulletConfigJson {
  readonly bullet_break_anim?: BulletBreakAnimConfig;
}

export interface BulletBreakAnimConfig {
  readonly source: string;
  readonly scale: readonly number[];
  readonly anim: readonly BulletBreakAnimFrameConfig[];
}

export interface BulletBreakAnimFrameConfig {
  readonly frame: readonly number[];
  readonly duration: number;
}

export interface BulletBreakVisualConfig {
  readonly source: string;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly frames: readonly BulletBreakVisualFrame[];
  readonly totalDurationMs: number;
}

export interface BulletBreakVisualFrame {
  readonly frame: string;
  readonly width: number;
  readonly height: number;
  readonly endTimeMs: number;
}

export interface EnemyConfigEntry {
  readonly id: string;
  readonly source: string;
  readonly rect: readonly number[];
  readonly scale: readonly number[];
  readonly anim: readonly EnemyAnimationConfig[];
}

export interface EnemyAnimationConfig {
  readonly name: string;
  readonly anim_type: "loop" | "no_loop";
  readonly anim_frames: readonly EnemyAnimationFrameConfig[];
}

export interface EnemyAnimationFrameConfig {
  readonly frame: readonly number[];
  readonly duration: number;
}

export interface EnemyVisualConfig {
  readonly id: string;
  readonly source: string;
  readonly width: number;
  readonly height: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly animations: ReadonlyMap<EnemyAnimationName, string>;
}

export type EnemyAnimationName = "default" | "turn" | "move";
export type MobVisualKind = "enemy" | "character";

export interface MobAnimationState {
  readonly textureKey: string;
  readonly visualKind: MobVisualKind;
  readonly animation: EnemyAnimationName;
  readonly characterFrame?: number;
  readonly direction: -1 | 1;
}

export interface CharacterMobMotionConfig {
  readonly frame: number;
  readonly flipX: boolean;
}

export interface MobBreakEffect {
  readonly image: Phaser.GameObjects.Image;
  readonly startedAtMs: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

export interface BossDirectionIndicatorTriangle {
  readonly tipX: number;
  readonly tipY: number;
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
}

export interface BossDirectionIndicatorPose {
  readonly centerX: number;
  readonly centerY: number;
  readonly angle: number;
}

export interface BossDirectionIndicatorState {
  current: BossDirectionIndicatorPose;
  target: BossDirectionIndicatorPose | null;
}
