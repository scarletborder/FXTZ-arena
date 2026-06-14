import { EXAMPLE_COLLABORATE_NODES, getCombatMapDefinition } from "@repo/content";
import { DEFAULT_BOMBS, DEFAULT_COST_LIMIT, TICK_RATE } from "@repo/constants";
import type { BattleConfig, ClientMessage, MapId, ServerMessage } from "@repo/types";
import type { BattleInputState } from "@repo/raid-logic";

import type { FighterLoadout } from "../battle/loadout";
import type { PeerConnection, P2pStatus } from "../network/p2p";
import type { DebugCooperateJumpTarget } from "./shared";
import { uiSettings } from "../store/settings";

export const DEBUG_COOPERATE_LIVES = 999;

export interface DebugCooperateEliteOption {
  readonly id: string;
  readonly name: string;
  readonly nodeIndex: number;
}

export interface DebugCooperateJumpConfig {
  readonly target: DebugCooperateJumpTarget;
  readonly eliteWaveIndex?: number;
}

export interface DebugCooperateRuntimeJump {
  readonly nodeIndex: number;
  readonly currentWaveId: string;
  readonly transitionTarget?: "elite" | "boss";
}

export function getDebugCooperateEliteOptions(mapId: MapId): readonly DebugCooperateEliteOption[] {
  return debugCooperateNodesForMap(mapId)
    .map((node, nodeIndex) => ({ node, nodeIndex }))
    .filter(({ node }) => node.kind === "wave" && node.members.some((member) => member.class === "elite"))
    .map(({ node, nodeIndex }, index) => ({
      id: String(index),
      name: `${index + 1}. ${node.id}`,
      nodeIndex,
    }));
}

export function resolveDebugCooperateRuntimeJump(
  mapId: MapId,
  config: DebugCooperateJumpConfig | undefined,
): DebugCooperateRuntimeJump | undefined {
  if (!config || config.target === "start") {
    return undefined;
  }

  const nodes = debugCooperateNodesForMap(mapId);
  if (config.target === "elite") {
    const elite = getDebugCooperateEliteOptions(mapId)[config.eliteWaveIndex ?? 0];
    if (!elite) return undefined;
    return {
      nodeIndex: elite.nodeIndex,
      currentWaveId: nodes[elite.nodeIndex]?.id ?? elite.name,
      transitionTarget: "elite",
    };
  }

  const bossIndex = nodes.findIndex(
    (node) => node.kind === "wave" && node.members.some((member) => member.class === "boss"),
  );
  if (bossIndex < 0) return undefined;
  return {
    nodeIndex: bossIndex,
    currentWaveId: nodes[bossIndex]?.id ?? "boss",
    transitionTarget: "boss",
  };
}

export function createDebugCooperateBattleConfig(params: {
  readonly mapId: MapId;
  readonly playerLoadout: FighterLoadout;
  readonly botLoadout: FighterLoadout;
}): BattleConfig {
  const map = getCombatMapDefinition(params.mapId);
  const leftSpawn = map?.spawnPoints[0]?.id ?? "left";
  const rightSpawn = map?.spawnPoints[1]?.id ?? leftSpawn;
  return {
    battleId: `debug-cooperate-${Date.now()}`,
    battleMode: "collaborate",
    mapId: params.mapId,
    seed: 1,
    fps: TICK_RATE,
    lifeCount: DEBUG_COOPERATE_LIVES,
    defaultBombCount: DEFAULT_BOMBS,
    costLimit: DEFAULT_COST_LIMIT,
    p2pEnabled: false,
    players: [
      {
        playerId: "Player1",
        username: uiSettings.username,
        loadout: toPlayerLoadout(params.playerLoadout),
        spawnPointId: leftSpawn,
      },
      {
        playerId: "Player2",
        username: "Ready Bot",
        loadout: toPlayerLoadout(params.botLoadout),
        spawnPointId: rightSpawn,
      },
    ],
  };
}

export function createDebugCooperateBotPeer(): PeerConnection {
  return new DebugCooperateBotPeer();
}

export function withDebugCooperateResources(loadout: FighterLoadout): FighterLoadout {
  return {
    ...loadout,
    cardIds: [],
    activeCardId: undefined,
    storyModeOverride: {
      enabled: true,
      lives: DEBUG_COOPERATE_LIVES,
      bombs: DEFAULT_BOMBS,
    },
  };
}

export function debugCooperateBotLoadout(): FighterLoadout {
  return withDebugCooperateResources({
    primaryCharacterId: "reimu",
    alternateCharacterId: "marisa",
    cardIds: [],
    activeCardId: undefined,
  });
}

function debugCooperateNodesForMap(mapId: MapId) {
  const map = getCombatMapDefinition(mapId);
  if (map?.mobSpawnerId === "example-collaborate-mob-spawner") {
    return EXAMPLE_COLLABORATE_NODES;
  }
  return [];
}

function toPlayerLoadout(loadout: FighterLoadout): BattleConfig["players"][number]["loadout"] {
  return {
    primaryCharacterId: loadout.primaryCharacterId,
    alternateCharacterId: loadout.alternateCharacterId,
    abilityCardIds: [...(loadout.cardIds ?? [])],
    activeAbilityCardId: loadout.activeCardId,
  };
}

class DebugCooperateBotPeer implements PeerConnection {
  private statusHandler: ((status: P2pStatus) => void) | undefined;
  private messageHandler: (message: ServerMessage) => void = () => undefined;
  private lastAckFrame = 0;

  get connected(): boolean {
    return true;
  }

  get remoteLoadingDone(): boolean {
    return true;
  }

  get status(): P2pStatus {
    return "connected";
  }

  start(): void {
    this.statusHandler?.("connected");
  }

  close(): void {
    this.statusHandler = undefined;
  }

  setStatusHandler(handler: ((status: P2pStatus) => void) | undefined): void {
    this.statusHandler = handler;
  }

  setMessageHandler(handler: (message: ServerMessage) => void): void {
    this.messageHandler = handler;
  }

  handleServerMessage(): boolean {
    return false;
  }

  send(message: ClientMessage): boolean {
    if (message.type === "loading_done") {
      this.messageHandler({ type: "peer_loading_done", playerId: "Player2" });
      return true;
    }
    if (message.type === "input_frame") {
      this.lastAckFrame = Math.max(this.lastAckFrame, message.frame);
      this.messageHandler({
        type: "input_frame",
        playerId: "Player2",
        frame: message.frame,
        ackFrame: this.lastAckFrame,
        ...readyBotInput(),
      });
      return true;
    }
    if (message.type === "game_over") {
      this.messageHandler({
        type: "peer_game_over",
        playerId: "Player2",
        frame: message.frame,
        ackFrame: message.frame,
        winnerPlayerId: message.winnerPlayerId,
      });
      return true;
    }
    if (message.type === "collaborate_shop_forced_ready") {
      this.messageHandler({
        type: "peer_collaborate_shop_forced_ready",
        playerId: "Player2",
        frame: message.frame,
        shopIndex: message.shopIndex,
      });
      return true;
    }
    return true;
  }
}

function readyBotInput(): BattleInputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 1200,
    aimY: 720,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
    transitionReadyPressed: true,
    shopReadyPressed: true,
    shopPurchaseItemId: undefined,
    activeCardSwitchId: undefined,
  };
}
