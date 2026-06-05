export interface EffectState {
  readonly id: number;
  readonly kind: "ring" | "burst" | "damage" | "shield";
  x: number;
  y: number;
  readonly tint: number;
  readonly scale: number;
  readonly expireAt: number;
  readonly text?: string;
  readonly width?: number;
  readonly height?: number;
  readonly angle?: number;
}
