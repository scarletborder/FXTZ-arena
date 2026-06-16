import { describe, expect, it } from "vitest";

import { BattleModel } from "../model";
import { initializeBattleModel, testProjectile } from "../model/test/helpers";
import { CpuPlayer } from ".";
import { marisaNullPreset } from "./presets/preset_marisa_null";

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

  it("sometimes aims directly at the player after point 100", async () => {
    const model = await createCpuModel();
    model.target.pointCount = 120;
    model.player.x = model.target.x + 180;
    model.player.y = model.target.y - 60;
    model.player.previousX = model.player.x - 24;
    model.player.previousY = model.player.y + 12;

    const action = marisaNullPreset.getDecision({
      frame: 4,
      self: model.target,
      opponent: model.player,
      projectiles: [],
      neutralMobs: [],
      points: [],
      dodgeResult: {
        moveX: 0,
        moveY: 0,
        threatCount: 0,
        emergencyBomb: false,
      },
      intel: {
        canAct: true,
        dodgeAccuracy: 1,
        reactionDelay: 0,
        aimNoise: 0,
        isDumb: false,
        dullingProgress: 0,
        ignoreDodge: false,
      },
    });

    expect(action.shootPressed).toBe(true);
    expect(action.aimX).toBe(model.player.x);
    expect(action.aimY).toBe(model.player.y);
  });

  it("mostly keeps predictive aim after point 100", async () => {
    const model = await createCpuModel();
    model.target.pointCount = 120;
    model.player.x = model.target.x + 180;
    model.player.y = model.target.y - 60;
    model.player.previousX = model.player.x - 24;
    model.player.previousY = model.player.y + 12;

    const action = marisaNullPreset.getDecision({
      frame: 3,
      self: model.target,
      opponent: model.player,
      projectiles: [],
      neutralMobs: [],
      points: [],
      dodgeResult: {
        moveX: 0,
        moveY: 0,
        threatCount: 0,
        emergencyBomb: false,
      },
      intel: {
        canAct: true,
        dodgeAccuracy: 1,
        reactionDelay: 0,
        aimNoise: 0,
        isDumb: false,
        dullingProgress: 0,
        ignoreDodge: false,
      },
    });

    expect(action.shootPressed).toBe(true);
    expect(action.aimX === model.player.x && action.aimY === model.player.y).toBe(
      false,
    );
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
          rewardKind: "point",
          rewardSize: "small",
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
          rewardKind: "point",
          rewardSize: "small",
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

describe("CpuPlayer duo presets", () => {
  it("switches from Sakuya to Cirno and bombs under immediate bullet pressure", async () => {
    const model = await createCpuModel("sakuya", "cirno");
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
          width: 2000,
          height: 2000,
        }),
      ],
      neutralMobs: [],
      points: [],
    });

    expect(action.alternateHeld).toBe(true);
    expect(action.bombPressed).toBe(true);
  });

  it("keeps Sakuya active at mid range and does not use Sakuya bomb", async () => {
    const model = await createCpuModel("sakuya", "cirno");
    const cpu = new CpuPlayer();
    model.player.x = model.target.x - 330;
    model.player.y = model.target.y;
    model.player.previousX = model.player.x;
    model.player.previousY = model.player.y;

    const action = cpu.getAction({
      frame: 1,
      self: model.target,
      opponent: model.player,
      projectiles: [],
      neutralMobs: [],
      points: [],
    });

    expect(action.alternateHeld).toBe(false);
    expect(action.bombPressed).toBe(false);
  });

  it("switches to Cirno under dense nearby pressure but saves bomb if it can dodge", async () => {
    const model = await createCpuModel("sakuya", "cirno");
    const cpu = new CpuPlayer();
    const self = model.target;

    const projectiles = Array.from({ length: 5 }, (_, index) =>
      testProjectile({
        id: index + 1,
        owner: "Player1",
        x: self.x + 96 + index * 8,
        y: self.y + 112,
        vx: 0,
        vy: 0,
        width: 4,
        height: 4,
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

    expect(action.alternateHeld).toBe(true);
    expect(action.bombPressed).toBe(false);
  });

  it("centers Kaguya bomb on the player at the ten-second check when pressure is severe", async () => {
    const model = await createCpuModel("kaguya", "reisen");
    const cpu = new CpuPlayer();
    const player = model.player;

    const projectiles = Array.from({ length: 16 }, (_, index) =>
      testProjectile({
        id: index + 1,
        owner: "Player2",
        x: player.x + ((index % 4) - 1.5) * 18,
        y: player.y + (Math.floor(index / 4) - 1.5) * 18,
        vx: 0,
        vy: 0,
        width: 8,
        height: 8,
      }),
    );

    const action = cpu.getAction({
      frame: 600,
      self: model.target,
      opponent: player,
      projectiles,
      neutralMobs: [],
      points: [],
    });

    expect(action.alternateHeld).toBe(false);
    expect(action.bombPressed).toBe(true);
    expect(action.aimX).toBe(player.x);
    expect(action.aimY).toBe(player.y);
  });

  it("does not use Kaguya bomb outside the ten-second check even when pressure is severe", async () => {
    const model = await createCpuModel("kaguya", "reisen");
    const cpu = new CpuPlayer();
    const player = model.player;
    const projectiles = Array.from({ length: 16 }, (_, index) =>
      testProjectile({
        id: index + 1,
        owner: "Player2",
        x: player.x + ((index % 4) - 1.5) * 18,
        y: player.y + (Math.floor(index / 4) - 1.5) * 18,
        vx: 0,
        vy: 0,
        width: 8,
        height: 8,
      }),
    );

    const action = cpu.getAction({
      frame: 599,
      self: model.target,
      opponent: player,
      projectiles,
      neutralMobs: [],
      points: [],
    });

    expect(action.bombPressed).toBe(false);
  });

  it("does not use Kaguya bomb at the ten-second check with only fifteen nearby bullets", async () => {
    const model = await createCpuModel("kaguya", "reisen");
    const cpu = new CpuPlayer();
    const player = model.player;
    const projectiles = Array.from({ length: 15 }, (_, index) =>
      testProjectile({
        id: index + 1,
        owner: "Player2",
        x: player.x + ((index % 5) - 2) * 14,
        y: player.y + (Math.floor(index / 5) - 1) * 18,
        vx: 0,
        vy: 0,
        width: 8,
        height: 8,
      }),
    );

    const action = cpu.getAction({
      frame: 600,
      self: model.target,
      opponent: player,
      projectiles,
      neutralMobs: [],
      points: [],
    });

    expect(action.bombPressed).toBe(false);
  });

  it("switches to Reisen bomb for an unavoidable incoming hit", async () => {
    const model = await createCpuModel("kaguya", "reisen");
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
          width: 2000,
          height: 2000,
        }),
      ],
      neutralMobs: [],
      points: [],
    });

    expect(action.alternateHeld).toBe(true);
    expect(action.bombPressed).toBe(true);
  });

  it("does not try to switch into Reisen while Kaguya bomb locks switching", async () => {
    const model = await createCpuModel("kaguya", "reisen");
    const cpu = new CpuPlayer();
    const self = model.target;
    self.switchLockedUntil = 20;

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
          width: 2000,
          height: 2000,
        }),
      ],
      neutralMobs: [],
      points: [],
    });

    expect(action.alternateHeld).toBe(false);
    expect(action.bombPressed).toBe(false);
  });
});

async function createCpuModel(
  primaryCharacterId: BattleModel["target"]["primaryCharacter"]["id"] = "marisa",
  alternateCharacterId: BattleModel["target"]["alternateCharacter"]["id"] = "ellen",
): Promise<BattleModel> {
  return initializeBattleModel(
    new BattleModel(
      {
        player: {
          primaryCharacterId: "reimu",
          alternateCharacterId: "marisa",
        },
        target: {
          primaryCharacterId,
          alternateCharacterId,
        },
      },
      {
        neutralMobSpawner: null,
      },
    ),
  );
}
