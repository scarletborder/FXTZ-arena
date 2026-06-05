import { fp } from "@shaisrc/fixed-point";

import { fpMax } from "./fp";

export type BulletHitBoxSize = number | "full";

export interface BulletAssetMetrics {
  readonly rectWidth: number;
  readonly rectHeight: number;
  readonly hitWidth: number;
  readonly hitHeight: BulletHitBoxSize;
}

const BULLET_ASSET_METRICS: Readonly<Record<string, BulletAssetMetrics>> = {
  bullet_type_1: metrics(16, 16, 10, 10),
  laser_type_1: metrics(16, 15, 10, "full"),
  bullet_type_2: metrics(16, 16, 10, 10),
  bullet_type_3: metrics(16, 16, 10, 10),
  bullet_type_4: metrics(16, 16, 6, 6),
  bullet_type_5: metrics(16, 16, 6, 6),
  bullet_type_6: metrics(16, 16, 6, 6),
  bullet_type_7: metrics(16, 16, 12, 12),
  bullet_type_8: metrics(16, 16, 8, 8),
  bullet_type_9: metrics(16, 16, 8, 8),
  bullet_type_10: metrics(16, 16, 10, 10),
  bullet_type_11: metrics(16, 16, 10, 10),
  bullet_type_12: metrics(8, 8, 4, 4),
  bullet_type_13: metrics(8, 8, 4, 4),
  bullet_type_14: metrics(32, 32, 20, 20),
  bullet_type_15: metrics(8, 8, 4, 4),
  bullet_type_16: metrics(16, 16, 10, 10),
  bullet_type_17: metrics(32, 32, 20, 20),
  bullet_type_18: metrics(32, 32, 20, 20),
  bullet_type_19: metrics(32, 32, 20, 20),
  bullet_type_20: metrics(32, 32, 20, 20),
  bullet_type_21: metrics(32, 32, 20, 20),
  bullet_type_22: metrics(32, 32, 20, 20),
  bullet_type_23: metrics(64, 64, 40, 40),
  bullet_type_24: metrics(32, 32, 20, 20),
  bullet_type_25: metrics(32, 32, 20, 20),
  bullet_type_26: metrics(32, 32, 20, 20),
  bullet_type_27: metrics(32, 32, 20, 20),
  bullet_type_28: metrics(64, 64, 40, 40),
  bullet_type_29: metrics(32, 32, 20, 20),
  bullet_type_30: metrics(32, 32, 20, 20),
};

export interface ProjectileSize {
  readonly width: number;
  readonly height: number;
}

export function bulletAssetIdFromTextureKey(
  textureKey: string | undefined,
): string | undefined {
  if (!textureKey) {
    return undefined;
  }
  const offsetIndex = textureKey.indexOf("_offset_");
  return offsetIndex < 0 ? textureKey : textureKey.slice(0, offsetIndex);
}

export function getBulletAssetMetrics(
  textureKey: string | undefined,
): BulletAssetMetrics | undefined {
  const assetId = bulletAssetIdFromTextureKey(textureKey);
  return assetId ? BULLET_ASSET_METRICS[assetId] : undefined;
}

export function normalizeBulletHitSize(
  size: ProjectileSize,
  metrics: BulletAssetMetrics | undefined,
): ProjectileSize {
  if (!metrics || size.width <= 0 || size.height <= 0) {
    return size;
  }

  const hitHeight = resolvedHitHeight(metrics);
  if (metrics.hitWidth <= 0 || hitHeight <= 0) {
    return size;
  }

  const scale = fpMax(
    fp.div(fp.fromFloat(size.width), fp.fromFloat(metrics.hitWidth)),
    fp.div(fp.fromFloat(size.height), fp.fromFloat(hitHeight)),
  );

  return {
    width: fp.toFloat(fp.mul(fp.fromFloat(metrics.hitWidth), scale)),
    height: fp.toFloat(fp.mul(fp.fromFloat(hitHeight), scale)),
  };
}

export function bulletRenderSizeForHitSize(
  size: ProjectileSize,
  metrics: BulletAssetMetrics | undefined,
): ProjectileSize {
  if (!metrics || size.width <= 0 || size.height <= 0) {
    return size;
  }

  const hitHeight = resolvedHitHeight(metrics);
  if (
    metrics.hitWidth <= 0 ||
    hitHeight <= 0 ||
    metrics.rectWidth <= 0 ||
    metrics.rectHeight <= 0
  ) {
    return size;
  }

  return {
    width: fp.toFloat(
      fp.mul(
        fp.fromFloat(size.width),
        fp.div(fp.fromFloat(metrics.rectWidth), fp.fromFloat(metrics.hitWidth)),
      ),
    ),
    height: fp.toFloat(
      fp.mul(
        fp.fromFloat(size.height),
        fp.div(fp.fromFloat(metrics.rectHeight), fp.fromFloat(hitHeight)),
      ),
    ),
  };
}

function resolvedHitHeight(metrics: BulletAssetMetrics): number {
  return metrics.hitHeight === "full" ? metrics.rectHeight : metrics.hitHeight;
}

function metrics(
  rectWidth: number,
  rectHeight: number,
  hitWidth: number,
  hitHeight: BulletHitBoxSize,
): BulletAssetMetrics {
  return { rectWidth, rectHeight, hitWidth, hitHeight };
}
