import { describe, expect, it } from "vitest";

import { BattleModel } from "../model";
import { initializeBattleModel, testProjectile } from "../model/test/helpers";
import { CpuPlayer } from ".";

describe("CpuPlayer Marisa null preset", () => {
  it("keeps Marisa active in the Marisa + Ellen CPU loadout", async () => {
    const model = await createCpuModel();
    const cpu = new CpuPlayer();

    const action = cpu.getAction({
      frame: 1,
      self: model.target,
      opponent: model.player,
      projectiles: [],
      neutralMobs: [],
      points: [],
    });

    expect(action.alternateHeld).toBe(false);
  });

  it("farms neutral mobs before point 100", async () => {
    const model = await createCpuModel();
    const cpu = new CpuPlayer();
    model.target.pointCount = 80;

    const action = cpu.getAction({
      frame: 1,
      self: model.target,
      opponent: model.player,
      projectiles: [],
      neutralMobs: [
        {
          id: 1,
          key: "Neutral",
          kind: "test_mob",
          x: model.target.x - 140,
          y: model.target.y + 40,
          previousX: model.target.x - 140,
          previousY: model.target.y + 40,
          hitRadius: 12,
          waveId: 1,
          movementVariant: "",
          form: "idle",
          MaxHealth: 10,
          CurrentHealth: 10,
          active: true,
          ageTicks: 0,
          sfxFlags: 0,
        },
      ],
      points: [],
    });

    expect(action.aimX).toBe(model.target.x - 140);
    expect(action.aimY).toBe(model.target.y + 40);
  });

  it("keeps distance instead of hugging neutral mobs while farming", async () => {
    const model = await createCpuModel();
    const cpu = new CpuPlayer();
    model.target.pointCount = 80;

    const action = cpu.getAction({
      frame: 1,
      self: model.target,
      opponent: model.player,
      projectiles: [],
      neutralMobs: [
        {
          id: 1,
          key: "Neutral",
          kind: "test_mob",
          x: model.target.x + 40,
          y: model.target.y,
          previousX: model.target.x + 40,
          previousY: model.target.y,
          hitRadius: 12,
          waveId: 1,
          movementVariant: "",
          form: "idle",
          MaxHealth: 10,
          CurrentHealth: 10,
          active: true,
          ageTicks: 0,
          sfxFlags: 0,
        },
      ],
      points: [],
    });

    expect(action.aimX).toBe(model.target.x + 40);
    expect(action.moveX).toBe(-1);
  });

  it("moves toward point items while still using dodge movement", async () => {
    const model = await createCpuModel();
    const cpu = new CpuPlayer();
    const self = model.target;

    const action = cpu.getAction({
      frame: 1,
      self,
      opponent: model.player,
      projectiles: [
        testProjectile({
          id: 1,
          owner: "Player1",
          x: self.x,
          y: self.y - 160,
          vx: 0,
          vy: -4,
          angle: -Math.PI / 2,
          width: 8,
          height: 8,
        }),
      ],
      neutralMobs: [],
      points: [
        {
          id: 1,
          prefabId: "point_small",
          x: self.x + 150,
          y: self.y,
          previousX: self.x + 150,
          previousY: self.y,
          vx: 0,
          vy: 0,
          size: 15,
          value: 1,
          active: true,
          collectingBy: undefined,
          collectTicksRemaining: 0,
        },
      ],
    });

    expect(action.moveX).toBe(1);
    expect(action.bombPressed).toBe(false);
  });

  it("takes a narrow safe gap when a point item is behind it", async () => {
    const model = await createCpuModel();
    const cpu = new CpuPlayer();
    const self = model.target;

    const action = cpu.getAction({
      frame: 1,
      self,
      opponent: model.player,
      projectiles: [
        testProjectile({
          id: 1,
          owner: "Player1",
          x: self.x + 35,
          y: self.y - 12,
          previousX: self.x + 35,
          previousY: self.y - 12,
          vx: 0,
          vy: 0,
          width: 8,
          height: 8,
        }),
        testProjectile({
          id: 2,
          owner: "Player1",
          x: self.x + 35,
          y: self.y + 12,
          previousX: self.x + 35,
          previousY: self.y + 12,
          vx: 0,
          vy: 0,
          width: 8,
          height: 8,
        }),
      ],
      neutralMobs: [],
      points: [
        {
          id: 1,
          prefabId: "point_small",
          x: self.x + 150,
          y: self.y,
          previousX: self.x + 150,
          previousY: self.y,
          vx: 0,
          vy: 0,
          size: 15,
          value: 1,
          active: true,
          collectingBy: undefined,
          collectTicksRemaining: 0,
        },
      ],
    });

    expect(action.moveX).toBe(1);
    expect(action.bombPressed).toBe(false);
  });

  it("does not bomb for nearby non-immediate threats", async () => {
    const model = await createCpuModel();
    const cpu = new CpuPlayer();
    const self = model.target;

    const projectiles = [0, 1, 2].map((index) =>
      testProjectile({
        id: index + 1,
        owner: "Player1",
        x: self.x - 90,
        y: self.y + index * 28,
        vx: 5,
        vy: 0,
        angle: 0,
        width: 8,
        height: 8,
      }),
    );

    const action = cpu.getAction({
      frame: 1,
      self,
      opponent: model.player,
      projectiles,
      neutralMobs: [],
      points: [],
    });

    expect(action.bombPressed).toBe(false);
  });

  it("uses swept physics bodies to dodge high-speed bullets crossing this frame", async () => {
    const model = await createCpuModel();
    const cpu = new CpuPlayer();
    const self = model.target;

    const action = cpu.getAction({
      frame: 1,
      self,
      opponent: model.player,
      projectiles: [
        testProjectile({
          id: 1,
          owner: "Player1",
          x: self.x - 80,
          y: self.y + 9,
          vx: 160,
          vy: 0,
          angle: 0,
          width: 8,
          height: 8,
        }),
      ],
      neutralMobs: [],
      points: [],
    });

    expect(action.moveY).toBe(-1);
    expect(action.bombPressed).toBe(false);
  });

  it("bombs when every move collides within two frames", async () => {
    const model = await createCpuModel();
    const cpu = new CpuPlayer();
    const self = model.target;

    const action = cpu.getAction({
      frame: 1,
      self,
      opponent: model.player,
      projectiles: [
        testProjectile({
          id: 1,
          kind: "laser",
          owner: "Player1",
          x: self.x,
          y: self.y,
          vx: 0,
          vy: 0,
          angle: 0,
          width: 2000,
          height: 2000,
        }),
      ],
      neutralMobs: [],
      points: [],
    });

    expect(action.bombPressed).toBe(true);
  });
});

async function createCpuModel(): Promise<BattleModel> {
  return initializeBattleModel(
    new BattleModel(
      {
        player: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
        },
        target: {
          primaryCharacterId: "marisa",
          alternateCharacterId: "ellen",
        },
      },
      {
        neutralMobSpawner: null,
      },
    ),
  );
}
