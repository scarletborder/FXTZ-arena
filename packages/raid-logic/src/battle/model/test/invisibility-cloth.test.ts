import { describe, expect, it } from "vitest";

import { createBattleModel, input, hitPlayer } from "./helpers";

describe("BattleModel Invisibility Cloth card", () => {
  it("grants 2 seconds of invulnerability and prevents all player actions", async () => {
    const model = await createBattleModel(
      "reimu",
      "marisa",
      ["invisibility_cloth"],
      "invisibility_cloth",
    );
    const start = {
      x: model.player.x,
      y: model.player.y,
      characterId: model.player.activeCharacter.id,
      lives: model.player.lives,
      bombs: model.player.bombs,
      ammo: model.player.ammo,
    };

    model.step(input({ activeCardPressed: true }));

    expect(model.player.activeCardUses).toBe(1);
    expect(model.player.activeCardCooldownUntil).toBe(16 * 60);
    expect(model.player.invulnerableUntil).toBe(2 * 60);
    expect(model.player.actionLockedUntil).toBe(2 * 60);
    expect(model.player.movementLockedUntil).toBe(2 * 60);
    expect(model.player.switchLockedUntil).toBe(2 * 60);

    hitPlayer(model);
    expect(model.player.lives).toBe(start.lives);

    model.step(
      input({
        moveX: 1,
        shootPressed: true,
        bombPressed: true,
        activeCardPressed: true,
        alternateHeld: true,
      }),
    );

    expect(model.player.x).toBe(start.x);
    expect(model.player.y).toBe(start.y);
    expect(model.player.activeCharacter.id).toBe(start.characterId);
    expect(model.player.bombs).toBe(start.bombs);
    expect(model.player.ammo).toBe(start.ammo);
    expect(model.projectiles.filter((p) => p.owner === "Player1")).toHaveLength(
      0,
    );
    expect(model.player.activeCardUses).toBe(1);
  });
});
