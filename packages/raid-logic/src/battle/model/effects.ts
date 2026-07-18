import type { EffectState } from "@repo/types";

export class EffectSystem {
  private nextEffectId = 1;

  reset(): void {
    this.nextEffectId = 1;
  }

  getNextId(): number {
    return this.nextEffectId;
  }

  restoreNextId(effects: readonly EffectState[], nextEffectId?: number): void {
    const nextIdFromEffects =
      Math.max(0, ...effects.map((effect) => effect.id)) + 1;
    this.nextEffectId = Math.max(
      nextEffectId ?? nextIdFromEffects,
      nextIdFromEffects,
    );
  }

  spawnRing(
    effects: EffectState[],
    frame: number,
    x: number,
    y: number,
    tint: number,
    scale: number,
    duration: number,
    scalePerTick?: number,
  ): void {
    effects.push({
      id: this.nextEffectId++,
      kind: "ring",
      x,
      y,
      tint,
      scale,
      scalePerTick,
      expireAt: frame + duration,
    });
  }

  stepEffects(effects: EffectState[], frame: number): void {
    for (const effect of effects) {
      effect.scale += effect.scalePerTick ?? 0;
    }
    effects.splice(
      0,
      effects.length,
      ...effects.filter((effect) => frame < effect.expireAt),
    );
  }
}
