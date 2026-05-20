import type { AbilityCardId } from "../ids";
import type { AbilityCardKind } from "../taxonomy";

export interface AbilityCardGalleryAssets {
  readonly iconAsset: string;
  readonly previewAsset: string;
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