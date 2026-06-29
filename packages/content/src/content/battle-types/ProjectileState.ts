import type {
  FighterKey,
  LaserRenderMode,
  LaserVisualStyle,
  ProjectileKind,
} from "./common";
import type { CharacterDefinition } from "../characters/types";

export interface ProjectileState {
  readonly id: number;
  readonly kind: ProjectileKind;
  readonly owner: FighterKey;
  readonly sourceCharacterId?: CharacterDefinition["id"];
  readonly textureKey?: string;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  width: number;
  previousWidth: number;
  previousHeight: number;
  previousRenderHeight?: number;
  height: number;
  readonly centerOffsetX: number;
  readonly centerOffsetY: number;
  readonly renderWidth?: number;
  renderHeight?: number;
  readonly laserRenderMode?: LaserRenderMode;
  readonly laserVisualStyle?: LaserVisualStyle;
  readonly laserFramePairStartOffset?: number;
  readonly laserSpawnTicks?: number;
  readonly laserDespawnTicks?: number;
  readonly anchorX: number | undefined;
  readonly anchorY: number | undefined;
  visibleFrom: number;
  expireAt: number | undefined;
  damageFrom?: number;
  damageUntil?: number;
  homingStartAt: number;
  homingUntil: number;
  pausedUntil: number;
  retargetAt: number | undefined;
  retargetSpeed: number | undefined;
  retargetX: number | undefined;
  retargetY: number | undefined;
  retargetAimOwner: FighterKey | undefined;
  followAimOwner: FighterKey | undefined;
  followWhileActiveCharacterId: CharacterDefinition["id"] | undefined;
  followOwner: FighterKey | undefined;
  followOwnerDistance: number | undefined;
  followOwnerAngle: number | undefined;
  rollUntil: number;
  rollStartedAt: number;
  widthGrowthPerTick: number;
  maxWidth: number | undefined;
  heightGrowthPerTick: number;
  maxHeight: number | undefined;
  renderHeightGrowthPerTick: number;
  maxRenderHeight: number | undefined;
  readonly damage: number;
  angle: number;
  readonly couldClear: boolean;
  readonly clearsProjectiles: boolean;
  readonly piercesTargets: boolean;
  polarOriginX: number | undefined;
  polarOriginY: number | undefined;
  polarRadius: number | undefined;
  polarAngle: number | undefined;
  polarRadialSpeed: number | undefined;
  polarAngularSpeed: number | undefined;
  polarFollowOwner: FighterKey | undefined;
}
