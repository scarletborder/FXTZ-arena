import type { BattleModel } from ".";
import type { EffectState, FighterState, ProjectileState, TrainingStats } from "../types";

class DeterministicHasher {
  private value = 0x811c9dc5;

  writeNumber(input: number): void {
    const normalized = Number.isFinite(input) ? Math.trunc(input) : 0;
    this.value ^= normalized & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 8) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 16) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
    this.value ^= (normalized >>> 24) & 0xff;
    this.value = Math.imul(this.value, 0x01000193) >>> 0;
  }

  writeString(input: string): void {
    for (let index = 0; index < input.length; index += 1) {
      this.value ^= input.charCodeAt(index) & 0xff;
      this.value = Math.imul(this.value, 0x01000193) >>> 0;
    }
    this.writeNumber(input.length);
  }

  digest(): number {
    return this.value >>> 0;
  }
}

export function hashBattleModel(model: BattleModel): number {
  const hasher = new DeterministicHasher();
  hasher.writeNumber(model.frame);
  hasher.writeNumber(model.gameOver ? 1 : 0);
  writeFighter(hasher, model.player);
  writeFighter(hasher, model.target);
  writeProjectiles(hasher, model.projectiles);
  writeEffects(hasher, model.effects);
  writeStats(hasher, model.stats);
  return hasher.digest();
}

export function hashToHex(hash: number): string {
  return hash.toString(16).padStart(8, "0");
}

function writeFighter(hasher: DeterministicHasher, fighter: FighterState): void {
  hasher.writeString(fighter.key);
  writeFixed(hasher, fighter.x);
  writeFixed(hasher, fighter.y);
  writeFixed(hasher, fighter.facing);
  hasher.writeNumber(fighter.lives);
  hasher.writeNumber(fighter.bombs);
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
  hasher.writeNumber(fighter.deadUntil);
  hasher.writeNumber(fighter.actionLockedUntil);
  hasher.writeNumber(fighter.nonFireActionLockedUntil);
  hasher.writeNumber(fighter.movementLockedUntil);
  hasher.writeNumber(fighter.projectilePauseUntil);
  hasher.writeNumber(fighter.timeStopUntil);
  hasher.writeString(fighter.moveSpeedOverride ?? "");
  hasher.writeNumber(fighter.moveSpeedOverrideUntil);
  hasher.writeNumber(fighter.moveSpeedOverrideDelayRemaining);
  hasher.writeString(fighter.pendingMoveSpeedOverride ?? "");
  hasher.writeNumber(fighter.pendingMoveSpeedOverrideDuration);
  hasher.writeString(fighter.primaryCharacter.id);
  hasher.writeString(fighter.activeCharacter.id);
  hasher.writeString(fighter.alternateCharacter.id);
  hasher.writeString(fighter.activeCard?.id ?? "");
  hasher.writeNumber(fighter.activeCardUses);
  hasher.writeNumber(fighter.activeCardCooldownUntil);
  hasher.writeNumber(fighter.fireCooldownUntil);
  hasher.writeNumber(fighter.bombCooldownUntil);
  hasher.writeNumber(fighter.shotsFired);
  hasher.writeNumber(fighter.hits);
  hasher.writeNumber(fighter.damageTaken);
  hasher.writeNumber(fighter.deaths);
  hasher.writeNumber(fighter.bombUses);
  hasher.writeNumber(fighter.flashUntil);
  hasher.writeNumber(fighter.statusVisibleUntil);
  for (const [key, ammo] of Object.entries(fighter.ammoByCharacterId).sort(([left], [right]) => left.localeCompare(right))) {
    hasher.writeString(key);
    hasher.writeNumber(ammo);
  }
}

function writeProjectiles(hasher: DeterministicHasher, projectiles: readonly ProjectileState[]): void {
  hasher.writeNumber(projectiles.length);
  for (const projectile of [...projectiles].sort((left, right) => left.id - right.id)) {
    hasher.writeNumber(projectile.id);
    hasher.writeString(projectile.kind);
    hasher.writeString(projectile.owner);
    writeFixed(hasher, projectile.x);
    writeFixed(hasher, projectile.y);
    writeFixed(hasher, projectile.vx);
    writeFixed(hasher, projectile.vy);
    writeFixed(hasher, projectile.width);
    writeFixed(hasher, projectile.height);
    writeFixed(hasher, projectile.anchorX ?? 0);
    writeFixed(hasher, projectile.anchorY ?? 0);
    hasher.writeNumber(projectile.visibleFrom);
    hasher.writeNumber(projectile.expireAt ?? 0);
    hasher.writeNumber(projectile.homingStartAt);
    hasher.writeNumber(projectile.homingUntil);
    hasher.writeNumber(projectile.pausedUntil);
    writeFixed(hasher, projectile.widthGrowthPerTick);
    writeFixed(hasher, projectile.maxWidth ?? 0);
    hasher.writeNumber(projectile.damage);
    hasher.writeNumber(projectile.pierce ? 1 : 0);
    writeFixed(hasher, projectile.angle);
  }
}

function writeEffects(hasher: DeterministicHasher, effects: readonly EffectState[]): void {
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
  }
}

function writeStats(hasher: DeterministicHasher, stats: TrainingStats): void {
  hasher.writeNumber(stats.shots);
  hasher.writeNumber(stats.hits);
  hasher.writeNumber(stats.bombUses);
  hasher.writeNumber(stats.damage);
  hasher.writeNumber(stats.elapsedTicks);
}

function writeFixed(hasher: DeterministicHasher, value: number): void {
  if (!Number.isFinite(value)) {
    hasher.writeNumber(0);
    return;
  }
  hasher.writeNumber(Math.round(value * 1000));
}
