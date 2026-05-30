import type { FighterState, ProjectileState } from "@repo/raid-logic";

import { bulletFrameKey } from "./frames";
import type {
  BulletFrame,
  CharacterId,
  ProjectileFighters,
  ProjectileSpec,
} from "./types";

export function projectileSpec(
  projectile: ProjectileState,
  ownerCharacter: CharacterId,
  frame: number,
  frames: ReadonlyMap<string, BulletFrame>,
): ProjectileSpec {
  const fixed = textureKeyProjectileFrame(projectile, frames);
  if (fixed) {
    return fixed;
  }
  const mapped = mappedProjectileFrame(
    projectile,
    ownerCharacter,
    frame,
    frames,
  );
  if (mapped) {
    return mapped;
  }
  return {
    kind: "fallback",
    texture: projectileTexture(projectile),
    tint: projectileTint(projectile),
  };
}

function textureKeyProjectileFrame(
  projectile: ProjectileState,
  frames: ReadonlyMap<string, BulletFrame>,
): ProjectileSpec | undefined {
  if (!projectile.textureKey) return undefined;
  if (projectile.textureKey === "effect_youmu_dash_path") {
    return {
      kind: "fallback",
      texture: projectileTexture(projectile),
      tint: projectileTint(projectile),
    };
  }
  if (projectile.kind === "laser" || projectile.textureKey.startsWith("laser_type_")) {
    const frame = frames.get(`${projectile.textureKey}_middle`);
    return frame ? { kind: "laser", frame } : undefined;
  }
  const frame = frames.get(projectile.textureKey);
  return frame ? { kind: "image", frame } : undefined;
}

export function projectileOwnerCharacter(
  projectile: ProjectileState,
  fighters: ProjectileFighters,
): FighterState["activeCharacter"]["id"] {
  return projectile.owner === fighters.player.key
    ? fighters.player.activeCharacter.id
    : fighters.target.activeCharacter.id;
}

export function projectileTint(projectile: ProjectileState): number {
  if (
    (projectile.kind === "laser" || projectile.kind === "spark") &&
    projectile.owner === "Player1" &&
    projectile.damage === 0
  ) {
    return 0x64b7ff;
  }
  if (
    (projectile.kind === "laser" || projectile.kind === "spark") &&
    projectile.damage === 0
  ) {
    return 0xff5a5a;
  }
  if (projectile.kind === "laser" || projectile.kind === "spark") {
    return projectile.owner === "Player1" ? 0xffead4 : 0xffc0c0;
  }
  return projectile.owner === "Player1" ? 0xdff0ff : 0xffe0e0;
}

function mappedProjectileFrame(
  projectile: ProjectileState,
  ownerCharacter: CharacterId,
  frame: number,
  frames: ReadonlyMap<string, BulletFrame>,
): ProjectileSpec | undefined {
  switch (ownerCharacter) {
    case "reimu":
      return reimuProjectileFrame(projectile, frame, frames);
    case "marisa":
      return marisaProjectileFrame(projectile, frames);
    case "sakuya":
      return sakuyaProjectileFrame(projectile, frames);
    case "cirno":
      return cirnoProjectileFrame(projectile, frames);
    case "youmu":
      return youmuProjectileFrame(projectile, frames);
    default:
      return undefined;
  }
}

function reimuProjectileFrame(
  projectile: ProjectileState,
  frame: number,
  frames: ReadonlyMap<string, BulletFrame>,
): ProjectileSpec | undefined {
  if (projectile.kind !== "orb") return undefined;
  if (projectile.clearsProjectiles || projectile.piercesTargets) {
    return imageSpec(frames, "bullet_type_23", 0);
  }
  if (
    projectile.homingUntil > frame ||
    projectile.homingUntil > projectile.homingStartAt
  ) {
    return imageSpec(frames, "bullet_type_1", 2);
  }
  return imageSpec(frames, "bullet_type_7", 2);
}

function marisaProjectileFrame(
  projectile: ProjectileState,
  frames: ReadonlyMap<string, BulletFrame>,
): ProjectileSpec | undefined {
  if (projectile.kind === "spark" && (projectile.renderHeight ?? projectile.height) >= 100) {
    return undefined;
  }
  if (projectile.kind !== "laser") return undefined;
  if (projectile.damage === 0) return undefined;
  if (!Number.isFinite(projectile.width)) {
    return laserSpec(frames, "laser_type_1", 5);
  }
  return laserSpec(frames, "laser_type_1", 13);
}

function sakuyaProjectileFrame(
  projectile: ProjectileState,
  frames: ReadonlyMap<string, BulletFrame>,
): ProjectileSpec | undefined {
  if (projectile.kind !== "knife") return undefined;
  const offset = projectile.pausedUntil > projectile.visibleFrom ? 1 : 0;
  return imageSpec(frames, "bullet_type_20", offset);
}

function cirnoProjectileFrame(
  projectile: ProjectileState,
  frames: ReadonlyMap<string, BulletFrame>,
): ProjectileSpec | undefined {
  if (projectile.kind !== "diamond") return undefined;
  if (
    projectile.damage === 10 &&
    projectile.vx * projectile.vx + projectile.vy * projectile.vy < 3
  ) {
    return imageSpec(frames, "bullet_type_4", 5);
  }
  return imageSpec(frames, "bullet_type_6", 5);
}

function youmuProjectileFrame(
  projectile: ProjectileState,
  frames: ReadonlyMap<string, BulletFrame>,
): ProjectileSpec | undefined {
  if (projectile.kind === "laser") {
    return laserSpec(frames, "laser_type_1", 9);
  }
  if (projectile.kind === "orb") {
    return imageSpec(frames, "bullet_type_4", 9);
  }
  return undefined;
}

function imageSpec(
  frames: ReadonlyMap<string, BulletFrame>,
  id: string,
  offset: number,
): ProjectileSpec | undefined {
  const frame = frames.get(bulletFrameKey(id, offset));
  return frame ? { kind: "image", frame } : undefined;
}

function laserSpec(
  frames: ReadonlyMap<string, BulletFrame>,
  id: string,
  offset: number,
): ProjectileSpec | undefined {
  const frame = frames.get(`${bulletFrameKey(id, offset)}_middle`);
  return frame ? { kind: "laser", frame } : undefined;
}

function projectileTexture(projectile: ProjectileState): string {
  if (projectile.kind === "laser" && projectile.damage === 0) {
    return "bullet-ray-preview";
  }
  return projectile.kind === "spark"
    ? "bullet-spark"
    : projectile.kind === "laser"
      ? "bullet-laser"
      : projectile.kind === "knife"
        ? "bullet-knife"
        : projectile.kind === "diamond"
          ? "bullet-diamond"
          : "bullet-orb";
}
