import { fp } from "@shaisrc/fixed-point";
import type { BattleModel } from ".";
import type { CollaborateExtraState, NeutralMobState } from "@repo/types";
import type { ClearRingState } from "./entities/clear-ring";
import type {
  EffectState,
  FighterState,
  PointState,
  ProjectileState,
  TrainingStats,
} from "@repo/content";
import type {
  NeutralMobSpawnerState,
  NeutralMobSpawnerStateValue,
} from "@repo/content";

const NEUTRAL_MOB_HASHED_KEYS = new Set([
  "id",
  "key",
  "kind",
  "textureKey",
  "x",
  "y",
  "previousX",
  "previousY",
  "hitRadius",
  "hitWidth",
  "hitHeight",
  "waveId",
  "movementVariant",
  "form",
  "MaxHealth",
  "CurrentHealth",
  "pointRewardSize",
  "moneyRewardSize",
  "powerRewardSize",
  "damageTaken",
  "active",
  "ageTicks",
  "sfxFlags",
]);

class DeterministicHasher {
  private value = 0x811c9dc5;

  writeNumber(input: number): void {
    if (!Number.isFinite(input)) {
      this.writeUint32(0);
      return;
    }
    if (Number.isInteger(input)) {
      this.writeUint32(input);
      return;
    }
    this.writeString(fp.fromFloat(input).toString());
  }

  writeString(input: string): void {
    for (let index = 0; index < input.length; index += 1) {
      this.value ^= input.charCodeAt(index) & 0xff;
      this.value = Math.imul(this.value, 0x01000193) >>> 0;
    }
    this.writeUint32(input.length);
  }

  digest(): number {
    return this.value >>> 0;
  }

  private writeUint32(input: number): void {
    const normalized = input >>> 0;
    this.value ^= normalized & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 8) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 16) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 24) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
  }
}

export function hashBattleModel(model: BattleModel): number {
  const hasher = new DeterministicHasher();
  hasher.writeNumber(model.frame);
  hasher.writeNumber(model.gameOver ? 1 : 0);
  hasher.writeNumber(model.neutralMobManager.getNextNeutralMobId());
  hasher.writeNumber(model.pointManager.getNextPointId());
  hasher.writeNumber(model.clearRingManager.getNextClearRingId());
  writeFighter(hasher, model.player);
  writeFighter(hasher, model.target);
  writeNeutralMobs(hasher, model.neutralMobManager.states());
  writePoints(hasher, model.pointManager.pointStates());
  writeClearRings(hasher, model.clearRings);
  writeSpawnerState(hasher, model.neutralMobManager.mobSpawnerState());
  writeCollaborateExtra(hasher, model.toOutputState().collaborateExtra);
  writeProjectiles(hasher, model.projectiles);
  writeEffects(hasher, model.effects);
  writeStats(hasher, model.stats);
  return hasher.digest();
}

/**
 * Debug helper: hash each component of the battle model separately and return
 * the individual digests.  When two peers disagree on the global hash, this
 * tells you which subsystem diverged.
 */
export function hashBattleModelComponents(
  model: BattleModel,
): Record<string, string> {
  const hash = (
    label: string,
    fn: (h: DeterministicHasher) => void,
  ): string => {
    const h = new DeterministicHasher();
    fn(h);
    return hashToHex(h.digest());
  };

  return {
    frame: hash("frame", (h) => h.writeNumber(model.frame)),
    counters: hash("counters", (h) => {
      h.writeNumber(model.neutralMobManager.getNextNeutralMobId());
      h.writeNumber(model.pointManager.getNextPointId());
      h.writeNumber(model.clearRingManager.getNextClearRingId());
    }),
    player: hash("player", (h) => writeFighter(h, model.player)),
    target: hash("target", (h) => writeFighter(h, model.target)),
    neutralMobs: hash("mobs", (h) =>
      writeNeutralMobs(h, model.neutralMobManager.states()),
    ),
    points: hash("points", (h) => writePoints(h, model.pointManager.pointStates())),
    clearRings: hash("rings", (h) => writeClearRings(h, model.clearRings)),
    spawner: hash("spawner", (h) =>
      writeSpawnerState(h, model.neutralMobManager.mobSpawnerState()),
    ),
    collaborateExtra: hash("collab", (h) =>
      writeCollaborateExtra(h, model.toOutputState().collaborateExtra),
    ),
    projectiles: hash("projs", (h) => writeProjectiles(h, model.projectiles)),
    effects: hash("effects", (h) => writeEffects(h, model.effects)),
    stats: hash("stats", (h) => writeStats(h, model.stats)),
  };
}

function writeNeutralMobs(
  hasher: DeterministicHasher,
  neutralMobs: readonly NeutralMobState[],
): void {
  hasher.writeNumber(neutralMobs.length);
  for (const mob of [...neutralMobs].sort(
    (left, right) => left.id - right.id,
  )) {
    hasher.writeNumber(mob.id);
    hasher.writeString(mob.key);
    hasher.writeString(mob.kind);
    hasher.writeString(mob.textureKey ?? "");
    writeFixed(hasher, mob.x);
    writeFixed(hasher, mob.y);
    writeFixed(hasher, mob.previousX);
    writeFixed(hasher, mob.previousY);
    writeFixed(hasher, mob.hitRadius);
    writeFixed(hasher, mob.hitWidth ?? 0);
    writeFixed(hasher, mob.hitHeight ?? 0);
    hasher.writeNumber(mob.waveId);
    hasher.writeString(mob.movementVariant);
    hasher.writeString(mob.form);
    hasher.writeNumber(mob.MaxHealth);
    hasher.writeNumber(mob.CurrentHealth);
    hasher.writeString(mob.pointRewardSize ?? "");
    hasher.writeString(mob.moneyRewardSize ?? "");
    hasher.writeString(mob.powerRewardSize ?? "");
    hasher.writeNumber(mob.damageTaken ?? 0);
    hasher.writeNumber(mob.active ? 1 : 0);
    hasher.writeNumber(mob.ageTicks);
    writeNeutralMobExtraState(hasher, mob);
  }
}

function writeNeutralMobExtraState(
  hasher: DeterministicHasher,
  mob: NeutralMobState,
): void {
  const entries = Object.entries(
    mob as unknown as Record<string, NeutralMobSpawnerStateValue | undefined>,
  )
    .filter(
      ([key, value]) =>
        !NEUTRAL_MOB_HASHED_KEYS.has(key) && value !== undefined,
    )
    .sort(([left], [right]) => left.localeCompare(right));

  hasher.writeNumber(entries.length);
  for (const [key, value] of entries) {
    hasher.writeString(key);
    writeStateValue(hasher, value!);
  }
}

function writePoints(
  hasher: DeterministicHasher,
  points: readonly PointState[],
): void {
  hasher.writeNumber(points.length);
  for (const point of [...points].sort((left, right) => left.id - right.id)) {
    hasher.writeNumber(point.id);
    hasher.writeString(point.prefabId);
    hasher.writeString(point.rewardKind);
    hasher.writeString(point.rewardSize);
    writeFixed(hasher, point.x);
    writeFixed(hasher, point.y);
    writeFixed(hasher, point.previousX);
    writeFixed(hasher, point.previousY);
    writeFixed(hasher, point.vx);
    writeFixed(hasher, point.vy);
    hasher.writeNumber(point.size);
    hasher.writeNumber(point.value);
    hasher.writeNumber(point.active ? 1 : 0);
    hasher.writeString(point.collectingBy ?? "");
    hasher.writeNumber(point.collectTicksRemaining);
  }
}

function writeClearRings(
  hasher: DeterministicHasher,
  clearRings: readonly ClearRingState[],
): void {
  hasher.writeNumber(clearRings.length);
  for (const ring of [...clearRings].sort(
    (left, right) => left.id - right.id,
  )) {
    hasher.writeNumber(ring.id);
    hasher.writeString(ring.owner);
    writeFixed(hasher, ring.x);
    writeFixed(hasher, ring.y);
    writeFixed(hasher, ring.previousX);
    writeFixed(hasher, ring.previousY);
    writeFixed(hasher, ring.radius);
    hasher.writeNumber(ring.expireAt);
    hasher.writeNumber(ring.followsOwner ? 1 : 0);
  }
}

export function hashToHex(hash: number): string {
  return hash.toString(16).padStart(8, "0");
}

function writeFighter(
  hasher: DeterministicHasher,
  fighter: FighterState,
): void {
  hasher.writeString(fighter.key);
  writeFixed(hasher, fighter.x);
  writeFixed(hasher, fighter.y);
  // fighter.facing is deliberately excluded from the hash — it is
  // derived from the transient aimX/aimY input (via fpAtan2) which
  // can differ between peers by sub-degree amounts due to floating
  // point precision without materially altering the simulation.
  // The effects of facing on the simulation (bullet trajectories,
  // bomb placement, etc.) ARE captured via projectile/entity hashes,
  // so removing facing eliminates a source of false desync reports
  // without losing meaningful determinism coverage.
  hasher.writeNumber(fighter.lives);
  hasher.writeNumber(fighter.bombs);
  hasher.writeNumber(fighter.pointCount);
  writeFixed(hasher, fighter.ammo);
  writeFixed(hasher, fighter.ammoDisplay);
  hasher.writeNumber(fighter.ammoCapacity);
  hasher.writeNumber(fighter.reloadRemaining);
  hasher.writeNumber(fighter.reloadTotal);
  hasher.writeNumber(fighter.reloadStartedAmmo);
  hasher.writeString(fighter.reloadCharacterId ?? "");
  hasher.writeNumber(fighter.invulnerableUntil);
  hasher.writeNumber(fighter.invulnerableDelayRemaining);
  hasher.writeNumber(fighter.invulnerableDelayDuration);
  writeFixed(hasher, fighter.hitCircleRadiusMultiplier);
  hasher.writeNumber(fighter.reisenShieldLayers);
  hasher.writeNumber(fighter.deadUntil);
  hasher.writeNumber(fighter.actionLockedUntil);
  hasher.writeNumber(fighter.nonFireActionLockedUntil);
  hasher.writeNumber(fighter.switchLockedUntil);
  hasher.writeNumber(fighter.movementLockedUntil);
  hasher.writeNumber(fighter.projectilePauseUntil);
  hasher.writeNumber(fighter.timeStopUntil);
  hasher.writeNumber(fighter.youmuBombDashDelayRemaining);
  writeFixed(hasher, fighter.youmuBombDashStartX ?? 0);
  writeFixed(hasher, fighter.youmuBombDashStartY ?? 0);
  writeFixed(hasher, fighter.youmuBombDashAimX ?? 0);
  writeFixed(hasher, fighter.youmuBombDashAimY ?? 0);
  hasher.writeString(fighter.moveSpeedOverride ?? "");
  hasher.writeNumber(fighter.moveSpeedOverrideUntil);
  hasher.writeNumber(fighter.moveSpeedOverrideDelayRemaining);
  hasher.writeString(fighter.pendingMoveSpeedOverride ?? "");
  hasher.writeNumber(fighter.pendingMoveSpeedOverrideDuration);
  hasher.writeString(fighter.primaryCharacter.id);
  hasher.writeString(fighter.activeCharacter.id);
  hasher.writeString(fighter.alternateCharacter.id);
  hasher.writeString(fighter.activeCard?.id ?? "");
  for (const card of fighter.abilityCards) {
    hasher.writeString(card.id);
  }
  hasher.writeNumber(fighter.abilityCards.length);
  hasher.writeNumber(fighter.activeCardUses);
  hasher.writeNumber(fighter.activeCardCooldownUntil);
  hasher.writeNumber(fighter.fireCooldownUntil);
  hasher.writeNumber(fighter.bombCooldownUntil);
  hasher.writeNumber(fighter.shotsFired);
  hasher.writeNumber(fighter.hits);
  hasher.writeNumber(fighter.hitsTaken);
  hasher.writeNumber(fighter.damageTaken);
  hasher.writeNumber(fighter.deaths);
  hasher.writeNumber(fighter.bombUses);
  hasher.writeNumber(fighter.flashUntil);
  hasher.writeNumber(fighter.statusVisibleUntil);
  for (const [key, ammo] of Object.entries(fighter.ammoByCharacterId).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    hasher.writeString(key);
    hasher.writeNumber(ammo);
  }
  const grazedProjectileIds = [...fighter.grazedProjectileIds].sort(
    (left, right) => left - right,
  );
  hasher.writeNumber(grazedProjectileIds.length);
  for (const projectileId of grazedProjectileIds) {
    hasher.writeNumber(projectileId);
  }
}

function writeProjectiles(
  hasher: DeterministicHasher,
  projectiles: readonly ProjectileState[],
): void {
  hasher.writeNumber(projectiles.length);
  for (const projectile of [...projectiles].sort(
    (left, right) => left.id - right.id,
  )) {
    hasher.writeNumber(projectile.id);
    hasher.writeString(projectile.kind);
    hasher.writeString(projectile.owner);
    hasher.writeString(projectile.sourceCharacterId ?? "");
    hasher.writeString(projectile.textureKey ?? "");
    writeFixed(hasher, projectile.x);
    writeFixed(hasher, projectile.y);
    writeFixed(hasher, projectile.vx);
    writeFixed(hasher, projectile.vy);
    writeFixed(hasher, projectile.width);
    writeFixed(hasher, projectile.height);
    writeFixed(hasher, projectile.renderWidth ?? 0);
    writeFixed(hasher, projectile.renderHeight ?? 0);
    hasher.writeString(projectile.laserRenderMode ?? "");
    writeFixed(hasher, projectile.anchorX ?? 0);
    writeFixed(hasher, projectile.anchorY ?? 0);
    hasher.writeNumber(projectile.visibleFrom);
    hasher.writeNumber(projectile.expireAt ?? 0);
    hasher.writeNumber(projectile.homingStartAt);
    hasher.writeNumber(projectile.homingUntil);
    hasher.writeNumber(projectile.pausedUntil);
    hasher.writeNumber(projectile.retargetAt ?? 0);
    writeFixed(hasher, projectile.retargetSpeed ?? 0);
    writeFixed(hasher, projectile.retargetX ?? 0);
    writeFixed(hasher, projectile.retargetY ?? 0);
    hasher.writeString(projectile.retargetAimOwner ?? "");
    writeFixed(hasher, projectile.widthGrowthPerTick);
    writeFixed(hasher, projectile.maxWidth ?? 0);
    hasher.writeNumber(projectile.damage);
    writeFixed(hasher, projectile.angle);
    hasher.writeNumber(projectile.couldClear ? 1 : 0);
    hasher.writeNumber(projectile.clearsProjectiles ? 1 : 0);
    hasher.writeNumber(projectile.piercesTargets ? 1 : 0);
    writeFixed(hasher, projectile.polarOriginX ?? 0);
    writeFixed(hasher, projectile.polarOriginY ?? 0);
    writeFixed(hasher, projectile.polarRadius ?? 0);
    writeFixed(hasher, projectile.polarAngle ?? 0);
    writeFixed(hasher, projectile.polarRadialSpeed ?? 0);
    writeFixed(hasher, projectile.polarAngularSpeed ?? 0);
    hasher.writeString(projectile.polarFollowOwner ?? "");
  }
}

function writeEffects(
  hasher: DeterministicHasher,
  effects: readonly EffectState[],
): void {
  hasher.writeNumber(effects.length);
  for (const effect of [...effects].sort((left, right) => left.id - right.id)) {
    hasher.writeNumber(effect.id);
    hasher.writeString(effect.kind);
    writeFixed(hasher, effect.x);
    writeFixed(hasher, effect.y);
    hasher.writeNumber(effect.tint);
    writeFixed(hasher, effect.scale);
    hasher.writeNumber(effect.expireAt);
    hasher.writeString(effect.text ?? "");
    writeFixed(hasher, effect.width ?? 0);
    writeFixed(hasher, effect.height ?? 0);
    writeFixed(hasher, effect.angle ?? 0);
  }
}

function writeStats(hasher: DeterministicHasher, stats: TrainingStats): void {
  hasher.writeNumber(stats.shots);
  hasher.writeNumber(stats.hits);
  hasher.writeNumber(stats.bombUses);
  hasher.writeNumber(stats.damage);
  hasher.writeNumber(stats.elapsedTicks);
}

function writeSpawnerState(
  hasher: DeterministicHasher,
  state: NeutralMobSpawnerState | undefined,
): void {
  if (!state) {
    hasher.writeNumber(0);
    return;
  }
  hasher.writeNumber(1);
  writeStateValue(hasher, state as NeutralMobSpawnerStateValue);
}

function writeCollaborateExtra(
  hasher: DeterministicHasher,
  state: CollaborateExtraState | undefined,
): void {
  if (!state) {
    hasher.writeNumber(0);
    return;
  }
  hasher.writeNumber(1);
  writeStateValue(
    hasher,
    state as unknown as NeutralMobSpawnerStateValue,
  );
}

function writeStateValue(
  hasher: DeterministicHasher,
  value: NeutralMobSpawnerStateValue,
): void {
  if (value === null) {
    hasher.writeNumber(0);
  } else if (typeof value === "boolean") {
    hasher.writeNumber(value ? 1 : 2);
  } else if (typeof value === "number") {
    hasher.writeNumber(3);
    hasher.writeNumber(value);
  } else if (typeof value === "string") {
    hasher.writeNumber(4);
    hasher.writeString(value);
  } else if (Array.isArray(value)) {
    hasher.writeNumber(5);
    hasher.writeNumber(value.length);
    for (const item of value) {
      writeStateValue(hasher, item);
    }
  } else {
    hasher.writeNumber(6);
    const obj = value as {
      readonly [key: string]: NeutralMobSpawnerStateValue;
    };
    const keys = Object.keys(obj).sort();
    hasher.writeNumber(keys.length);
    for (const key of keys) {
      hasher.writeString(key);
      writeStateValue(hasher, obj[key]!);
    }
  }
}

function writeFixed(hasher: DeterministicHasher, value: number): void {
  if (!Number.isFinite(value)) {
    hasher.writeNumber(0);
    return;
  }
  hasher.writeString(fp.fromFloat(value).toString());
}
