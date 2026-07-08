import { HIT_CIRCLE_DIAMETER } from "@repo/constants";

import { secondsToTicks } from "../seconds-to-ticks";
import type { AbilityCardDefinition } from "./types";
import { BattleAbilityCard, type BattleCardContext } from "./base";
import { Vanilla } from "../decorators";

const HAKKERO_WINGMAN_DISTANCE = 36;
const HAKKERO_BEAM_THICKNESS = HIT_CIRCLE_DIAMETER * 2;
const HAKKERO_BEAM_WINDUP_TICKS = secondsToTicks(0.8);
const HAKKERO_BEAM_SPAWN_TICKS = 6;
const HAKKERO_BEAM_DURATION_TICKS = secondsToTicks(0.35);
const HAKKERO_BEAM_DESPAWN_TICKS = 6;
const HAKKERO_BEAM_COOLDOWN_TICKS = secondsToTicks(2);

export class HakkeroBattleCard extends BattleAbilityCard {
  readonly id: AbilityCardDefinition["id"] = "hakkero";
  readonly name = "content.ability_cards.hakkero.name";
  readonly cost = 2;
  readonly kind = "passive" as AbilityCardDefinition["kind"];
  readonly useLimit: AbilityCardDefinition["useLimit"] = "infinite";
  readonly cooldownTicks = 0;
  readonly description = "content.ability_cards.hakkero.description";
  readonly gallery: AbilityCardDefinition["gallery"] = {
    iconAsset: "assets/ability-cards/hakkero/icon.png",
  };

  onAfterFire(ctx: BattleCardContext): void {
    if (ctx.self.hakkeroBeamCooldownUntil > 0) return;

    const wingmanX =
      ctx.self.x - Math.cos(ctx.self.facing) * HAKKERO_WINGMAN_DISTANCE;
    const wingmanY =
      ctx.self.y - Math.sin(ctx.self.facing) * HAKKERO_WINGMAN_DISTANCE;
    const angle = ctx.self.facing;

    this.spawnBeamPreview(ctx, wingmanX, wingmanY, angle);
    this.spawnBeam(ctx, wingmanX, wingmanY, angle);
    ctx.self.hakkeroBeamCooldownUntil = HAKKERO_BEAM_COOLDOWN_TICKS;
  }

  private spawnBeamPreview(
    ctx: BattleCardContext,
    x: number,
    y: number,
    angle: number,
  ): void {
    ctx.spawnLaser({
      owner: ctx.self.key,
      sourceCharacterId: "marisa",
      x,
      y,
      angle,
      renderHeight: HAKKERO_BEAM_THICKNESS,
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks: HAKKERO_BEAM_WINDUP_TICKS,
      damage: 0,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      couldClear: false,
    });
  }

  private spawnBeam(
    ctx: BattleCardContext,
    x: number,
    y: number,
    angle: number,
  ): void {
    const visibleFrom = ctx.frame + HAKKERO_BEAM_WINDUP_TICKS;
    const damageFrom = visibleFrom + HAKKERO_BEAM_SPAWN_TICKS;
    const damageUntil = damageFrom + HAKKERO_BEAM_DURATION_TICKS;

    ctx.spawnLaser({
      owner: ctx.self.key,
      sourceCharacterId: "marisa",
      x,
      y,
      angle,
      height: HAKKERO_BEAM_THICKNESS,
      renderHeight: HAKKERO_BEAM_THICKNESS,
      laserVisualStyle: "th06",
      laserFramePairStartOffset: 1,
      laserSpawnTicks: HAKKERO_BEAM_SPAWN_TICKS,
      laserDespawnTicks: HAKKERO_BEAM_DESPAWN_TICKS,
      initialLength: Number.POSITIVE_INFINITY,
      maxLength: Number.POSITIVE_INFINITY,
      lengthGrowthPerTick: 0,
      speedRank: "low",
      expireTicks:
        HAKKERO_BEAM_WINDUP_TICKS +
        HAKKERO_BEAM_SPAWN_TICKS +
        HAKKERO_BEAM_DURATION_TICKS +
        HAKKERO_BEAM_DESPAWN_TICKS,
      damage: 1,
      spawnOffset: 0,
      pinned: true,
      anchored: true,
      rayLike: true,
      visibleFrom,
      pausedUntil: visibleFrom,
      damageFrom,
      damageUntil,
      couldClear: false,
    });
  }
}

Vanilla.registerCard("hakkero")(HakkeroBattleCard);
