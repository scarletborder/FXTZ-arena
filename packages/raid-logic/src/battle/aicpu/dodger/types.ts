import type { ProjectileState } from "@repo/content";

export interface DodgeResult {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly threatCount: number;
  readonly emergencyBomb: boolean;
}

export interface MoveOption {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
}

export type DodgeIntentKind = "point" | "farm" | "attack" | "position";

export interface DodgeIntent {
  readonly moveX: -1 | 0 | 1;
  readonly moveY: -1 | 0 | 1;
  readonly kind?: DodgeIntentKind;
  readonly urgency?: number;
  readonly bravery?: number;
}

export interface ProjectedProjectile {
  readonly kind: ProjectileState["kind"];
  readonly x: number;
  readonly y: number;
  readonly previousX: number;
  readonly previousY: number;
  readonly vx: number;
  readonly vy: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly damage: number;
}

export interface CandidateScore {
  readonly move: MoveOption;
  readonly score: number;
  readonly threatCount: number;
  readonly collisionTick: number | undefined;
}
