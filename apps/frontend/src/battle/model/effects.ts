import type { EffectState } from "../types";

export class EffectSystem {
  private nextEffectId = 1;

  reset(): void {
    this.nextEffectId = 1;
  }

  spawnRing(
    effects: EffectState[],
    frame: number,
    x: number,
    y: number,
    tint: number,
    scale: number,
    duration: number,
  ): void {
    effects.push({
      id: this.nextEffectId++,
      kind: "ring",
      x,
      y,
      tint,
      scale,
      expireAt: frame + duration,
    });
  }

  stepEffects(effects: EffectState[], frame: number): void {
    effects.splice(0, effects.length, ...effects.filter((effect) => frame < effect.expireAt));
  }
}
