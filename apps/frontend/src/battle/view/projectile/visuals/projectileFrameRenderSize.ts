import { bulletRenderSizeForHitSize } from "@repo/content";
import type { ProjectileState } from "@repo/raid-logic";

import type { ProjectileDisplay, ProjectileSpec } from "../types";

export function projectileFrameRenderSize(
  projectile: ProjectileState,
  display: ProjectileDisplay,
  frame: Extract<ProjectileSpec, { readonly kind: "image" }>["frame"],
): [number, number] {
  if (
    projectile.renderWidth !== undefined &&
    projectile.renderHeight !== undefined
  ) {
    return [display.width, display.height];
  }
  const size = bulletRenderSizeForHitSize(display, {
    rectWidth: frame.width,
    rectHeight: frame.height,
    hitWidth: frame.hitWidth,
    hitHeight: frame.hitHeight,
  });
  return [size.width, size.height];
}
