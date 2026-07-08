import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    BlendModes: {
      ADD: 1,
    },
  },
}));

import type {
  CharacterDefinition,
  FighterKey,
  FighterState,
} from "@repo/content";

import { WingmanView } from "./index";

describe("WingmanView", () => {
  it("renders Iku wingmen from tier 2 onward", () => {
    const scene = createSceneStub();
    const view = new WingmanView(scene);

    view.render({
      player: fighter("Player1", character("iku"), 100),
      target: fighter("Player2", character("reimu"), 0),
      frame: 30,
      gameOver: false,
      localFighterKey: "Player1",
      alpha: 1,
    });

    expect(scene.containers[0]?.visible).toBe(true);
    expect(scene.graphics[0]?.commands).toContain("lineTo");
  });

  it("renders a rear Reimu-style wingman for multi-shot", () => {
    const scene = createSceneStub();
    const view = new WingmanView(scene);

    view.render({
      player: fighter("Player1", character("marisa"), 0, ["multi_shot"]),
      target: fighter("Player2", character("marisa"), 0),
      frame: 30,
      gameOver: false,
      localFighterKey: "Player1",
      alpha: 1,
    });

    expect(scene.containers[0]?.visible).toBe(true);
    expect(scene.graphics[0]?.commands).toContain("fillCircle");
    expect(scene.containers[1]?.visible).toBe(false);
  });

  it("renders a rear Marisa-style laser wingman for Hakkero", () => {
    const scene = createSceneStub();
    const view = new WingmanView(scene);

    view.render({
      player: fighter("Player1", character("reimu"), 0, ["hakkero"]),
      target: fighter("Player2", character("marisa"), 0),
      frame: 30,
      gameOver: false,
      localFighterKey: "Player1",
      alpha: 1,
    });

    expect(scene.containers[0]?.visible).toBe(true);
    expect(scene.graphics[0]?.commands).toContain("lineTo");
    expect(scene.containers[1]?.visible).toBe(false);
  });
});

function createSceneStub() {
  const containers: ContainerStub[] = [];
  const graphics: GraphicsStub[] = [];
  return {
    containers,
    graphics,
    add: {
      container: (x: number, y: number) => {
        const container = new ContainerStub(x, y);
        containers.push(container);
        return container;
      },
      graphics: () => {
        const graphic = new GraphicsStub();
        graphics.push(graphic);
        return graphic;
      },
    },
  } as unknown as Phaser.Scene & {
    containers: ContainerStub[];
    graphics: GraphicsStub[];
  };
}

class ContainerStub {
  visible = true;
  alpha = 1;

  constructor(
    public x: number,
    public y: number,
  ) {}

  setDepth(): this {
    return this;
  }

  add(): this {
    return this;
  }

  setVisible(value: boolean): this {
    this.visible = value;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setAlpha(value: number): this {
    this.alpha = value;
    return this;
  }
}

class GraphicsStub {
  readonly commands: string[] = [];

  setBlendMode(): this {
    return this;
  }

  clear(): this {
    this.commands.push("clear");
    return this;
  }

  fillStyle(): this {
    return this;
  }

  fillCircle(): this {
    this.commands.push("fillCircle");
    return this;
  }

  lineStyle(): this {
    return this;
  }

  beginPath(): this {
    return this;
  }

  moveTo(): this {
    return this;
  }

  lineTo(): this {
    this.commands.push("lineTo");
    return this;
  }

  strokePath(): this {
    return this;
  }

  arc(): this {
    return this;
  }

  closePath(): this {
    return this;
  }

  fillPath(): this {
    return this;
  }
}

function fighter(
  key: FighterKey,
  activeCharacter: CharacterDefinition,
  pointCount: number,
  abilityCardIds: readonly string[] = [],
): FighterState {
  return {
    key,
    x: 10,
    y: 20,
    facing: 0,
    previousX: 10,
    previousY: 20,
    previousFacing: 0,
    lives: 3,
    bombs: 3,
    pointCount,
    ammo: 0,
    ammoDisplay: 0,
    ammoCapacity: 0,
    reloadRemaining: 0,
    reloadTotal: 0,
    reloadStartedAmmo: 0,
    reloadCharacterId: undefined,
    ammoByCharacterId: {},
    primaryCharacter: activeCharacter,
    activeCharacter,
    alternateCharacter: activeCharacter,
    activeCard: undefined,
    abilityCards: abilityCardIds.map((id) => abilityCard(id)),
    activeCardUses: 0,
    activeCardCooldownUntil: 0,
    hakkeroBeamCooldownUntil: 0,
    shotsFired: 0,
    hits: 0,
    hitsTaken: 0,
    damageTaken: 0,
    deaths: 0,
    bombUses: 0,
    moveSpeedOverride: undefined,
    moveSpeedOverrideUntil: 0,
    moveSpeedOverrideDelayRemaining: 0,
    pendingMoveSpeedOverride: undefined,
    pendingMoveSpeedOverrideDuration: 0,
    reisenShieldLayers: 0,
    hitCircleRadiusMultiplier: 1,
    youmuBombDashDelayRemaining: 0,
    youmuBombDashStartX: undefined,
    youmuBombDashStartY: undefined,
    youmuBombDashAimX: undefined,
    youmuBombDashAimY: undefined,
    invulnerableUntil: 0,
    invulnerableDelayRemaining: 0,
    invulnerableDelayDuration: 0,
    deadUntil: 0,
    actionLockedUntil: 0,
    nonFireActionLockedUntil: 0,
    switchLockedUntil: 0,
    movementLockedUntil: 0,
    projectilePauseUntil: 0,
    timeStopUntil: 0,
    fireCooldownUntil: 0,
    bombCooldownUntil: 0,
    flashUntil: 0,
    statusVisibleUntil: 0,
    grazedProjectileIds: [],
  };
}

function abilityCard(id: string): FighterState["abilityCards"][number] {
  return {
    id: id as FighterState["abilityCards"][number]["id"],
    name: id,
    cost: 0,
    kind: "passive",
    useLimit: "infinite",
    cooldownTicks: 0,
    description: "",
    gallery: {
      iconAsset: "",
    },
    collaborateShop: {
      rarity: "common",
    },
  };
}

function character(id: CharacterDefinition["id"]): CharacterDefinition {
  return {
    id,
    name: id,
    cost: 0,
    roleClass: "assault",
    moveSpeed: "medium",
    ammoCapacity: 0,
    reloadTicksPerAmmo: 0,
    reloadStartPolicy: "reset_to_zero",
    reloadCommitPolicy: "commit_on_finish",
    fireRate: "medium",
    bulletSpeed: "medium",
    description: "",
    normalAttackId: "",
    bombId: "",
    gallery: {
      portraitAsset: "",
      attackPreviewAsset: "",
      combatAsset: "",
    },
  };
}
