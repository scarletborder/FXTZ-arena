import AudioCmd from "../commands/AudioCmd";
import type { BattleOutputState } from "@repo/raid-logic";
import type { FighterKey, ProjectileState } from "@repo/content";
import type { NeutralMobState } from "@repo/types";

interface BattleAudioSyncOptions {
  readonly eventTypes: readonly string[];
}

interface AudioCue {
  readonly key: string;
  readonly groupKey?: string;
  readonly holdMs?: number;
}

const POWERUP_STEP = 100;

export class BattleAudioDirector {
  private previous: BattleOutputState | null = null;

  sync(current: BattleOutputState, options: BattleAudioSyncOptions): void {
    const currentSnapshot = cloneBattleOutputState(current);

    if (options.eventTypes.includes("snapshot_restored")) {
      AudioCmd.Reset();
      this.previous = currentSnapshot;
      return;
    }

    if (!this.previous || this.previous.frame + 1 !== currentSnapshot.frame) {
      this.previous = currentSnapshot;
      return;
    }

    this.emitFrameAudio(this.previous, currentSnapshot);
    this.previous = currentSnapshot;
  }

  private emitFrameAudio(previous: BattleOutputState, current: BattleOutputState): void {
    this.emitFighterAudio(previous.player, current.player, "Player1", previous, current);
    this.emitFighterAudio(previous.target, current.target, "Player2", previous, current);
    this.emitMobAudio(previous.neutralMobs, current.neutralMobs);
    this.emitProjectileAudio(previous, current);
  }

  private emitFighterAudio(
    previousFighter: BattleOutputState["player"],
    currentFighter: BattleOutputState["player"],
    fighterKey: FighterKey,
    previous: BattleOutputState,
    current: BattleOutputState,
  ): void {
    if (currentFighter.pointCount > previousFighter.pointCount) {
      if (pointPickupDetected(previous, current, fighterKey)) {
        AudioCmd.Play("se_item00");
      }
      for (const threshold of crossedThresholds(previousFighter.pointCount, currentFighter.pointCount)) {
        void threshold;
        AudioCmd.Play("se_powerup");
      }
    }

    if (currentFighter.bombUses > previousFighter.bombUses) {
      AudioCmd.Play("se_power00");
      if (currentFighter.activeCharacter.id === "youmu") {
        AudioCmd.Play("se_ch02");
      }
      if (currentFighter.activeCharacter.id === "kaguya") {
        AudioCmd.Play("se_lazer00");
      }
    }

    if (currentFighter.activeCardUses > previousFighter.activeCardUses) {
      AudioCmd.Play("se_power01");
    }

    if (currentFighter.hitsTaken > previousFighter.hitsTaken || currentFighter.lives < previousFighter.lives) {
      const hits = Math.max(
        currentFighter.hitsTaken - previousFighter.hitsTaken,
        previousFighter.lives - currentFighter.lives,
        1,
      );
      for (let index = 0; index < hits; index += 1) {
        console.log('pldead00')
        AudioCmd.Play("se_pldead00");
      }
    }

    if (currentFighter.grazedProjectileIds.length > previousFighter.grazedProjectileIds.length) {
      AudioCmd.Play("se_graze", {
        loop: true,
        groupKey: `graze:${fighterKey}`,
        holdMs: 110,
      });
    }

    if (
      currentFighter.activeCharacter.id === "marisa" &&
      currentFighter.shotsFired > previousFighter.shotsFired
    ) {
      AudioCmd.Play("se_lazer00", {
        groupKey: `fire:${fighterKey}:marisa`,
        holdMs: 1000,
      });
    }
  }

  private emitMobAudio(
    previousMobs: readonly NeutralMobState[],
    currentMobs: readonly NeutralMobState[],
  ): void {
    const previousById = new Map(previousMobs.map((mob) => [mob.id, mob] as const));
    const currentById = new Map(currentMobs.map((mob) => [mob.id, mob] as const));
    for (const currentMob of currentMobs) {
      const previousMob = previousById.get(currentMob.id);
      if (!previousMob) {
        continue;
      }

      if (
        currentMob.CurrentHealth < previousMob.CurrentHealth &&
        currentMob.active
      ) {
        AudioCmd.Play("se_damage00", {
          groupKey: `damage:mob:${currentMob.id}`,
          holdMs: 100,
        });
      }
    }

    for (const previousMob of previousMobs) {
      if (currentById.has(previousMob.id)) {
        continue;
      }
      const deathCue = mobDeathCue(previousMob);
      if (deathCue) {
        AudioCmd.Play(deathCue);
      }
    }
  }

  private emitProjectileAudio(previous: BattleOutputState, current: BattleOutputState): void {
    const previousById = new Map(previous.projectiles.map((projectile) => [projectile.id, projectile] as const));
    const queued = new Map<string, AudioCue>();

    for (const projectile of current.projectiles) {
      const sourceCharacterId = sourceCharacterFor(projectile, current);
      const previousProjectile = previousById.get(projectile.id);

      if (sourceCharacterId === "marisa" && projectile.kind === "spark" && projectile.damage > 0) {
        if (
          previousProjectile &&
          previous.frame < projectile.visibleFrom &&
          current.frame >= projectile.visibleFrom
        ) {
          AudioCmd.Play("se_nep00");
        }
        continue;
      }

      if (previousProjectile) {
        continue;
      }

      const cue = projectileCue(projectile, sourceCharacterId);
      if (!cue) {
        continue;
      }

      const cueKey = `${cue.groupKey ?? cue.key}:${cue.key}`;
      queued.set(cueKey, cue);
    }

    for (const cue of queued.values()) {
      AudioCmd.Play(cue.key, {
        groupKey: cue.groupKey,
        holdMs: cue.holdMs,
      });
    }
  }
}

function projectileCue(
  projectile: ProjectileState,
  sourceCharacterId: string | undefined,
): AudioCue | null {
  const characterId = sourceCharacterId ?? "";

  if (characterId === "marisa") {
    return {
      key: "se_lazer00",
      groupKey: `fire:${projectile.owner}:marisa`,
      holdMs: 200,
    };
  }

  if (characterId === "ellen") {
    return {
      key: projectile.damage >= 40 ? "se_tan02" : "se_tan01",
      groupKey: `fire:${projectile.owner}:ellen`,
      holdMs: 900,
    };
  }

  if (characterId === "reimu") {
    return {
      key: projectile.damage >= 40 ? "se_tan02" : classifyProjectileSound(projectile),
      groupKey: `fire:${projectile.owner}:reimu`,
      holdMs: 900,
    };
  }

  if (characterId === "youmu" || characterId === "cirno" || characterId === "sakuya" || characterId === "kaguya") {
    return {
      key: "se_tan00",
      groupKey: `fire:${projectile.owner}:${characterId}`,
      holdMs: 900,
    };
  }

  return {
    key: classifyProjectileSound(projectile),
    groupKey: `fire:${projectile.owner}:${classifyProjectileSound(projectile)}`,
    holdMs: 900,
  };
}

function sourceCharacterFor(
  projectile: ProjectileState,
  current: BattleOutputState,
): string | undefined {
  if (projectile.sourceCharacterId) {
    return projectile.sourceCharacterId;
  }
  const owner = projectile.owner === "Player1" ? current.player : current.target;
  return owner.activeCharacter.id;
}

function classifyProjectileSound(projectile: ProjectileState): string {
  const width = Math.max(
    projectile.width,
    projectile.previousWidth,
    projectile.height,
    projectile.renderHeight ?? 0,
  );

  if (width >= 32) {
    return "se_tan02";
  }
  if (width >= 16) {
    return "se_tan01";
  }
  return "se_tan00";
}

function mobDeathCue(mob: NeutralMobState): string | null {
  switch (mob.kind) {
    case "example_fairy":
      return "se_enep00";
    default:
      return null;
  }
}

function pointPickupDetected(
  previous: BattleOutputState,
  current: BattleOutputState,
  fighterKey: FighterKey,
): boolean {
  return previous.points.some(
    (point) =>
      point.collectingBy === fighterKey &&
      !current.points.some((currentPoint) => currentPoint.id === point.id),
  );
}

function crossedThresholds(previousPointCount: number, currentPointCount: number): number[] {
  const thresholds: number[] = [];
  const start = Math.floor(previousPointCount / POWERUP_STEP) + 1;
  const end = Math.floor(currentPointCount / POWERUP_STEP);
  for (let threshold = start * POWERUP_STEP; threshold <= end * POWERUP_STEP; threshold += POWERUP_STEP) {
    thresholds.push(threshold);
  }
  return thresholds;
}

function cloneBattleOutputState(state: BattleOutputState): BattleOutputState {
  return {
    ...state,
    player: structuredClone(state.player),
    target: structuredClone(state.target),
    points: structuredClone(state.points),
    neutralMobs: structuredClone(state.neutralMobs),
    projectiles: structuredClone(state.projectiles),
    effects: structuredClone(state.effects),
    shields: structuredClone(state.shields),
    stats: structuredClone(state.stats),
  };
}
