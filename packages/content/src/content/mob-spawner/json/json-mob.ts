import { NeutralMob } from "@repo/types";
import type {
  ArenaBounds,
  NeutralMobActionContext,
  NeutralMobDeathSource,
  NeutralMobState,
} from "@repo/types";
import type {
  EnemyDefinition,
  FireSpec,
  MovementPhase,
  PathSpec,
  RewardConfig,
  RewardItemType,
  StageDocument,
  TargetRef,
  Vec2,
  BulletPattern,
  LaserPattern,
} from "@repo/stage-schema";
import type { BattleBulletSpawnParams, BattleLaserSpawnParams } from "../../characters/base";
import { secondsToTicks } from "../../seconds-to-ticks";
import type { BattleNeutralMob } from "../base";

const TICK_RATE = 60;

export interface JsonMobState extends NeutralMobState {
  readonly kind: string;
  spellPhase: number;
}

interface SpawnInit {
  readonly id: number;
  readonly waveId: number;
  readonly spawn: Vec2;
  readonly scaleHealth?: number;
}

const DEG = Math.PI / 180;

function ease(kind: string | undefined, t: number): number {
  switch (kind) {
    case "easeIn":
      return t * t;
    case "easeOut":
      return t * (2 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case "easeInOutSine":
      return -(Math.cos(Math.PI * t) - 1) / 2;
    default:
      return t;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bezier(a: number, c: number, b: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * a + 2 * mt * t * c + t * t * b;
}

interface RewardDropState {
  readonly size: "small" | "medium" | "large";
  readonly count?: number;
}

/**
 * Groups the reward config's flat `drops` list by item type into the per-type
 * drop arrays consumed by the engine's `PointManager`. Returns `undefined` per
 * type when there are no drops of that type (so the legacy single-size
 * shorthand can still be used as a fallback).
 */
function resolveRewardDrops(rewards: RewardConfig | undefined): {
  point?: RewardDropState[];
  money?: RewardDropState[];
  power?: RewardDropState[];
} {
  const out: {
    point?: RewardDropState[];
    money?: RewardDropState[];
    power?: RewardDropState[];
  } = {};
  const drops = rewards?.drops;
  if (!drops || drops.length === 0) return out;
  for (const drop of drops) {
    if (!drop || drop.count <= 0) continue;
    const type: RewardItemType = drop.type;
    (out[type] ??= []).push({ size: drop.size, count: drop.count });
  }
  return out;
}

/**
 * A neutral mob whose entire behavior (movement, danmaku, forms, death,
 * spell-card phases) is driven by a JSON `EnemyDefinition`. This is the
 * data-driven counterpart of hand-written mob classes such as ExampleFairy.
 */
export class JsonMob extends NeutralMob<JsonMobState, BattleBulletSpawnParams, BattleLaserSpawnParams> {
  readonly state: JsonMobState;
  private readonly def: EnemyDefinition;
  private readonly doc: StageDocument;
  private readonly scaleHealth: number;

  constructor(doc: StageDocument, def: EnemyDefinition, init: SpawnInit) {
    super();
    this.doc = doc;
    this.def = def;
    this.scaleHealth = init.scaleHealth ?? 1;

    const maxHealth = this.computeMaxHealth();
    const spawn = init.spawn ?? def.spawn ?? { x: 0, y: 0 };
    const drops = resolveRewardDrops(def.rewards);
    const spellCard = def.spellCard
      ? {
          phase: "spell_card" as const,
          spellCardIndex: 0,
          totalSpellCards: def.spellCard.phases.length,
          remainingSpellCards: def.spellCard.phases.length,
          currentHealth: maxHealth,
          maxHealth,
          nonSpellMaxHealth: maxHealth,
          nonSpellThresholdHealth: 0,
          remainingTicks: def.spellCard.phases[0]?.durationSeconds
            ? secondsToTicks(def.spellCard.phases[0].durationSeconds)
            : 0,
          activeSpellCardName: def.spellCard.phases[0]?.name,
          spellCards: def.spellCard.phases.map((p) => ({
            id: p.name,
            displayName: p.name,
            maxHealth: p.maxHealth,
            durationTicks: secondsToTicks(p.durationSeconds),
          })),
        }
      : undefined;

    this.state = {
      id: init.id,
      key: "Neutral",
      kind: def.id,
      class: def.class,
      textureKey: def.textureKey,
      x: spawn.x,
      y: spawn.y,
      previousX: spawn.x,
      previousY: spawn.y,
      hitRadius: def.hitRadius,
      hitWidth: def.hitWidth,
      hitHeight: def.hitHeight,
      waveId: init.waveId,
      movementVariant: def.id,
      form: def.forms?.[0]?.form ?? "default",
      MaxHealth: maxHealth,
      CurrentHealth: maxHealth,
      pointRewardSize: def.rewards?.point,
      moneyRewardSize: def.rewards?.money,
      powerRewardSize: def.rewards?.power,
      pointRewardDrops: drops.point,
      moneyRewardDrops: drops.money,
      powerRewardDrops: drops.power,
      active: true,
      ageTicks: 0,
      sfxFlags: 0,
      spellPhase: 0,
      spellCard,
    };
  }

  private computeMaxHealth(): number {
    if (this.def.spellCard && this.def.spellCard.phases.length > 0) {
      return this.def.spellCard.phases.reduce((sum, p) => sum + p.maxHealth, 0) * this.scaleHealth;
    }
    return Math.max(1, Math.round(this.def.maxHealth * this.scaleHealth));
  }

  static fromSnapshot(doc: StageDocument, snapshot: NeutralMobState): BattleNeutralMob | undefined {
    const def = doc.enemyDefs[snapshot.kind];
    if (!def) return undefined;
    const mob = new JsonMob(doc, def, {
      id: snapshot.id,
      waveId: snapshot.waveId,
      spawn: { x: snapshot.x, y: snapshot.y },
    });
    mob.restore(snapshot as JsonMobState);
    return mob;
  }

  move(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    const movement = this.activeMovement();
    if (!movement) {
      const spawn = this.def.spawn;
      if (spawn) {
        this.state.x = spawn.x;
        this.state.y = spawn.y;
      }
      return;
    }
    const ageSeconds = this.state.ageTicks / TICK_RATE;
    const phase = this.resolvePhase(movement, ageSeconds);
    if (!phase) return;
    this.applyPath(phase.path, ageSeconds, phase, ctx.arenaBounds);
  }

  private activeMovement() {
    const sc = this.def.spellCard;
    if (sc && sc.phases[this.state.spellPhase]?.movement) {
      return sc.phases[this.state.spellPhase]!.movement;
    }
    return this.def.movement;
  }

  private resolvePhase(
    movement: EnemyDefinition["movement"],
    ageSeconds: number,
  ): MovementPhase | undefined {
    if (!movement) return undefined;
    if ("type" in movement) {
      if (movement.type === "static") {
        return { startSeconds: 0, durationSeconds: Infinity, path: { kind: "point", x: movement.x, y: movement.y } };
      }
      if (movement.type === "phases") {
        let chosen: MovementPhase | undefined;
        for (const p of movement.phases) {
          if (ageSeconds >= p.startSeconds) chosen = p;
        }
        return chosen;
      }
      return undefined;
    }
    // Bare MovementPhase (no discriminant).
    return ageSeconds >= movement.startSeconds ? movement : undefined;
  }

  private applyPath(
    path: PathSpec,
    ageSeconds: number,
    phase: MovementPhase,
    _bounds: ArenaBounds,
  ): void {
    const local = ageSeconds - phase.startSeconds;
    const dur = phase.durationSeconds;
    if (path.kind === "follow" || path.kind === "drift") {
      this.applyIncrementalPath(path);
      return;
    }
    const rawT = dur === Infinity ? 0 : clamp01(local / dur);
    const t = phase.loop ? (dur === Infinity ? 0 : (local % dur) / dur) : rawT;
    switch (path.kind) {
      case "point":
        this.state.x = path.x;
        this.state.y = path.y;
        break;
      case "line":
        this.state.x = lerp(path.from.x, path.to.x, ease(path.ease, t));
        this.state.y = lerp(path.from.y, path.to.y, ease(path.ease, t));
        break;
      case "bezier":
        this.state.x = bezier(path.from.x, path.control.x, path.to.x, ease(path.ease, t));
        this.state.y = bezier(path.from.y, path.control.y, path.to.y, ease(path.ease, t));
        break;
      case "circle": {
        const dir = path.clockwise ? -1 : 1;
        const ang = (path.startAngleDegrees + dir * t * 360) * DEG;
        this.state.x = path.center.x + path.radius * Math.cos(ang);
        this.state.y = path.center.y + path.radius * Math.sin(ang);
        break;
      }
    }
  }

  private applyIncrementalPath(path: PathSpec): void {
    const dt = 1 / TICK_RATE;
    if (path.kind === "drift") {
      this.state.x += path.vx * dt;
      this.state.y += path.vy * dt;
      return;
    }
    if (path.kind !== "follow") return;
    // follow: move toward the referenced target at a fixed speed.
    const target = this.resolveTarget(path.target);
    if (!target) return;
    const speed = path.speed ?? 120;
    const dx = target.x - this.state.x;
    const dy = target.y - this.state.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = speed * dt;
    if (dist <= step) {
      this.state.x = target.x;
      this.state.y = target.y;
    } else {
      this.state.x += (dx / dist) * step;
      this.state.y += (dy / dist) * step;
    }
  }

  private resolveTarget(ref: TargetRef): Vec2 | undefined {
    switch (ref) {
      case "player":
        return this.lastPlayer;
      case "target":
        return this.lastTarget;
      case "both":
      case "self":
      default:
        return this.lastPlayer;
    }
  }

  private lastPlayer: Vec2 = { x: 0, y: 0 };
  private lastTarget: Vec2 = { x: 0, y: 0 };

  fire(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    this.lastPlayer = { x: ctx.player.x, y: ctx.player.y };
    this.lastTarget = { x: ctx.target.x, y: ctx.target.y };

    const specs = this.activeFireSpecs();
    const ageTicks = this.state.ageTicks;
    for (const spec of specs) {
      if (spec.enabled === false) continue;
      if (spec.phase !== undefined && spec.phase !== this.state.spellPhase) continue;
      const startTick = secondsToTicks(spec.startSeconds);
      const intervalTick = Math.max(1, Math.round(spec.intervalSeconds * TICK_RATE));
      if (ageTicks < startTick) continue;
      const since = ageTicks - startTick;
      if (since % intervalTick !== 0) continue;
      const shotIndex = since / intervalTick;
      if (spec.repeat !== undefined && shotIndex >= spec.repeat) continue;
      this.emitPattern(spec.pattern, shotIndex, spec.intervalSeconds, ctx);
    }
  }

  private activeFireSpecs(): FireSpec[] {
    const sc = this.def.spellCard;
    if (sc && sc.phases[this.state.spellPhase]?.fire) {
      return sc.phases[this.state.spellPhase]!.fire!;
    }
    return this.def.fire ?? [];
  }

  private emitPattern(
    pattern: BulletPattern | LaserPattern,
    shotIndex: number,
    intervalSeconds: number,
    ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  ): void {
    if (pattern.type === "laser") {
      this.emitLaser(pattern, ctx);
      return;
    }
    const b = pattern.bullet;
    const angles = this.computePatternAngles(pattern, shotIndex, intervalSeconds, ctx);
    for (const angleDeg of angles) {
      ctx.spawnBullet({
        owner: ctx.owner,
        textureKey: b.textureKey,
        kind: b.kind,
        x: this.state.x,
        y: this.state.y,
        angle: angleDeg * DEG,
        speedRank: b.speedRank,
        width: b.width,
        height: b.height,
        homingTicks: b.homingTicks ?? 0,
        damage: b.damage ?? 1,
        spawnOffset: b.spawnOffset ?? 28,
        expireTicks: b.expireTicks,
      });
    }
  }

  private computePatternAngles(
    pattern: BulletPattern,
    shotIndex: number,
    intervalSeconds: number,
    ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  ): number[] {
    const b = pattern.bullet;
    void b;
    switch (pattern.type) {
      case "ring": {
        const base = (pattern.rotationDegreesPerSecond ?? 0) * (this.state.ageTicks / TICK_RATE);
        const rot = (pattern.rotationDegreesPerShot ?? 0) * shotIndex + base;
        const start = pattern.startAngleDegrees ?? 0;
        const out: number[] = [];
        for (let i = 0; i < pattern.count; i++) {
          out.push(start + (360 / pattern.count) * i + rot);
        }
        return out;
      }
      case "spread": {
        const out: number[] = [];
        const n = Math.max(1, pattern.count);
        for (let i = 0; i < n; i++) {
          const f = n === 1 ? 0.5 : i / (n - 1);
          out.push(pattern.centerDegrees - pattern.arcDegrees / 2 + pattern.arcDegrees * f);
        }
        return out;
      }
      case "spiral": {
        const rot = pattern.angularSpeedDegreesPerSecond * (shotIndex * intervalSeconds);
        const start = pattern.startAngleDegrees ?? 0;
        const out: number[] = [];
        for (let arm = 0; arm < pattern.arms; arm++) {
          for (let k = 0; k < pattern.count; k++) {
            out.push(start + (360 / pattern.arms) * arm + rot + k * 7);
          }
        }
        return out;
      }
      case "aimed": {
        const targets = this.resolveAimTargets(pattern.target, ctx);
        const out: number[] = [];
        const count = Math.max(1, pattern.count ?? 1);
        const spread = pattern.spreadDegrees ?? 0;
        for (const tgt of targets) {
          const base = Math.atan2(tgt.y - this.state.y, tgt.x - this.state.x) / DEG;
          for (let i = 0; i < count; i++) {
            const f = count === 1 ? 0.5 : i / (count - 1);
            out.push(base - spread / 2 + spread * f);
          }
        }
        return out;
      }
      case "custom":
        return pattern.anglesDegrees;
      default:
        return [];
    }
  }

  private resolveAimTargets(
    ref: TargetRef,
    ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  ): Vec2[] {
    switch (ref) {
      case "player":
        return [{ x: ctx.player.x, y: ctx.player.y }];
      case "target":
        return [{ x: ctx.target.x, y: ctx.target.y }];
      case "both":
        return [
          { x: ctx.player.x, y: ctx.player.y },
          { x: ctx.target.x, y: ctx.target.y },
        ];
      default:
        return [{ x: ctx.player.x, y: ctx.player.y }];
    }
  }

  private emitLaser(
    pattern: LaserPattern,
    ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>,
  ): void {
    let angleDeg = pattern.angleDegrees ?? 90;
    if (pattern.target && pattern.target !== "self") {
      const tgt = this.resolveAimTargets(pattern.target, ctx)[0];
      if (tgt) angleDeg = Math.atan2(tgt.y - this.state.y, tgt.x - this.state.x) / DEG;
    }
    ctx.spawnLaser({
      owner: ctx.owner,
      textureKey: pattern.textureKey,
      kind: "laser",
      x: this.state.x,
      y: this.state.y,
      angle: angleDeg * DEG,
      speedRank: pattern.speedRank ?? "medium",
      width: pattern.width ?? 16,
      height: pattern.length ?? 1200,
      laserSpawnTicks: Math.round((pattern.delaySeconds ?? 0) * TICK_RATE),
      laserDespawnTicks: Math.round(pattern.durationSeconds * TICK_RATE),
      damage: pattern.damage ?? 3,
    });
  }

  switchForm(): void {
    // Spell-card phase tracking.
    if (this.def.spellCard && this.def.spellCard.phases.length > 0) {
      const total = this.def.spellCard.phases.reduce((s, p) => s + p.maxHealth, 0);
      let boundary = total;
      let active = 0;
      for (let i = 0; i < this.def.spellCard.phases.length; i++) {
        boundary -= this.def.spellCard.phases[i]!.maxHealth;
        if (this.state.CurrentHealth > boundary) {
          active = i;
          break;
        }
        active = i;
      }
      if (active !== this.state.spellPhase) {
        this.state.spellPhase = active;
        if (this.state.spellCard) {
          this.state.spellCard = {
            ...this.state.spellCard,
            spellCardIndex: active,
            activeSpellCardName: this.def.spellCard.phases[active]!.name,
            remainingTicks: secondsToTicks(this.def.spellCard.phases[active]!.durationSeconds),
          };
        }
      }
    }

    const forms = this.def.forms;
    if (!forms || forms.length === 0) return;
    const ageSeconds = this.state.ageTicks / TICK_RATE;
    const healthFrac = this.state.MaxHealth > 0 ? this.state.CurrentHealth / this.state.MaxHealth : 0;
    let form = this.state.form;
    for (const rule of forms) {
      let match = false;
      switch (rule.when) {
        case "healthBelow":
          match = healthFrac < (rule.threshold ?? 0);
          break;
        case "healthAbove":
          match = healthFrac > (rule.threshold ?? 1);
          break;
        case "ageAbove":
          match = ageSeconds > (rule.threshold ?? 0);
          break;
        case "always":
          match = true;
          break;
      }
      if (match) form = rule.form;
    }
    this.state.form = form;
  }

  die(ctx: NeutralMobActionContext<BattleBulletSpawnParams, BattleLaserSpawnParams>): void {
    const death = this.def.death;
    if (death?.invincible) {
      if (death.maxAgeSeconds !== undefined && this.state.ageTicks >= secondsToTicks(death.maxAgeSeconds)) {
        this.state.active = false;
        return;
      }
      if (death.leaveScreen && this.isOffscreen(ctx.arenaBounds)) {
        this.state.active = false;
      }
      return;
    }
    if ((death?.onHealthZero ?? true) && this.state.CurrentHealth <= 0) {
      this.state.active = false;
      return;
    }
    if (death?.maxAgeSeconds !== undefined && this.state.ageTicks >= secondsToTicks(death.maxAgeSeconds)) {
      this.state.active = false;
      return;
    }
    if (death?.leaveScreen && this.isOffscreen(ctx.arenaBounds)) {
      this.state.active = false;
    }
  }

  private isOffscreen(bounds: ArenaBounds): boolean {
    const pad = bounds.width * 0.25;
    return (
      this.state.x < -pad ||
      this.state.x > bounds.width + pad ||
      this.state.y < -pad ||
      this.state.y > bounds.height + pad
    );
  }

  onProjectileHit(damage: number): "accepted" | "ignored" {
    if (!this.state.active || damage <= 0) return "ignored";
    if (this.def.death?.invincible) return "ignored";
    this.state.CurrentHealth = Math.max(0, this.state.CurrentHealth - damage);
    if (this.state.spellCard) {
      this.state.spellCard = { ...this.state.spellCard, currentHealth: this.state.CurrentHealth };
    }
    if (this.state.CurrentHealth <= 0) {
      this.state.active = false;
    }
    return "accepted";
  }

  onDeath(_source: NeutralMobDeathSource): void {
    // Drops are handled by the model via mob state reward sizes.
  }

  onDeathEffect(): void {
    // No-op.
  }
}
