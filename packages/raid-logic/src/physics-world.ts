import { ARENA_HEIGHT, ARENA_WIDTH, speedRankToPixelsPerTick } from "@repo/types";

import type { FighterEntity } from "./entities";
import type { RaidFrameInput } from "./input";

export interface PhysicsBodySerialized {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radius: number;
}

export interface PhysicsWorldSerialized {
  readonly bodies: readonly PhysicsBodySerialized[];
}

export class PhysicsWorld {
  private readonly bodies = new Map<string, PhysicsBodySerialized>();

  syncFighter(fighter: FighterEntity, radius: number): void {
    this.bodies.set(fighter.playerId, {
      id: fighter.playerId,
      x: fighter.x,
      y: fighter.y,
      vx: fighter.vx,
      vy: fighter.vy,
      radius,
    });
  }

  applyFighterInput(fighter: FighterEntity, input: RaidFrameInput): void {
    const speed = speedRankToPixelsPerTick(
      fighter.activeCharacterId === "marisa" ? "high" : "medium",
    );
    const diagonal = input.moveX !== 0 && input.moveY !== 0;
    const vx = input.moveX * (diagonal ? Math.trunc(speed * 707 / 1000) : speed);
    const vy = input.moveY * (diagonal ? Math.trunc(speed * 707 / 1000) : speed);
    const nextX = clamp(Math.trunc(fighter.x + vx), -ARENA_WIDTH / 2, ARENA_WIDTH / 2);
    const nextY = clamp(Math.trunc(fighter.y + vy), -ARENA_HEIGHT / 2, ARENA_HEIGHT / 2);

    fighter.vx = nextX - fighter.x;
    fighter.vy = nextY - fighter.y;
    fighter.x = nextX;
    fighter.y = nextY;
  }

  serialize(): PhysicsWorldSerialized {
    return {
      bodies: Array.from(this.bodies.values()).sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    };
  }

  deserialize(serialized: PhysicsWorldSerialized): void {
    this.bodies.clear();
    for (const body of serialized.bodies) {
      this.bodies.set(body.id, { ...body });
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
