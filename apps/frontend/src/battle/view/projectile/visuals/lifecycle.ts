import type { ProjectileVisual } from "../types";

export function destroyVisual(visual: ProjectileVisual): void {
  if (visual.kind === "image") {
    visual.image.destroy();
  } else {
    visual.container.destroy(true);
  }
}
