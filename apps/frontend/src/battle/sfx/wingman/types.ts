import { HIT_CIRCLE_DIAMETER } from "@repo/constants";

export type PointPowerTier = 1 | 2 | 3 | 4;
export type WingmanKind = "orb" | "laser" | "knife" | "diamond" | "slash";

export interface RelativeSource {
  readonly forward: number;
  readonly side: number;
}

export interface OrbitSource {
  readonly radius: number;
  readonly angleOffset: number;
  readonly angularSpeed?: number;
}

export interface WingmanEmitterConfig {
  readonly kind: WingmanKind;
  readonly source: RelativeSource | OrbitSource;
  readonly shotAngleOffset?: number;
  readonly color: number;
  readonly accent: number;
  readonly scale?: number;
  readonly phase?: number;
}

export abstract class CharacterWingmanProfile {
  abstract wingmenForTier(tier: PointPowerTier): readonly WingmanEmitterConfig[];
}

export function orb(
  source: RelativeSource | OrbitSource,
  shotAngleOffset: number,
  color: number,
  accent: number,
  phase: number,
  scale = 1,
): WingmanEmitterConfig {
  return { kind: "orb", source, shotAngleOffset, color, accent, phase, scale };
}

export function laser(
  source: RelativeSource | OrbitSource,
  shotAngleOffset: number,
  color: number,
  accent: number,
  phase: number,
  scale = 1,
): WingmanEmitterConfig {
  return { kind: "laser", source, shotAngleOffset, color, accent, phase, scale };
}

export function knife(
  source: RelativeSource | OrbitSource,
  shotAngleOffset: number,
  color: number,
  accent: number,
  phase: number,
  scale = 1,
): WingmanEmitterConfig {
  return { kind: "knife", source, shotAngleOffset, color, accent, phase, scale };
}

export function diamond(
  source: RelativeSource | OrbitSource,
  shotAngleOffset: number,
  color: number,
  accent: number,
  phase: number,
  scale = 1,
): WingmanEmitterConfig {
  return { kind: "diamond", source, shotAngleOffset, color, accent, phase, scale };
}

export function polar(radius: number, angleOffset: number): OrbitSource {
  return { radius, angleOffset };
}

export function hitCircleUnits(multiplier: number): number {
  return HIT_CIRCLE_DIAMETER * multiplier;
}

export function pointPowerTier(pointCount: number): PointPowerTier {
  if (pointCount >= 300) return 4;
  if (pointCount >= 200) return 3;
  if (pointCount >= 100) return 2;
  return 1;
}
