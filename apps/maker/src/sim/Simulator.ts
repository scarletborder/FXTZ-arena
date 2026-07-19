import type {
  StageDocument,
  EnemyDefinition,
  MovementSpec,
  MovementPhase,
  PathSpec,
  BulletPattern,
  LaserPattern,
  FireSpec,
  TargetRef,
  Vec2,
  MobClass,
} from "@repo/stage-schema";
import { transformVec2 } from "@repo/stage-schema";

/** Seconds over which a movement-phase change is blended for smooth handoff. */
const PHASE_BLEND_SECONDS = 0.4;
const SPEED_PX_PER_SEC: Record<string, number> = {
  low: 240,
  medium: 420,
  high: 660,
};
const DEG = Math.PI / 180;

export interface SimMob {
  id: number;
  defId: string;
  class: MobClass;
  x: number;
  y: number;
  ageSeconds: number;
  maxHealth: number;
  currentHealth: number;
  form: string;
  spellPhase: number;
  tint: number;
  fireState: { nextShotAt: number; shots: number }[];
  dead: boolean;
  /** Active movement-phase index (-1 before any phase begins). */
  phaseIndex: number;
  /** Mob position captured when the current phase began (for blending). */
  phaseEnterX: number;
  phaseEnterY: number;
  phaseEnterAge: number;
}

export interface SimBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
}

export interface SimShop {
  id: string;
  x: number;
  y: number;
}

interface FireRuntime {
  nextShotAt: number;
  shots: number;
}

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function bezier(a: number, c: number, b: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * a + 2 * mt * t * c + t * t * b;
}

export class Simulator {
  stage: StageDocument;
  width: number;
  height: number;
  time = 0;
  playing = false;
  speed = 1;
  mobs: SimMob[] = [];
  bullets: SimBullet[] = [];
  shops: SimShop[] = [];
  nodeIndex = 0;
  waveStart = 0;
  spawned = new Set<string>();
  finished = false;
  /** When set, the preview starts at this node instead of the first. */
  focusNodeIndex: number | null = null;
  private nextMobId = 1;

  constructor(stage: StageDocument) {
    this.stage = stage;
    this.width = stage.arena.width;
    this.height = stage.arena.height;
  }

  reset(): void {
    this.time = 0;
    this.mobs = [];
    this.bullets = [];
    this.shops = [];
    this.nodeIndex = this.focusNodeIndex ?? 0;
    this.waveStart = 0;
    this.spawned.clear();
    this.finished = false;
    this.nextMobId = 1;
  }

  /** Focus the preview on a single node (null = whole project), then reset. */
  setFocus(index: number | null): void {
    this.focusNodeIndex =
      index !== null && index >= 0 && index < this.stage.nodes.length
        ? index
        : null;
    this.reset();
  }

  private playerTarget(): Vec2 {
    return { x: this.width * 0.3, y: this.height * 0.75 };
  }
  private targetTarget(): Vec2 {
    return { x: this.width * 0.7, y: this.height * 0.75 };
  }

  step(dt: number): void {
    if (!this.playing || this.finished) return;
    const scaled = dt * this.speed;
    this.time += scaled;
    this.advanceSpawner(scaled);
    for (const mob of this.mobs) this.stepMob(mob, scaled);
    this.mobs = this.mobs.filter((m) => !m.dead);
    for (const b of this.bullets) {
      b.x += b.vx * scaled;
      b.y += b.vy * scaled;
      b.life -= scaled;
    }
    this.bullets = this.bullets.filter(
      (b) =>
        b.life > 0 &&
        b.x > -100 &&
        b.x < this.width + 100 &&
        b.y > -100 &&
        b.y < this.height + 100,
    );
  }

  private advanceSpawner(dt: number): void {
    const node = this.stage.nodes[this.nodeIndex];
    if (!node) {
      if (this.stage.settings?.loopNodes && this.stage.nodes.length > 0) {
        this.nodeIndex = 0;
        this.waveStart = this.time;
        this.spawned.clear();
        return;
      }
      this.finished = true;
      return;
    }
    if (node.kind === "shop") {
      this.shops = [{ id: node.id, x: node.x, y: node.y }];
      // Advance after a short display window.
      if (this.time - this.waveStart > 4) {
        this.shops = [];
        this.nextNode();
      }
      return;
    }
    // wave
    this.shops = [];
    const elapsed = this.time - this.waveStart;

    // Hard cap: force-advance (and optionally clear) after maxDurationSeconds.
    if (node.maxDurationSeconds !== undefined && elapsed >= node.maxDurationSeconds) {
      if (node.clearOnTimeout) {
        this.mobs = [];
        this.bullets = [];
      }
      this.nextNode();
      return;
    }

    for (const member of node.members) {
      const key = `${node.id}:${member.key}`;
      if (this.spawned.has(key)) continue;
      const at = member.spawnAtSeconds ?? 0;
      if (elapsed >= at) {
        this.spawned.add(key);
        this.spawnMember(member.enemyDefId, member.class, member.spawn, member.count, member.scaleHealth);
        // Cooperate symmetry: also spawn a reflected copy of this member.
        if (member.symmetry && member.spawn) {
          const mirrored = transformVec2(member.spawn, {
            kind: member.symmetry,
            width: this.width,
            height: this.height,
          });
          this.spawnMember(member.enemyDefId, member.class, mirrored, member.count, member.scaleHealth);
        }
      }
    }
    const allSpawned = node.members.every((m) => this.spawned.has(`${node.id}:${m.key}`));
    const minWait = node.minNextWaveSeconds;
    const mobsAlive = this.mobs.length > 0;
    if (allSpawned && elapsed >= minWait && (!mobsAlive || elapsed >= node.maxNextWaveSeconds)) {
      this.nextNode();
    }
    void dt;
  }

  private nextNode(): void {
    this.nodeIndex += 1;
    this.waveStart = this.time;
    this.spawned.clear();
  }

  private spawnMember(
    defId: string,
    cls: MobClass,
    spawn?: Vec2,
    count = 1,
    scaleHealth = 1,
  ): void {
    const def = this.stage.enemyDefs[defId];
    if (!def) return;
    const base = spawn ?? def.spawn ?? { x: this.width / 2, y: -40 };
    const n = Math.max(1, count);
    for (let i = 0; i < n; i++) {
      const ox = (i - (n - 1) / 2) * 48;
      const maxHealth = def.spellCard
        ? def.spellCard.phases.reduce((s, p) => s + p.maxHealth, 0) * scaleHealth
        : Math.max(1, Math.round(def.maxHealth * scaleHealth));
      const initFire = def.spellCard?.phases[0]?.fire ?? def.fire ?? [];
      const fireState: FireRuntime[] = initFire.map(() => ({
        nextShotAt: 0,
        shots: 0,
      }));
      this.mobs.push({
        id: this.nextMobId++,
        defId,
        class: cls,
        x: base.x + ox,
        y: base.y,
        ageSeconds: 0,
        maxHealth,
        currentHealth: maxHealth,
        form: def.forms?.[0]?.form ?? "default",
        spellPhase: 0,
        tint: def.tint ?? 0x9b8cff,
        fireState,
        dead: false,
        phaseIndex: -1,
        phaseEnterX: base.x + ox,
        phaseEnterY: base.y,
        phaseEnterAge: 0,
      });
    }
  }

  private stepMob(mob: SimMob, dt: number): void {
    const def = this.stage.enemyDefs[mob.defId];
    if (!def) {
      mob.dead = true;
      return;
    }
    mob.ageSeconds += dt;
    // Active movement/fire come from the current spell-card phase when present
    // (elite/boss), falling back to the top-level fields (minion/legacy).
    const sc = def.spellCard;
    const activePhase = sc && sc.phases.length > 0 ? sc.phases[mob.spellPhase] : undefined;
    const movement = activePhase?.movement ?? def.movement;
    const specs = activePhase?.fire ?? def.fire ?? [];
    // Reset fire timing state whenever the active fire list changes length
    // (e.g. on spell-card phase handoff).
    if (mob.fireState.length !== specs.length) {
      mob.fireState = specs.map(() => ({ nextShotAt: 0, shots: 0 }));
    }
    // movement (phase-aware, with smooth blending across phase handoffs)
    this.applyMovement(mob, movement, dt);
    // fire
    specs.forEach((spec, idx) => {
      if (spec.enabled === false) return;
      const fs = mob.fireState[idx]!;
      if (fs.nextShotAt === 0) fs.nextShotAt = spec.startSeconds;
      if (mob.ageSeconds >= fs.nextShotAt) {
        if (spec.repeat === undefined || fs.shots < spec.repeat) {
          this.emitPattern(spec.pattern, fs.shots, spec.intervalSeconds, mob, def);
          fs.shots += 1;
          fs.nextShotAt += spec.intervalSeconds;
        }
      }
    });
    // forms
    if (def.forms) {
      const hf = mob.maxHealth > 0 ? mob.currentHealth / mob.maxHealth : 0;
      for (const rule of def.forms) {
        let match = false;
        switch (rule.when) {
          case "healthBelow":
            match = hf < (rule.threshold ?? 0);
            break;
          case "healthAbove":
            match = hf > (rule.threshold ?? 1);
            break;
          case "ageAbove":
            match = mob.ageSeconds > (rule.threshold ?? 0);
            break;
          case "always":
            match = true;
            break;
        }
        if (match) mob.form = rule.form;
      }
    }
    // spell card phase
    if (def.spellCard && def.spellCard.phases.length > 0) {
      const total = def.spellCard.phases.reduce((s, p) => s + p.maxHealth, 0);
      let boundary = total;
      let active = 0;
      for (let i = 0; i < def.spellCard.phases.length; i++) {
        boundary -= def.spellCard.phases[i]!.maxHealth;
        if (mob.currentHealth > boundary) {
          active = i;
          break;
        }
        active = i;
      }
      mob.spellPhase = active;
    }
    // death
    const death = def.death;
    const offscreen = death?.leaveScreen ? this.isMobOffscreen(mob) : false;
    if (death?.invincible) {
      if (death.maxAgeSeconds !== undefined && mob.ageSeconds >= death.maxAgeSeconds) mob.dead = true;
      if (offscreen) mob.dead = true;
    } else {
      if ((death?.onHealthZero ?? true) && mob.currentHealth <= 0) mob.dead = true;
      if (death?.maxAgeSeconds !== undefined && mob.ageSeconds >= death.maxAgeSeconds) mob.dead = true;
      if (offscreen) mob.dead = true;
    }
  }

  private isMobOffscreen(mob: SimMob): boolean {
    const pad = this.width * 0.25;
    return (
      mob.x < -pad ||
      mob.x > this.width + pad ||
      mob.y < -pad ||
      mob.y > this.height + pad
    );
  }

  private applyMovement(mob: SimMob, movement: MovementSpec | undefined, dt: number): void {
    if (!movement) return;
    const resolved = resolvePhaseIndexed(movement, mob.ageSeconds);
    if (!resolved) return;
    const { phase, index } = resolved;

    // Capture the entry position whenever the active phase changes so the next
    // phase starts from wherever the mob currently is (avoids hard jumps).
    if (index !== mob.phaseIndex) {
      mob.phaseIndex = index;
      mob.phaseEnterX = mob.x;
      mob.phaseEnterY = mob.y;
      mob.phaseEnterAge = mob.ageSeconds;
    }

    const path = phase.path;
    if (path.kind === "follow" || path.kind === "drift") {
      // Incremental paths are naturally continuous.
      const p = incrementalStep(path, mob.x, mob.y, this.playerTarget(), this.targetTarget(), dt);
      mob.x = p.x;
      mob.y = p.y;
      return;
    }

    const target = computePathPosition(phase, mob.ageSeconds);
    const blend = Math.min(1, (mob.ageSeconds - mob.phaseEnterAge) / PHASE_BLEND_SECONDS);
    const bt = ease("easeInOut", blend);
    mob.x = lerp(mob.phaseEnterX, target.x, bt);
    mob.y = lerp(mob.phaseEnterY, target.y, bt);
  }

  damageMob(mobId: number, dmg: number): void {
    const mob = this.mobs.find((m) => m.id === mobId);
    if (mob && !mob.dead) mob.currentHealth = Math.max(0, mob.currentHealth - dmg);
  }

  private emitPattern(
    pattern: BulletPattern | LaserPattern,
    shotIndex: number,
    intervalSeconds: number,
    mob: SimMob,
    def: EnemyDefinition,
  ): void {
    if (pattern.type === "laser") {
      // Represent a laser as a fast thin bullet along its direction for preview.
      const ang = this.laserAngle(pattern, mob);
      const speed = SPEED_PX_PER_SEC[pattern.speedRank ?? "medium"];
      this.bullets.push({
        x: mob.x,
        y: mob.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        color: "#ff3b6b",
        size: 6,
        life: pattern.durationSeconds,
      });
      return;
    }
    const b = pattern.bullet;
    const speed = SPEED_PX_PER_SEC[b.speedRank] ?? 360;
    const angles = computeAngles(pattern, shotIndex, intervalSeconds, mob, this.playerTarget(), this.targetTarget());
    for (const a of angles) {
      this.bullets.push({
        x: mob.x,
        y: mob.y,
        vx: Math.cos(a * DEG) * speed,
        vy: Math.sin(a * DEG) * speed,
        color: b.color ?? "#ffd166",
        size: Math.max(4, (b.width + b.height) / 2),
        life: 8,
      });
    }
    void def;
  }

  private laserAngle(pattern: LaserPattern, mob: SimMob): number {
    if (pattern.angleDegrees !== undefined) return pattern.angleDegrees * DEG;
    if (pattern.target && pattern.target !== "self") {
      const t = pattern.target === "target" ? this.targetTarget() : this.playerTarget();
      return Math.atan2(t.y - mob.y, t.x - mob.x);
    }
    return Math.PI / 2;
  }

  // ───────────────────────── rendering ─────────────────────────

  render(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
    const scale = Math.min(cw / this.width, ch / this.height);
    const ox = (cw - this.width * scale) / 2;
    const oy = (ch - this.height * scale) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = "#0b0e1a";
    ctx.fillRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // arena
    ctx.fillStyle = "#121733";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = "rgba(123,209,255,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this.width, this.height);
    ctx.strokeStyle = "rgba(123,209,255,0.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x < this.width; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.height; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // targets (fighters)
    this.drawFighter(ctx, this.playerTarget(), "#5ad1ff");
    this.drawFighter(ctx, this.targetTarget(), "#ff7ad1");

    // shops
    for (const s of this.shops) {
      ctx.fillStyle = "rgba(255,209,102,0.9)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1300";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("商", s.x, s.y + 7);
    }

    // bullets
    for (const b of this.bullets) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // mobs
    for (const m of this.mobs) {
      const r = m.class === "boss" ? 56 : m.class === "elite" ? 38 : 24;
      ctx.fillStyle = "#" + m.tint.toString(16).padStart(6, "0");
      ctx.beginPath();
      ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // health bar
      const w = r * 2;
      const frac = m.maxHealth > 0 ? m.currentHealth / m.maxHealth : 0;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(m.x - r, m.y - r - 12, w, 6);
      ctx.fillStyle = m.class === "boss" ? "#ff4d6d" : "#7CFFB2";
      ctx.fillRect(m.x - r, m.y - r - 12, w * frac, 6);
    }
    ctx.restore();
  }

  private drawFighter(ctx: CanvasRenderingContext2D, p: Vec2, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// ───────────────────────── shared movement math ─────────────────────────

function incrementalStep(
  path: Extract<PathSpec, { kind: "follow" } | { kind: "drift" }>,
  curX: number,
  curY: number,
  player: Vec2,
  target: Vec2,
  dt: number,
): Vec2 {
  if (path.kind === "drift") {
    return { x: curX + path.vx * dt, y: curY + path.vy * dt };
  }
  const t = path.target === "target" ? target : player;
  const speed = path.speed ?? 120;
  const dx = t.x - curX;
  const dy = t.y - curY;
  const dist = Math.hypot(dx, dy) || 1;
  const step = speed * dt;
  if (dist <= step) return { x: t.x, y: t.y };
  return { x: curX + (dx / dist) * step, y: curY + (dy / dist) * step };
}

/** Absolute position along a non-incremental path at the given age. */
function computePathPosition(phase: MovementPhase, ageSeconds: number): Vec2 {
  const local = ageSeconds - phase.startSeconds;
  const dur = phase.durationSeconds;
  const t = phase.loop
    ? dur === Infinity
      ? 0
      : (local % dur) / dur
    : Math.min(1, local / dur);
  const p = phase.path;
  switch (p.kind) {
    case "point":
      return { x: p.x, y: p.y };
    case "line":
      return {
        x: lerp(p.from.x, p.to.x, ease(p.ease, t)),
        y: lerp(p.from.y, p.to.y, ease(p.ease, t)),
      };
    case "bezier":
      return {
        x: bezier(p.from.x, p.control.x, p.to.x, ease(p.ease, t)),
        y: bezier(p.from.y, p.control.y, p.to.y, ease(p.ease, t)),
      };
    case "circle": {
      const dir = p.clockwise ? -1 : 1;
      const ang = (p.startAngleDegrees + dir * t * 360) * DEG;
      return { x: p.center.x + p.radius * Math.cos(ang), y: p.center.y + p.radius * Math.sin(ang) };
    }
    default:
      return { x: 0, y: 0 };
  }
}

function resolvePhaseIndexed(
  movement: MovementSpec,
  ageSeconds: number,
): { phase: MovementPhase; index: number } | undefined {
  if ("type" in movement) {
    if (movement.type === "static") {
      return {
        phase: { startSeconds: 0, durationSeconds: Infinity, path: { kind: "point", x: movement.x, y: movement.y } },
        index: 0,
      };
    }
    if (movement.type === "phases") {
      let chosen: MovementPhase | undefined;
      let index = -1;
      movement.phases.forEach((p, i) => {
        if (ageSeconds >= p.startSeconds) {
          chosen = p;
          index = i;
        }
      });
      return chosen ? { phase: chosen, index } : undefined;
    }
    return undefined;
  }
  return ageSeconds >= movement.startSeconds ? { phase: movement, index: 0 } : undefined;
}

function computeAngles(
  pattern: BulletPattern,
  shotIndex: number,
  intervalSeconds: number,
  mob: SimMob,
  player: Vec2,
  target: Vec2,
): number[] {
  const b = pattern.bullet;
  void b;
  switch (pattern.type) {
    case "ring": {
      const base = (pattern.rotationDegreesPerSecond ?? 0) * mob.ageSeconds;
      const rot = (pattern.rotationDegreesPerShot ?? 0) * shotIndex + base;
      const start = pattern.startAngleDegrees ?? 0;
      const out: number[] = [];
      for (let i = 0; i < pattern.count; i++) out.push(start + (360 / pattern.count) * i + rot);
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
      const tgts = pattern.target === "target" ? [target] : pattern.target === "both" ? [player, target] : [player];
      const out: number[] = [];
      const count = Math.max(1, pattern.count ?? 1);
      const spread = pattern.spreadDegrees ?? 0;
      for (const t of tgts) {
        const base = (Math.atan2(t.y - mob.y, t.x - mob.x) / DEG);
        for (let i = 0; i < count; i++) {
          const f = count === 1 ? 0.5 : i / (count - 1);
          out.push(base - spread / 2 + spread * f);
        }
      }
      return out;
    }
    case "custom":
      return pattern.anglesDegrees;
  }
}

export type { FireSpec, TargetRef };
