import {
  ConfirmedFrameHashAccumulator,
  createRaidLogicRuntime,
  type BattleModelSnapshot,
  type RaidLogicRuntime,
} from "@repo/raid-logic";
import type {
  BattleConfig,
  BattleInputState,
  ClientMessage,
  PlayerLoadout,
  ServerMessage,
} from "@repo/types";

import { MessageHandler } from "../../../../../dedicated-server/src/protocol/handler";
import { RoomLifecycle } from "../../../../../dedicated-server/src/room/lifecycle";
import { RoomManager } from "../../../../../dedicated-server/src/room/manager";
import { SessionStore } from "../../../../../dedicated-server/src/session/store";
import type { TransportConnection } from "../../../../../dedicated-server/src/transport/interface";
import type { BattleSceneData } from "../../../battle/loadout";
import type { ConnectionManager } from "../../client";
import { CombatSyncManager } from "../manager";
import type { CombatRollbackRecord } from "../types";

const FRAME_MS = 1000 / 60;
const ACTIVE_FRAMES = 60;
const SETTLE_FRAMES = 18;

export interface RollbackConsistencyCase {
  readonly name: string;
  readonly playerOneLoadout: PlayerLoadout;
  readonly playerTwoLoadout: PlayerLoadout;
  readonly latencyMs: Readonly<Record<TestPlayerId, number>>;
}

export interface RollbackConsistencyResult {
  readonly confirmedFrame: number;
  readonly playerOneHash: string;
  readonly playerTwoHash: string;
  readonly playerOneGlobalHash: string;
  readonly playerTwoGlobalHash: string;
  readonly rollbackCounts: Readonly<Record<TestPlayerId, number>>;
}

export async function runRollbackConsistencyCase(
  testCase: RollbackConsistencyCase,
): Promise<RollbackConsistencyResult> {
  const harness = new DedicatedServerHarness(testCase.latencyMs);
  const config = harness.setupBattle(
    testCase.playerOneLoadout,
    testCase.playerTwoLoadout,
  );
  const playerOne = await createClient(
    "Player1",
    config,
    harness.endpoint("Player1"),
  );
  const playerTwo = await createClient(
    "Player2",
    config,
    harness.endpoint("Player2"),
  );

  for (let tick = 0; tick < ACTIVE_FRAMES + SETTLE_FRAMES; tick += 1) {
    harness.deliverDue(tick);
    playerOne.step(tick);
    playerTwo.step(tick);
  }
  harness.deliverAll();

  playerOne.expectNoSampledHashMutations();
  playerTwo.expectNoSampledHashMutations();
  const confirmedFrame = Math.min(
    playerOne.manager.getConfirmedFrame(),
    playerTwo.manager.getConfirmedFrame(),
  );
  if (confirmedFrame < ACTIVE_FRAMES - 18) {
    throw new Error(
      `${testCase.name}: only confirmed through frame ${confirmedFrame}`,
    );
  }
  expectFrameHashesMatch(playerOne, playerTwo, confirmedFrame, testCase.name);
  const playerOneHash = requireHash(playerOne, confirmedFrame, testCase.name);
  const playerTwoHash = requireHash(playerTwo, confirmedFrame, testCase.name);
  const playerOneGlobalHash = playerOne.globalHashAt(confirmedFrame);
  const playerTwoGlobalHash = playerTwo.globalHashAt(confirmedFrame);

  playerOne.manager.destroy();
  playerTwo.manager.destroy();

  return {
    confirmedFrame,
    playerOneHash,
    playerTwoHash,
    playerOneGlobalHash,
    playerTwoGlobalHash,
    rollbackCounts: {
      Player1: playerOne.rollbackCount,
      Player2: playerTwo.rollbackCount,
    },
  };
}

async function createClient(
  localPlayerId: TestPlayerId,
  config: BattleConfig,
  endpoint: ClientEndpoint,
): Promise<SimulatedClient> {
  const runtime = createRaidLogicRuntime({
    mode: "online",
    loadouts: loadoutsFromConfig(config),
    mapId: config.mapId,
    battleMode: config.battleMode,
    seed: config.seed,
  });
  await runtime.initialize();

  const snapshotHistory = new Map<number, BattleModelSnapshot>();
  const hashHistory = new Map<number, string>();
  const hashBacklog = new Map<number, string>();
  const sampledFrameHashes = new Map<number, string>();
  const sampledHashMutations: string[] = [];
  const globalHash = new ConfirmedFrameHashAccumulator();
  let rollbackCount = 0;

  const sampleConfirmedThrough = (frame: number): void => {
    for (
      let nextFrame = globalHash.lastSampledFrame + 1;
      nextFrame <= frame;
      nextFrame += 1
    ) {
      const hash = hashBacklog.get(nextFrame) ?? hashHistory.get(nextFrame);
      if (!hash) throw new Error(`Missing hash for confirmed frame ${nextFrame}`);
      globalHash.addSample({ frame: nextFrame, hashHex: hash });
      sampledFrameHashes.set(nextFrame, hash);
      hashBacklog.delete(nextFrame);
    }
  };

  const recordFrame = (): void => {
    for (const output of runtime.outputQueue.drainAll()) {
      const sampledHash = sampledFrameHashes.get(output.frame);
      if (sampledHash && sampledHash !== output.hashHex) {
        sampledHashMutations.push(
          `${output.frame}: sampled=${sampledHash}, replayed=${output.hashHex}`,
        );
      }
      snapshotHistory.set(output.frame, output.snapshot);
      hashHistory.set(output.frame, output.hashHex);
      if (output.frame > globalHash.lastSampledFrame) {
        hashBacklog.set(output.frame, output.hashHex);
      }
    }
  };
  recordFrame();

  const client = {} as SimulatedClient;
  const manager = new CombatSyncManager(
    runtime,
    endpoint as unknown as ConnectionManager,
    {
      sceneData: {
        mode: "online",
        localPlayerId,
        loadouts: loadoutsFromConfig(config),
        battleConfig: config,
      } satisfies BattleSceneData,
      callbacks: {
        recordFrame,
        getRollbackRecord: (frame) => {
          const snapshot = snapshotHistory.get(frame);
          return snapshot
            ? ({ frame, snapshot } satisfies CombatRollbackRecord)
            : null;
        },
        pruneRollbackHistoryAfter: (frame) => {
          pruneAfter(snapshotHistory, frame);
          pruneAfter(hashHistory, frame);
          pruneAfter(hashBacklog, frame);
        },
        pruneRollbackHistoryBefore: (frame) => {
          sampleConfirmedThrough(frame);
          pruneBefore(snapshotHistory, frame);
        },
        onRollback: () => {
          rollbackCount += 1;
        },
        setStatusText: () => undefined,
        hideStatusText: () => undefined,
        delay: (_ms, callback) => callback(),
        finishBattle: () => undefined,
      },
    },
  );

  Object.assign(client, {
    manager,
    runtime,
    step: (tick: number) =>
      manager.step(createRealisticInput(localPlayerId, tick)),
    hashAt: (frame: number) => hashHistory.get(frame),
    sampledHashAt: (frame: number) => sampledFrameHashes.get(frame),
    globalHashAt: (frame: number) => {
      sampleConfirmedThrough(frame);
      return globalHash.digestHex(frame);
    },
    expectNoSampledHashMutations: () => {
      if (sampledHashMutations.length > 0) {
        throw new Error(sampledHashMutations.join("\n"));
      }
    },
  } satisfies Omit<SimulatedClient, "rollbackCount">);
  Object.defineProperty(client, "rollbackCount", {
    get: () => rollbackCount,
  });
  return client;
}

interface SimulatedClient {
  readonly manager: CombatSyncManager;
  readonly runtime: RaidLogicRuntime;
  readonly rollbackCount: number;
  step(tick: number): void;
  hashAt(frame: number): string | undefined;
  sampledHashAt(frame: number): string | undefined;
  globalHashAt(frame: number): string;
  expectNoSampledHashMutations(): void;
}

function createRealisticInput(
  playerId: TestPlayerId,
  frame: number,
): BattleInputState {
  const phase = playerId === "Player1" ? 0 : Math.PI;
  const angle = frame * 0.13 + phase;
  return {
    moveX: Math.cos(angle) >= 0 ? 1 : -1,
    moveY: Math.sin(angle * 0.83) >= 0 ? 1 : -1,
    aimX: 640 + Math.cos(frame * 0.071 + phase) * 420,
    aimY: 338 + Math.sin(frame * 0.097 + phase) * 260,
    shootPressed: frame % 11 !== 0,
    bombPressed: frame > 0 && frame % 37 === 5,
    activeCardPressed: frame > 0 && frame % 41 === 9,
    reloadPressed: frame % 29 === 13,
    alternateHeld: frame % 48 >= 24,
    infoHeld: frame % 53 < 4,
  };
}

function loadoutsFromConfig(config: BattleConfig) {
  const player = config.players[0].loadout;
  const target = config.players[1].loadout;
  return {
    player: toRuntimeLoadout(player, config.lifeCount),
    target: toRuntimeLoadout(target, config.lifeCount),
  };
}

function toRuntimeLoadout(loadout: PlayerLoadout, lives: number) {
  return {
    primaryCharacterId: loadout.primaryCharacterId,
    alternateCharacterId: loadout.alternateCharacterId,
    cardIds: loadout.abilityCardIds,
    activeCardId: loadout.activeAbilityCardId,
    storyModeOverride: { enabled: true as const, lives },
  };
}

function expectFrameHashesMatch(
  left: SimulatedClient,
  right: SimulatedClient,
  finalFrame: number,
  name: string,
): void {
  const mismatches: string[] = [];
  for (let frame = 0; frame <= finalFrame; frame += 1) {
    const leftHash = left.hashAt(frame);
    const rightHash = right.hashAt(frame);
    const leftSampled = left.sampledHashAt(frame);
    const rightSampled = right.sampledHashAt(frame);
    if (leftSampled && leftHash !== leftSampled) {
      mismatches.push(`${frame}: Player1 sampled ${leftSampled}, final ${leftHash}`);
    }
    if (rightSampled && rightHash !== rightSampled) {
      mismatches.push(`${frame}: Player2 sampled ${rightSampled}, final ${rightHash}`);
    }
    if (leftSampled && rightSampled && leftSampled !== rightSampled) {
      mismatches.push(`${frame}: ${leftSampled} != ${rightSampled}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`${name}\n${mismatches.slice(0, 20).join("\n")}`);
  }
}

function requireHash(
  client: SimulatedClient,
  frame: number,
  name: string,
): string {
  const hash = client.hashAt(frame);
  if (!hash) throw new Error(`${name}: missing hash at frame ${frame}`);
  return hash;
}

function pruneAfter<T>(history: Map<number, T>, frame: number): void {
  for (const key of history.keys()) if (key > frame) history.delete(key);
}

function pruneBefore<T>(history: Map<number, T>, frame: number): void {
  for (const key of history.keys()) if (key < frame) history.delete(key);
}

type TestPlayerId = "Player1" | "Player2";

class DedicatedServerHarness {
  private readonly handler = new MessageHandler(
    new SessionStore(),
    new RoomManager(),
    new RoomLifecycle(),
    {
      port: 22334,
      ipv4Host: "127.0.0.1",
      ipv6Host: "::1",
      webTransport: false,
      enableCollaborate: true,
      maxPlayersPerRoom: 2,
      maxRooms: 8,
      serverVersion: "test",
    },
  );
  private readonly endpoints: Record<TestPlayerId, ClientEndpoint>;
  private readonly queue: ScheduledMessage[] = [];
  private tick = 0;

  constructor(latencyMs: Readonly<Record<TestPlayerId, number>>) {
    this.endpoints = {
      Player1: new ClientEndpoint("Player1", this),
      Player2: new ClientEndpoint("Player2", this),
    };
    this.latencyTicks = {
      Player1: Math.max(1, Math.round(latencyMs.Player1 / FRAME_MS)),
      Player2: Math.max(1, Math.round(latencyMs.Player2 / FRAME_MS)),
    };
    this.handler.registerConnection(this.endpoints.Player1.serverConnection);
    this.handler.registerConnection(this.endpoints.Player2.serverConnection);
  }

  private readonly latencyTicks: Readonly<Record<TestPlayerId, number>>;

  endpoint(playerId: TestPlayerId): ClientEndpoint {
    return this.endpoints[playerId];
  }

  setupBattle(
    playerOneLoadout: PlayerLoadout,
    playerTwoLoadout: PlayerLoadout,
  ): BattleConfig {
    this.send("Player1", {
      type: "hello",
      username: "A",
      clientVersion: "test",
      debug: true,
    });
    this.send("Player2", {
      type: "hello",
      username: "B",
      clientVersion: "test",
      debug: true,
    });
    this.deliverAll();
    this.send("Player1", {
      type: "create_room",
      name: "rollback-consistency",
      mapId: "hakurei_shrine",
      lifeCount: 8,
      costLimit: 100,
    });
    this.deliverAll();
    const roomId = this.endpoint("Player1").latest("room_created")?.roomId;
    if (!roomId) throw new Error("Room was not created");
    this.send("Player2", { type: "join_room", roomId });
    this.deliverAll();
    this.send("Player2", { type: "lobby_ready", ready: true });
    this.deliverAll();
    this.send("Player1", { type: "start_game" });
    this.deliverAll();
    this.send("Player1", { type: "ready", loadout: playerOneLoadout });
    this.send("Player2", { type: "ready", loadout: playerTwoLoadout });
    this.deliverAll();
    const config = this.endpoint("Player1").latest("battle_start")?.config;
    if (!config) {
      const error = this.endpoint("Player1").latest("error");
      throw new Error(error?.message ?? "Battle did not start");
    }
    this.send("Player1", { type: "loading_done" });
    this.send("Player2", { type: "loading_done" });
    this.deliverAll();
    this.endpoint("Player1").clearMessages();
    this.endpoint("Player2").clearMessages();
    return config;
  }

  send(from: TestPlayerId, message: ClientMessage): void {
    this.queue.push({
      deliverAt: this.tick + this.latencyTicks[from],
      run: () => this.handler.handle(this.endpoints[from].serverConnection, message),
    });
  }

  sendToClient(to: TestPlayerId, message: ServerMessage): void {
    this.queue.push({
      deliverAt: this.tick + this.latencyTicks[to],
      run: () => this.endpoints[to].receive(message),
    });
  }

  deliverDue(tick: number): void {
    this.tick = tick;
    for (let index = 0; index < this.queue.length; ) {
      const item = this.queue[index]!;
      if (item.deliverAt > tick) {
        index += 1;
        continue;
      }
      this.queue.splice(index, 1);
      item.run();
    }
  }

  deliverAll(): void {
    while (this.queue.length > 0) {
      this.deliverDue(Math.min(...this.queue.map((item) => item.deliverAt)));
    }
  }
}

class ClientEndpoint {
  private handler: ((message: ServerMessage) => void) | null = null;
  readonly messages: ServerMessage[] = [];
  readonly serverConnection: TransportConnection;

  constructor(
    readonly playerId: TestPlayerId,
    private readonly network: DedicatedServerHarness,
  ) {
    this.serverConnection = {
      id: `rollback-${playerId}`,
      send: (message) => this.network.sendToClient(playerId, message),
      close: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      onError: () => undefined,
    };
  }

  send(message: ClientMessage): void {
    this.network.send(this.playerId, message);
  }

  setMessageHandler(
    handler: ((message: ServerMessage) => void) | null,
  ): void {
    this.handler = handler;
  }

  receive(message: ServerMessage): void {
    this.messages.push(message);
    this.handler?.(message);
  }

  latest<T extends ServerMessage["type"]>(
    type: T,
  ): Extract<ServerMessage, { type: T }> | undefined {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const message = this.messages[index]!;
      if (message.type === type) {
        return message as Extract<ServerMessage, { type: T }>;
      }
    }
    return undefined;
  }

  clearMessages(): void {
    this.messages.length = 0;
  }
}

interface ScheduledMessage {
  readonly deliverAt: number;
  run(): void;
}
