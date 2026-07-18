/**
 * Stage Schema — data-driven JSON format for STG stage scripting.
 *
 * A `StageDocument` is consumed by the game's `JsonMobSpawner` (via
 * `resolveMobSpawner("json:<id>")`) and edited by the maker web app. All
 * coordinates are arena pixels, angles are in degrees, and time is in
 * seconds (the interpreter converts to the engine's fixed-point ticks).
 */

export type StageMode = "versus" | "collaborate";
export type MobClass = "minion" | "elite" | "boss";
export type RewardSize = "small" | "medium" | "large";
export type BulletKind = "orb" | "knife" | "diamond" | "spark";
export type SpeedRank = "low" | "medium" | "high";
export type EaseKind =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "easeInOutSine";
export type TargetRef = "player" | "target" | "both" | "self";

export interface Vec2 {
  x: number;
  y: number;
}

export interface ArenaConfig {
  width: number;
  height: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface StageDocument {
  schemaVersion: 1;
  /** Stable id; the game registers it as mobSpawnerId `json:<id>`. */
  id: string;
  name: string;
  description?: string;
  author?: string;
  arena: ArenaConfig;
  compatibleModes: StageMode[];
  /** Enemy archetypes keyed by id (used as the mob `kind`). */
  enemyDefs: Record<string, EnemyDefinition>;
  /** Reusable bullet parameter presets keyed by id. */
  bulletPresets?: Record<string, BulletPreset>;
  /** Reusable shop configurations keyed by id. */
  shopPresets?: Record<string, ShopConfig>;
  /** Ordered timeline of the stage. */
  nodes: StageNode[];
  settings?: StageSettings;
}

export interface StageSettings {
  /** Background used when this stage is hosted on a map. */
  background?: {
    textureKey?: string;
    assetPath?: string;
    bgmKey?: string;
  };
  /** When true, the node list loops after the last node (endless mode). */
  loopNodes?: boolean;
}

export type StageNode = WaveNode | ShopNode;

export interface WaveNode {
  kind: "wave";
  id: string;
  minNextWaveSeconds: number;
  maxNextWaveSeconds: number;
  /**
   * Optional hard cap on the wave duration (seconds, measured from the wave
   * start). When set and reached, the stage advances to the next node even if
   * mobs (including bosses/elites) are still alive.
   */
  maxDurationSeconds?: number;
  /**
   * When `maxDurationSeconds` is set and reached, also clear every remaining
   * mob and bullet on screen before advancing. Ignored without a max duration.
   */
  clearOnTimeout?: boolean;
  members: WaveMemberSpec[];
}

export interface WaveMemberSpec {
  key: string;
  /** References `enemyDefs`. */
  enemyDefId: string;
  class: MobClass;
  /** Seconds after the wave starts before this member spawns. */
  spawnAtSeconds?: number;
  /** Per-instance spawn position (overrides the enemy definition). */
  spawn?: Vec2;
  /** Spawn `count` copies arranged by `formation`. */
  count?: number;
  formation?: FormationSpec;
  /** Multiplies the enemy's max health. */
  scaleHealth?: number;
}

export interface FormationSpec {
  type: "grid" | "line" | "circle" | "ring";
  columns?: number;
  spacingX?: number;
  spacingY?: number;
  radius?: number;
  /** Rotation of the formation in degrees. */
  rotationDegrees?: number;
}

export interface ShopNode {
  kind: "shop";
  id: string;
  x: number;
  y: number;
  rarityPulls: { common?: number; rare?: number };
  /** References `shopPresets`. */
  presetId?: string;
}

export interface ShopConfig {
  id: string;
  name?: string;
  rarityPulls: { common?: number; rare?: number };
}

export interface EnemyDefinition {
  id: string;
  displayName?: string;
  textureKey?: string;
  class: MobClass;
  maxHealth: number;
  hitRadius: number;
  hitWidth?: number;
  hitHeight?: number;
  rewards?: RewardConfig;
  /** Default spawn position. */
  spawn?: Vec2;
  movement?: MovementSpec;
  fire?: FireSpec[];
  /** Form switching rules (sets `state.form`). */
  forms?: FormRule[];
  death?: DeathRule;
  /** Boss / elite spell-card phases. */
  spellCard?: SpellCardConfig;
  /** Preview-only color tint (0xRRGGBB). */
  tint?: number;
}

/** The three collectable item types a mob can drop. */
export type RewardItemType = "point" | "money" | "power";

/** A quantity of one item type at one size (e.g. 3 small point items). */
export interface RewardDrop {
  type: RewardItemType;
  size: RewardSize;
  count: number;
}

export interface RewardConfig {
  /**
   * Flat list of drops; each entry is a quantity of one item size. This is the
   * primary model edited by the maker and lets a mob drop, e.g., several small
   * point items plus one large power item.
   */
  drops?: RewardDrop[];
  /** @deprecated Legacy single-size shorthand (still honored as a fallback). */
  point?: RewardSize;
  /** @deprecated Legacy single-size shorthand (still honored as a fallback). */
  money?: RewardSize;
  /** @deprecated Legacy single-size shorthand (still honored as a fallback). */
  power?: RewardSize;
}

// ───────────────────────── Movement ─────────────────────────

export type MovementSpec =
  | { type: "static"; x: number; y: number }
  | { type: "phases"; phases: MovementPhase[] }
  | MovementPhase;

export interface MovementPhase {
  /** Age (seconds) at which this phase begins. */
  startSeconds: number;
  /** Duration of the phase in seconds. */
  durationSeconds: number;
  /** When true, the path repeats until the next phase starts. */
  loop?: boolean;
  path: PathSpec;
}

export type PathSpec =
  | { kind: "point"; x: number; y: number }
  | { kind: "line"; from: Vec2; to: Vec2; ease?: EaseKind }
  | {
      kind: "bezier";
      from: Vec2;
      control: Vec2;
      to: Vec2;
      ease?: EaseKind;
    }
  | {
      kind: "circle";
      center: Vec2;
      radius: number;
      startAngleDegrees: number;
      clockwise?: boolean;
      ease?: EaseKind;
    }
  | { kind: "follow"; target: TargetRef; offsetX?: number; offsetY?: number; speed?: number }
  | { kind: "drift"; vx: number; vy: number };

// ───────────────────────── Fire / Danmaku ─────────────────────────

export interface FireSpec {
  id?: string;
  /** Age (seconds) at which firing begins. */
  startSeconds: number;
  /** Seconds between shots. */
  intervalSeconds: number;
  /** Number of shots; defaults to infinite (until death). */
  repeat?: number;
  enabled?: boolean;
  /** Only fire while this spell-card phase (0-based) is active. */
  phase?: number;
  pattern: FirePattern;
}

export type FirePattern = BulletPattern | LaserPattern;

export interface BulletParams {
  kind: BulletKind;
  textureKey?: string;
  speedRank: SpeedRank;
  width: number;
  height: number;
  damage?: number;
  homingTicks?: number;
  expireTicks?: number;
  spawnOffset?: number;
  /** Optional explicit speed (px/sec) used by the preview simulator. */
  speedPxPerSec?: number;
  /** Preview-only color (CSS string). */
  color?: string;
}

export interface BulletPatternBase {
  bullet: BulletParams;
}

export interface RingBulletPattern extends BulletPatternBase {
  type: "ring";
  count: number;
  startAngleDegrees?: number;
  /** Rotates the whole ring by this many degrees on each shot. */
  rotationDegreesPerShot?: number;
  /** Continuous rotation over time (degrees/sec). */
  rotationDegreesPerSecond?: number;
}

export interface SpreadBulletPattern extends BulletPatternBase {
  type: "spread";
  count: number;
  centerDegrees: number;
  arcDegrees: number;
}

export interface SpiralBulletPattern extends BulletPatternBase {
  type: "spiral";
  arms: number;
  count: number;
  angularSpeedDegreesPerSecond: number;
  startAngleDegrees?: number;
}

export interface AimedBulletPattern extends BulletPatternBase {
  type: "aimed";
  target: TargetRef;
  count?: number;
  spreadDegrees?: number;
}

export interface CustomBulletPattern extends BulletPatternBase {
  type: "custom";
  anglesDegrees: number[];
}

export type BulletPattern =
  | RingBulletPattern
  | SpreadBulletPattern
  | SpiralBulletPattern
  | AimedBulletPattern
  | CustomBulletPattern;

export interface LaserPattern {
  type: "laser";
  target?: TargetRef;
  /** Fixed angle when no target is used. */
  angleDegrees?: number;
  length?: number;
  width?: number;
  durationSeconds: number;
  /** Delay within the fire interval before the laser appears. */
  delaySeconds?: number;
  damage?: number;
  speedRank?: SpeedRank;
  textureKey?: string;
}

export interface BulletPreset {
  id: string;
  bullet: BulletParams;
}

// ───────────────────────── Forms / Death / SpellCard ─────────────────────────

export interface FormRule {
  when: "healthBelow" | "healthAbove" | "ageAbove" | "always";
  /** Health fraction (0..1) or seconds, depending on `when`. */
  threshold?: number;
  form: string;
}

export interface DeathRule {
  /** Kill when health reaches zero (default true). */
  onHealthZero?: boolean;
  /** Kill after this many seconds of life. */
  maxAgeSeconds?: number;
  /** Kill when the mob leaves the arena bounds. */
  leaveScreen?: boolean;
  /** Never dies from health (still respects maxAge/leaveScreen). */
  invincible?: boolean;
}

export interface SpellCardConfig {
  phases: SpellPhase[];
}

export interface SpellPhase {
  name: string;
  maxHealth: number;
  durationSeconds: number;
  /** Optional per-phase fire overrides (gated to this phase). */
  fire?: FireSpec[];
  /** Optional per-phase movement override. */
  movement?: MovementSpec;
}
