import type { FighterKey } from "./common";

export interface ShieldState {
  readonly id: string;
  readonly owner: FighterKey;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly style?: "default" | "ufo_square";
  readonly spinAngle?: number;
}
