import type {
  AbilityCardId,
  AbilityCardKind,
  CharacterId,
  ReloadCommitPolicy,
  ReloadStartPolicy,
  RoleClass,
  SpeedRank,
} from "./index";

export interface CharacterGalleryAssets {
  readonly portraitAsset: string;
  readonly attackPreviewAsset: string;
  readonly combatAsset: string;
}

export interface CharacterDefinition {
  readonly id: CharacterId;
  readonly name: string;
  readonly cost: number;
  readonly roleClass: RoleClass;
  readonly moveSpeed: SpeedRank;
  readonly ammoCapacity: number;
  readonly reloadTicksPerAmmo: number;
  readonly reloadStartPolicy: ReloadStartPolicy;
  readonly reloadCommitPolicy: ReloadCommitPolicy;
  readonly fireRate: SpeedRank;
  readonly bulletSpeed: SpeedRank;
  readonly description: string;
  readonly normalAttackId: string;
  readonly bombId: string;
  readonly gallery: CharacterGalleryAssets;
}

export interface AbilityCardGalleryAssets {
  readonly iconAsset: string;
}

export interface AbilityCardDefinition {
  readonly id: AbilityCardId;
  readonly name: string;
  readonly cost: number;
  readonly kind: AbilityCardKind;
  readonly useLimit: "infinite" | number;
  readonly cooldownTicks: number;
  readonly description: string;
  readonly gallery: AbilityCardGalleryAssets;
}
