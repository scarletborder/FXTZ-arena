import Phaser from "phaser";

import type { ArenaBounds } from "@repo/constants";
import type { FighterState } from "@repo/raid-logic";
import type { MobState } from "@repo/types";

import { BossDirectionIndicatorView } from "./boss-direction-indicators";
import { MobBreakEffectView } from "./break-effects";
import { MobDamageTagView } from "./damage-tags";
import { MobHealthRingView } from "./health-rings";
import { lerp } from "./math";
import { MobSpriteView } from "./mob-sprites";

export class MobView {
  private readonly sprites: MobSpriteView;
  private readonly damageTags: MobDamageTagView;
  private readonly healthRings: MobHealthRingView;
  private readonly bossDirectionIndicators: BossDirectionIndicatorView;
  private readonly breakEffects: MobBreakEffectView;

  constructor(scene: Phaser.Scene) {
    this.sprites = new MobSpriteView(scene);
    this.damageTags = new MobDamageTagView(scene);
    this.healthRings = new MobHealthRingView(scene);
    this.bossDirectionIndicators = new BossDirectionIndicatorView(scene);
    this.breakEffects = new MobBreakEffectView(scene);
  }

  render(
    neutralMobs: readonly MobState[],
    localFighter: FighterState,
    frame: number,
    arenaBounds: ArenaBounds,
    alpha = 1,
    rollbackBlend = 1,
  ): void {
    const activeIds = new Set<number>();

    for (const mob of neutralMobs) {
      if (!mob.active) {
        continue;
      }

      activeIds.add(mob.id);
      const x = lerp(mob.previousX, mob.x, alpha);
      const y = lerp(mob.previousY, mob.y, alpha);
      const rendered = this.sprites.render(mob, x, y, frame, rollbackBlend);
      const fallbackWidth = mob.hitWidth ?? mob.hitRadius * 2;
      const fallbackHeight = mob.hitHeight ?? mob.hitRadius * 2;

      this.healthRings.render(
        mob,
        x,
        y,
        rendered?.displayWidth ?? fallbackWidth,
        rendered?.displayHeight ?? fallbackHeight,
        rollbackBlend,
      );
      this.damageTags.render(mob, x, y, rollbackBlend);
    }

    this.sprites.removeInactive(activeIds, (sprite, id) => {
      this.breakEffects.spawn(
        sprite.x,
        sprite.y,
        sprite.displayWidth,
        sprite.displayHeight,
      );
      this.bossDirectionIndicators.remove(id);
    });
    this.healthRings.removeInactive(activeIds);
    this.damageTags.removeInactive(activeIds);
    this.bossDirectionIndicators.render(
      neutralMobs,
      localFighter,
      frame,
      arenaBounds,
      alpha,
    );
    this.breakEffects.render();
  }
}
