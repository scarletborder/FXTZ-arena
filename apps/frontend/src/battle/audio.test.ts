import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Input: {
      Keyboard: {
        KeyCodes: {
          W: 87,
          A: 65,
          S: 83,
          D: 68,
          SHIFT: 16,
          R: 82,
          TAB: 9,
          ENTER: 13,
          E: 69,
        },
      },
    },
  },
}));

import type { BattleOutputState } from "@repo/types";
import type {
  CharacterDefinition,
  FighterKey,
  FighterState,
  ProjectileState,
} from "@repo/content";

import AudioCmd, { type AudioCommand } from "../commands/AudioCmd";
import { BattleAudioDirector } from "./sfx/audio";

describe("BattleAudioDirector", () => {
  it("plays a firing cue when Iku launches a normal familiar", () => {
    const commands: AudioCommand[] = [];
    const unsubscribe = AudioCmd.subscribe((command) => {
      commands.push(command);
    });

    try {
      const director = new BattleAudioDirector();
      const previous = battleState({
        frame: 20,
        projectiles: [],
        player: fighter("Player1", character("iku")),
      });
      const current = battleState({
        frame: 21,
        projectiles: [],
        player: {
          ...fighter("Player1", character("iku")),
          shotsFired: 1,
        },
      });

      director.sync(previous, { eventTypes: [] });
      director.sync(current, { eventTypes: [] });

      const playedKeys = commands
        .filter((command) => command.type === "play")
        .map((command) => command.key);

      expect(playedKeys).toContain("se_tan00");
    } finally {
      unsubscribe();
    }
  });

  it("does not classify Neutral projectiles as Player2 character shots", () => {
    const commands: AudioCommand[] = [];
    const unsubscribe = AudioCmd.subscribe((command) => {
      commands.push(command);
    });

    try {
      const director = new BattleAudioDirector();
      const previous = battleState({ frame: 10, projectiles: [] });
      const current = battleState({
        frame: 11,
        projectiles: [
          projectile({
            id: 101,
            owner: "Neutral",
            kind: "orb",
            width: 10,
            height: 10,
          }),
        ],
      });

      director.sync(previous, { eventTypes: [] });
      director.sync(current, { eventTypes: [] });

      const playedKeys = commands
        .filter((command) => command.type === "play")
        .map((command) => command.key);

      expect(playedKeys).toContain("se_tan00");
      expect(playedKeys).not.toContain("se_lazer00");
    } finally {
      unsubscribe();
    }
  });
});

function battleState(params: {
  readonly frame: number;
  readonly projectiles: readonly ProjectileState[];
  readonly player?: FighterState;
  readonly target?: FighterState;
}): BattleOutputState {
  return {
    frame: params.frame,
    gameOver: false,
    result: "running",
    player: params.player ?? fighter("Player1", character("reimu")),
    target: params.target ?? fighter("Player2", character("marisa")),
    points: [],
    neutralMobs: [],
    projectiles: params.projectiles,
    effects: [],
    shields: [],
    stats: {
      shots: 0,
      hits: 0,
      bombUses: 0,
      damage: 0,
      elapsedTicks: params.frame,
    },
  };
}

function fighter(
  key: FighterKey,
  activeCharacter: CharacterDefinition,
): FighterState {
  return {
    key,
    x: 0,
    y: 0,
    facing: 0,
    previousX: 0,
    previousY: 0,
    previousFacing: 0,
    lives: 3,
    bombs: 3,
    pointCount: 0,
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
    abilityCards: [],
    activeCardUses: 0,
    activeCardCooldownUntil: 0,
    hakkeroBeamCooldownUntil: 0,
    sakuraCharmGuardAvailable: false,
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

function projectile(params: {
  readonly id: number;
  readonly owner: FighterKey;
  readonly kind: ProjectileState["kind"];
  readonly width: number;
  readonly height: number;
}): ProjectileState {
  return {
    id: params.id,
    kind: params.kind,
    owner: params.owner,
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    vx: 0,
    vy: 0,
    width: params.width,
    previousWidth: params.width,
    previousHeight: params.height,
    previousRenderHeight: undefined,
    height: params.height,
    centerOffsetX: 0,
    centerOffsetY: 0,
    anchorX: undefined,
    anchorY: undefined,
    visibleFrom: 0,
    expireAt: undefined,
    homingStartAt: 0,
    homingUntil: 0,
    pausedUntil: 0,
    retargetAt: undefined,
    retargetSpeed: undefined,
    retargetX: undefined,
    retargetY: undefined,
    retargetAimOwner: undefined,
    followAimOwner: undefined,
    followWhileActiveCharacterId: undefined,
    followOwner: undefined,
    followOwnerDistance: undefined,
    followOwnerAngle: undefined,
    rollUntil: 0,
    rollStartedAt: 0,
    widthGrowthPerTick: 0,
    maxWidth: undefined,
    heightGrowthPerTick: 0,
    maxHeight: undefined,
    renderHeightGrowthPerTick: 0,
    maxRenderHeight: undefined,
    damage: 1,
    angle: 0,
    couldClear: true,
    clearsProjectiles: false,
    piercesTargets: false,
    polarOriginX: undefined,
    polarOriginY: undefined,
    polarRadius: undefined,
    polarAngle: undefined,
    polarRadialSpeed: undefined,
    polarAngularSpeed: undefined,
    polarFollowOwner: undefined,
  };
}
