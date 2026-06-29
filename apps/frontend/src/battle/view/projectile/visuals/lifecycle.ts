import type { ProjectileVisual } from "../types";

export function destroyVisual(visual: ProjectileVisual): void {
  if (visual.kind === "image") {
    visual.image.destroy();
  } else if (visual.kind === "sprite") {
    visual.sprite.destroy();
  } else if (visual.kind === "graphics") {
    visual.graphics.destroy();
  } else {
    visual.container.destroy(true);
  }
}
