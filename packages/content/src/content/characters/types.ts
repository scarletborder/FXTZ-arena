import type {
  AmmoPolicy,
  RoleClass,
  SpeedRank,
} from "../taxonomy";
import type { CharacterId } from "../ids";

export interface CharacterGalleryAssets {
  readonly portraitAsset: string;
  readonly attackPreviewAsset: string;
}

export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly name: string;
  readonly cost: number;
  readonly roleClass: RoleClass;
  readonly moveSpeed: SpeedRank;
  readonly ammoCapacity: number;
  readonly reloadTicks: number;
  readonly fireRate: SpeedRank;
  readonly bulletSpeed: SpeedRank;
  readonly ammoPolicy: AmmoPolicy;
  readonly description: string;
  readonly normalAttackId: string;
  readonly bombId: string;
  readonly gallery: CharacterGalleryAssets;
}