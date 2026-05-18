import type { CharacterDefinition } from "@repo/content";

import type { FighterState } from "../../types";
import { BattleCharacter, hitCircleUnits, secondsToTicks, type CharacterActionContext } from "./base";

const CLEAR_RING_TICKS = secondsToTicks(2 / 3);

export class ReimuBattleCharacter extends BattleCharacter {
  constructor(definition: CharacterDefinition) {
    super(definition);
  }

  readonly moveSpeed = this.definition.moveSpeed;
  readonly fireRate = this.definition.fireRate;
  readonly ammoCapacity = this.definition.ammoCapacity;
  readonly reloadTicks = this.definition.reloadTicks;
  override readonly reloadPolicy = "keep_partial";

  shoot(ctx: CharacterActionContext, fighter: FighterState, aimX: number, aimY: number): void {
    const angle = this.aimAngle(fighter, aimX, aimY);
    for (const offset of [-Math.PI / 4, 0, Math.PI / 4]) {
      this.spawnHomingOrb(ctx, fighter, angle + offset, secondsToTicks(2));
    }
  }

  useBomb(ctx: CharacterActionContext, fighter: FighterState): void {
    this.startBomb(ctx, fighter);
    this.setInvulnerable(fighter, secondsToTicks(2));
    const radius = this.clearProjectiles(ctx, fighter, 6);
    this.spawnClearRing(ctx, fighter, radius, 0xaec7ff, CLEAR_RING_TICKS);

    for (let index = 0; index < 12; index += 1) {
      const spawnAngle = (index / 12) * Math.PI * 2;
      const x = fighter.x + Math.cos(spawnAngle) * radius;
      const y = fighter.y + Math.sin(spawnAngle) * radius;
      const shotAngle = Math.atan2(ctx.opponent.y - y, ctx.opponent.x - x);
      this.spawnHomingOrbAt(
        ctx,
        fighter,
        x,
        y,
        shotAngle,
        secondsToTicks(1.5),
      );
    }
  }

  useActiveCard(ctx: CharacterActionContext, fighter: FighterState): void {
    this.useSpiritStrike(ctx, fighter, 0x7ee39d);
  }

  private spawnHomingOrb(ctx: CharacterActionContext, fighter: FighterState, angle: number, homingTicks: number): void {
    this.spawnHomingOrbAt(ctx, fighter, fighter.x, fighter.y, angle, homingTicks);
  }

  private spawnHomingOrbAt(
    ctx: CharacterActionContext,
    fighter: FighterState,
    x: number,
    y: number,
    angle: number,
    homingTicks: number,
  ): void {
    ctx.projectileSystem.spawnBullet(ctx.projectiles, {
      owner: fighter.key,
      kind: "orb",
      x,
      y,
      angle,
      speedRank: "low",
      width: hitCircleUnits(2),
      height: hitCircleUnits(1),
      frame: ctx.frame,
      homingTicks,
      spawnOffset: 0,
    });
  }
}
