import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Input: {
      Keyboard: {
        JustDown: (key: { _justDown?: boolean }) => {
          const justDown = key._justDown === true;
          key._justDown = false;
          return justDown;
        },
      },
    },
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    },
  },
}));

import { getAbilityCardDefinition, getCharacterDefinition } from "@repo/content";
import {
  ConfirmedFrameHashAccumulator,
  createRaidLogicRuntime,
  type BattleModelSnapshot,
  type RaidLogicRuntime,
} from "@repo/raid-logic";
import type { BattleConfig, BattleInputState, ClientMessage, PlayerId, PlayerLoadout, ServerMessage } from "@repo/types";

import { MessageHandler } from "../../../../dedicated-server/src/protocol/handler";
import { RoomLifecycle } from "../../../../dedicated-server/src/room/lifecycle";
import { RoomManager } from "../../../../dedicated-server/src/room/manager";
import { SessionStore } from "../../../../dedicated-server/src/session/store";
import type { TransportConnection } from "../../../../dedicated-server/src/transport/interface";
import { createBattleInput, type BattleKeyMap } from "../../battle/input-controller/input";
import type { BattleSceneData } from "../../battle/loadout";
import type { ConnectionManager } from "../client";
import type { P2pConnection } from "../p2p";
import { CombatSyncManager } from "./manager";
import type { CombatRollbackRecord } from "./types";

describe("CombatSyncManager rollback integration", () => {
  it.each([
    {
      name: "asymmetric latency",
      latency: {
        "Player1": { clientToServer: 2, serverToClient: 6 },
        "Player2": { clientToServer: 8, serverToClient: 3 },
      },
    },
    {
      name: "high asymmetric latency",
      latency: {
        "Player1": { clientToServer: 10, serverToClient: 18 },
        "Player2": { clientToServer: 22, serverToClient: 12 },
      },
    },
  ])("matches final frame and global BLAKE3 hashes through the dedicated server with $name", async ({ latency }) => {
    expect(getCharacterDefinition("reimu")).toBeDefined();
    expect(getAbilityCardDefinition("spirit_strike_card")).toBeDefined();

    const harness = new DedicatedServerHarness(latency);

    const config = harness.setupBattle();
    const clientA = await createClient("Player1", config, harness.endpoint("Player1"));
    const clientB = await createClient("Player2", config, harness.endpoint("Player2"));

    let tick = 0;
    for (; tick < 900 && (!clientA.serverConfirmedFrame || !clientB.serverConfirmedFrame); tick += 1) {
      harness.deliverDue(tick);
      clientA.step(tick);
      clientB.step(tick);
    }

    harness.deliverAll();
    for (; tick < 960 && (!clientA.serverConfirmedFrame || !clientB.serverConfirmedFrame); tick += 1) {
      clientA.step(tick);
      clientB.step(tick);
      harness.deliverDue(tick);
    }
    harness.deliverAll();

    clientA.expectNoSampledHashMutations();
    clientB.expectNoSampledHashMutations();

    const finalFrame = clientA.serverConfirmedFrame ?? Math.min(clientA.manager.getConfirmedFrame(), clientB.manager.getConfirmedFrame());
    expect(clientB.serverConfirmedFrame ?? finalFrame).toBe(finalFrame);
    expect(finalFrame).toBeGreaterThan(120);
    expectFrameHashesMatch(clientA, clientB, finalFrame);
    expect(clientA.hashAt(finalFrame)).toBe(clientB.hashAt(finalFrame));
    expect(clientA.globalHashAt(finalFrame)).toBe(clientB.globalHashAt(finalFrame));
  }, 45_000);

  it("submits a bounded game_over verdict when the peer has already stopped", () => {
    const sent: ClientMessage[] = [];
    let handler: ((msg: ServerMessage) => void) | null = null;
    let runtimeFrame = 12;
    const runtime = {
      get frame() {
        return runtimeFrame;
      },
      gameOver: false,
      state: {
        result: "running",
        target: { lives: 1 },
      },
      step: () => {
        runtimeFrame += 1;
      },
      deserialize: () => undefined,
    } as unknown as RaidLogicRuntime;
    const dispatch = (msg: ServerMessage) => {
      const currentHandler: (msg: ServerMessage) => void = handler ?? (() => {
        throw new Error("CombatSyncManager did not install a message handler");
      });
      currentHandler(msg);
    };

    const manager = new CombatSyncManager(runtime, {
      send: (msg: ClientMessage) => {
        sent.push(msg);
      },
      setMessageHandler: (nextHandler: ((msg: ServerMessage) => void) | null) => {
        handler = nextHandler;
      },
    } as unknown as ConnectionManager, {
      sceneData: {
        mode: "online",
        localPlayerId: "Player1",
      } satisfies BattleSceneData,
      callbacks: {
        recordFrame: () => undefined,
        getRollbackRecord: () => null,
        pruneRollbackHistoryAfter: () => undefined,
        pruneRollbackHistoryBefore: () => undefined,
        onRollback: () => undefined,
        setStatusText: () => undefined,
        hideStatusText: () => undefined,
        delay: (_ms, callback) => callback(),
        finishBattle: () => undefined,
      },
    });

    for (let frame = 1; frame <= 12; frame += 1) {
      dispatch({
        type: "input_frame",
        playerId: "Player2",
        frame,
        ackFrame: frame - 1,
        ...testInput(),
      });
    }
    manager.step(testInput());
    sent.length = 0;

    dispatch({
      type: "peer_game_over",
      playerId: "Player2",
      frame: 20,
      ackFrame: 13,
      winnerPlayerId: "Player1",
    });

    expect(sent).toEqual([
      {
        type: "game_over",
        frame: 12,
        ackFrame: 12,
        winnerPlayerId: "Player1",
      },
    ]);
  });

  it("ends the battle if the opponent reconnect does not arrive in time", () => {
    vi.useFakeTimers();

    const sent: ClientMessage[] = [];
    let handler: ((msg: ServerMessage) => void) | null = null;
    const finished: Array<{ winnerPlayerId: PlayerId; serverConfirmedFrame?: number }> = [];
    new CombatSyncManager(
      {
        frame: 0,
        gameOver: false,
        state: {
          result: "running",
          target: { lives: 1 },
        },
        step: () => undefined,
        deserialize: () => undefined,
      } as unknown as RaidLogicRuntime,
      {
        send: (msg: ClientMessage) => {
          sent.push(msg);
        },
        setMessageHandler: (nextHandler: ((msg: ServerMessage) => void) | null) => {
          handler = nextHandler;
        },
      } as unknown as ConnectionManager,
      {
        sceneData: {
          mode: "online",
          localPlayerId: "Player1",
        } satisfies BattleSceneData,
        callbacks: {
          recordFrame: () => undefined,
          getRollbackRecord: () => null,
          pruneRollbackHistoryAfter: () => undefined,
          pruneRollbackHistoryBefore: () => undefined,
          onRollback: () => undefined,
          setStatusText: () => undefined,
          hideStatusText: () => undefined,
          delay: (_ms, callback) => callback(),
          finishBattle: (winnerPlayerId, serverConfirmedFrame) => {
            finished.push({ winnerPlayerId, serverConfirmedFrame });
          },
        },
      },
    );

    if (!handler) {
      throw new Error("CombatSyncManager did not install a message handler");
    }
    const currentHandler: (msg: ServerMessage) => void = handler;
    currentHandler({
      type: "peer_status",
      playerId: "Player2",
      status: "disconnected",
    });

    vi.advanceTimersByTime(999);
    expect(finished).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(finished).toEqual([
      {
        winnerPlayerId: "Player1",
        serverConfirmedFrame: undefined,
      },
    ]);

    expect(sent).toEqual([]);
    vi.useRealTimers();
  });

  it("uses the shared confirmed frame for local battle settlement", () => {
    const sent: ClientMessage[] = [];
    const finished: Array<{ winnerPlayerId: PlayerId; serverConfirmedFrame?: number }> = [];
    let runtimeFrame = 13;
    const runtime = {
      get frame() {
        return runtimeFrame;
      },
      gameOver: true,
      state: {
        result: "versus_player1",
        target: { lives: 0 },
      },
      step: () => {
        runtimeFrame += 1;
      },
      deserialize: () => undefined,
    } as unknown as RaidLogicRuntime;

    const manager = new CombatSyncManager(
      runtime,
      {
        send: (msg: ClientMessage) => {
          sent.push(msg);
        },
        setMessageHandler: () => undefined,
      } as unknown as ConnectionManager,
      {
        sceneData: {
          mode: "local",
          localPlayerId: "Player1",
        } satisfies BattleSceneData,
        p2p: {
          connected: false,
          close: () => undefined,
          send: (msg: ClientMessage) => {
            sent.push(msg);
            return true;
          },
        } as unknown as P2pConnection,
        callbacks: {
          recordFrame: () => undefined,
          getRollbackRecord: () => null,
          pruneRollbackHistoryAfter: () => undefined,
          pruneRollbackHistoryBefore: () => undefined,
          onRollback: () => undefined,
          setStatusText: () => undefined,
          hideStatusText: () => undefined,
          delay: (_ms, callback) => callback(),
          finishBattle: (winnerPlayerId, serverConfirmedFrame) => {
            finished.push({ winnerPlayerId, serverConfirmedFrame });
          },
        },
      },
    );

    for (let frame = 1; frame <= 13; frame += 1) {
      manager.receivePeerMessage({
        type: "input_frame",
        playerId: "Player2",
        frame,
        ackFrame: frame,
        ...testInput(),
      });
    }

    manager.step(testInput());

    expect(sent).toContainEqual({
      type: "game_over",
      frame: 13,
      ackFrame: 13,
      winnerPlayerId: "Player1",
    });

    manager.receivePeerMessage({
      type: "peer_game_over",
      playerId: "Player2",
      frame: 12,
      ackFrame: 12,
      winnerPlayerId: "Player1",
    });

    expect(finished).toEqual([
      {
        winnerPlayerId: "Player1",
        serverConfirmedFrame: 12,
      },
    ]);
  });

  it("uses collaborate results as stable game_over verdict slots", () => {
    const sent: ClientMessage[] = [];
    let runtimeFrame = 8;
    const runtime = {
      get frame() {
        return runtimeFrame;
      },
      gameOver: true,
      state: {
        result: "collaborate_victory",
        target: { lives: 0 },
      },
      step: () => {
        runtimeFrame += 1;
      },
      deserialize: () => undefined,
    } as unknown as RaidLogicRuntime;

    const manager = new CombatSyncManager(
      runtime,
      {
        send: (msg: ClientMessage) => {
          sent.push(msg);
        },
        setMessageHandler: () => undefined,
      } as unknown as ConnectionManager,
      {
        sceneData: {
          mode: "local",
          localPlayerId: "Player1",
          battleMode: "collaborate",
        } satisfies BattleSceneData,
        p2p: {
          connected: false,
          close: () => undefined,
          send: (msg: ClientMessage) => {
            sent.push(msg);
            return true;
          },
        } as unknown as P2pConnection,
        callbacks: {
          recordFrame: () => undefined,
          getRollbackRecord: () => null,
          pruneRollbackHistoryAfter: () => undefined,
          pruneRollbackHistoryBefore: () => undefined,
          onRollback: () => undefined,
          setStatusText: () => undefined,
          hideStatusText: () => undefined,
          delay: (_ms, callback) => callback(),
          finishBattle: () => undefined,
        },
      },
    );

    manager.step(testInput());

    expect(sent).toContainEqual({
      type: "game_over",
      frame: 8,
      ackFrame: 0,
      winnerPlayerId: "Player1",
    });
  });

  it("replays a late forced shop ready message on its scheduled frame", () => {
    let handler: ((msg: ServerMessage) => void) | null = null;
    let runtimeFrame = 3;
    const stepped: Array<{ frame: number; player: BattleInputState; target: BattleInputState }> = [];
    const runtime = {
      get frame() {
        return runtimeFrame;
      },
      gameOver: false,
      state: {
        result: "running",
        target: { lives: 1 },
      },
      step: () => {
        runtimeFrame += 1;
      },
      deserialize: () => {
        runtimeFrame = 1;
      },
      aimConsumedThisFrame: false,
    } as unknown as RaidLogicRuntime;

    new CombatSyncManager(
      runtime,
      {
        send: () => undefined,
        setMessageHandler: (nextHandler: ((msg: ServerMessage) => void) | null) => {
          handler = nextHandler;
        },
      } as unknown as ConnectionManager,
      {
        sceneData: {
          mode: "online",
          localPlayerId: "Player1",
          battleMode: "collaborate",
        } satisfies BattleSceneData,
        callbacks: {
          recordFrame: () => undefined,
          recordStepInputs: (record) => stepped.push(record),
          getRollbackRecord: (frame) => frame === 1
            ? ({ frame, snapshot: {} as BattleModelSnapshot } satisfies CombatRollbackRecord)
            : null,
          pruneRollbackHistoryAfter: () => undefined,
          pruneRollbackHistoryBefore: () => undefined,
          onRollback: () => undefined,
          setStatusText: () => undefined,
          hideStatusText: () => undefined,
          delay: (_ms, callback) => callback(),
          finishBattle: () => undefined,
        },
      },
    );

    if (!handler) {
      throw new Error("CombatSyncManager did not install a message handler");
    }
    const currentHandler: (msg: ServerMessage) => void = handler;
    currentHandler({
      type: "peer_collaborate_shop_forced_ready",
      playerId: "Player2",
      frame: 2,
      shopIndex: 1,
    });

    expect(stepped).toContainEqual(expect.objectContaining({
      frame: 2,
      target: expect.objectContaining({
        shopReadyPressed: true,
        shopPurchaseItemId: undefined,
        activeCardSwitchId: undefined,
      }),
    }));
  });

  it("sends auto collaborate transition ready on the next input frame", () => {
    const sent: ClientMessage[] = [];
    let handler: ((msg: ServerMessage) => void) | null = null;
    let runtimeFrame = 10;
    const runtime = {
      get frame() {
        return runtimeFrame;
      },
      gameOver: false,
      state: {
        result: "running",
        target: { lives: 1 },
        collaborateExtra: {
          state: "transition_sync",
          transitionType: "auto",
          player1TransitionReady: false,
          player2TransitionReady: false,
        },
      },
      step: () => {
        runtimeFrame += 1;
      },
      aimConsumedThisFrame: false,
    } as unknown as RaidLogicRuntime;

    const manager = new CombatSyncManager(
      runtime,
      {
        send: (msg: ClientMessage) => {
          sent.push(msg);
        },
        setMessageHandler: (nextHandler: ((msg: ServerMessage) => void) | null) => {
          handler = nextHandler;
        },
      } as unknown as ConnectionManager,
      {
        sceneData: {
          mode: "online",
          localPlayerId: "Player1",
          battleMode: "collaborate",
        } satisfies BattleSceneData,
        callbacks: {
          recordFrame: () => undefined,
          getRollbackRecord: () => null,
          pruneRollbackHistoryAfter: () => undefined,
          pruneRollbackHistoryBefore: () => undefined,
          onRollback: () => undefined,
          setStatusText: () => undefined,
          hideStatusText: () => undefined,
          delay: (_ms, callback) => callback(),
          finishBattle: () => undefined,
        },
      },
    );

    expect(handler).not.toBeNull();
    manager.step(testInput());
    manager.step(testInput());

    expect(sent).toContainEqual(expect.objectContaining({
      type: "input_frame",
      frame: 12,
      transitionReadyPressed: true,
    }));
  });
});

async function createClient(
  localPlayerId: PlayerId,
  config: BattleConfig,
  endpoint: ClientEndpoint,
): Promise<SimulatedClient> {
  const runtime = createRaidLogicRuntime({
    mode: "online",
    loadouts: loadoutsFromConfig(config),
  });
  await runtime.initialize();

  const snapshotHistory = new Map<number, BattleModelSnapshot>();
  const hashHistory = new Map<number, string>();
  const hashBacklog = new Map<number, string>();
  const sampledFrameHashes = new Map<number, string>();
  const sampledHashMutations: string[] = [];
  const globalHash = new ConfirmedFrameHashAccumulator();

  const sampleConfirmedThrough = (frame: number) => {
    for (let nextFrame = globalHash.lastSampledFrame + 1; nextFrame <= frame; nextFrame += 1) {
      const hash = hashBacklog.get(nextFrame) ?? hashHistory.get(nextFrame);
      if (!hash) {
        throw new Error(`Missing hash for confirmed frame ${nextFrame}`);
      }
      globalHash.addSample({ frame: nextFrame, hashHex: hash });
      sampledFrameHashes.set(nextFrame, hash);
      hashBacklog.delete(nextFrame);
    }
  };

  const recordFrame = () => {
    for (const output of runtime.outputQueue.drainAll()) {
      const sampledHash = sampledFrameHashes.get(output.frame);
      if (sampledHash && sampledHash !== output.hashHex) {
        sampledHashMutations.push(`${output.frame}: sampled=${sampledHash}, replayed=${output.hashHex}`);
      }
      snapshotHistory.set(output.frame, output.snapshot);
      hashHistory.set(output.frame, output.hashHex);
      if (output.frame > globalHash.lastSampledFrame) {
        hashBacklog.set(output.frame, output.hashHex);
      }
    }
  };
  recordFrame();

  const manager = new CombatSyncManager(runtime, endpoint as unknown as ConnectionManager, {
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
        return snapshot ? ({ frame, snapshot } satisfies CombatRollbackRecord) : null;
      },
      pruneRollbackHistoryAfter: (frame) => {
        for (const key of snapshotHistory.keys()) {
          if (key > frame) snapshotHistory.delete(key);
        }
        for (const key of hashHistory.keys()) {
          if (key > frame) hashHistory.delete(key);
        }
        for (const key of hashBacklog.keys()) {
          if (key > frame) hashBacklog.delete(key);
        }
      },
      pruneRollbackHistoryBefore: (frame) => {
        sampleConfirmedThrough(frame);
        for (const key of snapshotHistory.keys()) {
          if (key < frame) snapshotHistory.delete(key);
        }
      },
      onRollback: () => undefined,
      setStatusText: () => undefined,
      hideStatusText: () => undefined,
      delay: (_ms, callback) => callback(),
      finishBattle: (_winner, serverConfirmedFrame) => {
        client.serverConfirmedFrame = serverConfirmedFrame;
      },
    },
  });

  const client: SimulatedClient = {
    manager,
    runtime,
    serverConfirmedFrame: undefined,
    step: (tick) => manager.step(inputFromFrontend(localPlayerId, tick)),
    hashAt: (frame) => hashHistory.get(frame),
    sampledHashAt: (frame) => sampledFrameHashes.get(frame),
    globalHashAt: (frame) => {
      sampleConfirmedThrough(frame);
      return globalHash.digestHex(frame);
    },
    expectNoSampledHashMutations: () => {
      expect(sampledHashMutations).toEqual([]);
    },
  };

  return client;
}

interface SimulatedClient {
  readonly manager: CombatSyncManager;
  readonly runtime: RaidLogicRuntime;
  serverConfirmedFrame: number | undefined;
  step(tick: number): void;
  hashAt(frame: number): string | undefined;
  sampledHashAt(frame: number): string | undefined;
  globalHashAt(frame: number): string;
  expectNoSampledHashMutations(): void;
}

function expectFrameHashesMatch(left: SimulatedClient, right: SimulatedClient, finalFrame: number): void {
  const mismatches: string[] = [];
  for (let frame = 0; frame <= finalFrame; frame += 1) {
    const leftHash = left.hashAt(frame);
    const rightHash = right.hashAt(frame);
    if (leftHash !== rightHash) {
      mismatches.push(`${frame}: ${leftHash ?? "<missing>"} != ${rightHash ?? "<missing>"}`);
    }

    const leftSampledHash = left.sampledHashAt(frame);
    if (leftSampledHash && leftHash !== leftSampledHash) {
      mismatches.push(`${frame}: Player1 sampled ${leftSampledHash}, final ${leftHash ?? "<missing>"}`);
    }

    const rightSampledHash = right.sampledHashAt(frame);
    if (rightSampledHash && rightHash !== rightSampledHash) {
      mismatches.push(`${frame}: Player2 sampled ${rightSampledHash}, final ${rightHash ?? "<missing>"}`);
    }
  }

  expect(mismatches).toEqual([]);
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
      maxPlayersPerRoom: 2,
      maxRooms: 8,
      serverVersion: "test",
    },
  );
  private readonly endpoints: Record<TestPlayerId, ClientEndpoint>;
  private readonly queue: ScheduledMessage[] = [];
  private tick = 0;

  constructor(private readonly latency: Record<TestPlayerId, LatencyProfile>) {
    this.endpoints = {
      "Player1": new ClientEndpoint("Player1", this),
      "Player2": new ClientEndpoint("Player2", this),
    };
    this.handler.registerConnection(this.endpoints["Player1"].serverConnection);
    this.handler.registerConnection(this.endpoints["Player2"].serverConnection);
  }

  endpoint(playerId: TestPlayerId): ClientEndpoint {
    return this.endpoints[playerId];
  }

  setupBattle(): BattleConfig {
    this.send("Player1", { type: "hello", username: "A", clientVersion: "test", debug: true });
    this.send("Player2", { type: "hello", username: "B", clientVersion: "test", debug: true });
    this.deliverAll();

    this.send("Player1", {
      type: "create_room",
      name: "sync",
      mapId: "hakurei_shrine",
      lifeCount: 2,
      costLimit: 12,
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
    if (!config) throw new Error("Battle did not start");

    this.send("Player1", { type: "loading_done" });
    this.send("Player2", { type: "loading_done" });
    this.deliverAll();
    this.endpoint("Player1").clearMessages();
    this.endpoint("Player2").clearMessages();
    return config;
  }

  send(from: TestPlayerId, msg: ClientMessage): void {
    this.queue.push({
      deliverAt: this.tick + this.latency[from].clientToServer,
      run: () => this.handler.handle(this.endpoints[from].serverConnection, msg),
    });
  }

  sendToClient(to: TestPlayerId, msg: ServerMessage): void {
    this.queue.push({
      deliverAt: this.tick + this.latency[to].serverToClient,
      run: () => this.endpoints[to].receive(msg),
    });
  }

  deliverDue(tick: number): void {
    this.tick = tick;
    this.deliver((item) => item.deliverAt <= tick);
  }

  deliverAll(): void {
    while (this.queue.length > 0) {
      const nextTick = Math.min(...this.queue.map((item) => item.deliverAt));
      this.deliverDue(nextTick);
    }
  }

  private deliver(predicate: (item: ScheduledMessage) => boolean): void {
    for (let index = 0; index < this.queue.length;) {
      const item = this.queue[index]!;
      if (!predicate(item)) {
        index += 1;
        continue;
      }
      this.queue.splice(index, 1);
      item.run();
    }
  }
}

class ClientEndpoint {
  private handler: ((msg: ServerMessage) => void) | null = null;
  readonly messages: ServerMessage[] = [];
  readonly serverConnection: TransportConnection;

  constructor(
    readonly playerId: TestPlayerId,
    private readonly network: DedicatedServerHarness,
  ) {
    this.serverConnection = {
      id: `conn-${playerId}`,
      send: (message) => this.network.sendToClient(playerId, message),
      close: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      onError: () => undefined,
    };
  }

  send(msg: ClientMessage): void {
    this.network.send(this.playerId, msg);
  }

  setMessageHandler(handler: ((msg: ServerMessage) => void) | null): void {
    this.handler = handler;
  }

  receive(msg: ServerMessage): void {
    this.messages.push(msg);
    this.handler?.(msg);
  }

  latest<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const msg = this.messages[index]!;
      if (msg.type === type) {
        return msg as Extract<ServerMessage, { type: T }>;
      }
    }
    return undefined;
  }

  clearMessages(): void {
    this.messages.length = 0;
  }
}

interface LatencyProfile {
  readonly clientToServer: number;
  readonly serverToClient: number;
}

interface ScheduledMessage {
  readonly deliverAt: number;
  run(): void;
}

const playerOneLoadout = {
  primaryCharacterId: "reimu",
  alternateCharacterId: "sakuya",
  abilityCardIds: ["spirit_strike_card", "multi_shot"],
  activeAbilityCardId: "spirit_strike_card",
} satisfies PlayerLoadout;

const playerTwoLoadout = {
  primaryCharacterId: "sakuya",
  alternateCharacterId: "reimu",
  abilityCardIds: ["spirit_strike_card", "backdoor"],
  activeAbilityCardId: "spirit_strike_card",
} satisfies PlayerLoadout;

function loadoutsFromConfig(config: BattleConfig) {
  const player = config.players[0].loadout;
  const target = config.players[1].loadout;
  return {
    player: {
      primaryCharacterId: player.primaryCharacterId,
      alternateCharacterId: player.alternateCharacterId,
      cardIds: player.abilityCardIds,
      activeCardId: player.activeAbilityCardId,
    },
    target: {
      primaryCharacterId: target.primaryCharacterId,
      alternateCharacterId: target.alternateCharacterId,
      cardIds: target.abilityCardIds,
      activeCardId: target.activeAbilityCardId,
    },
  };
}

function inputFromFrontend(playerId: PlayerId, tick: number): BattleInputState {
  const sign = playerId === "Player1" ? 1 : -1;
  const pointer = {
    x: playerId === "Player1" ? 900 - (tick % 55) : 360 + (tick % 55),
    y: 300 + ((tick * 9) % 150),
    leftButtonDown: () => tick % 17 === 3 || tick % 29 === 11,
    rightButtonDown: () => tick === 180 || tick === 330,
    positionToCamera: () => ({
      x: pointer.x,
      y: pointer.y,
    }),
  };
  const input = createBattleInput(
    {
      input: { activePointer: pointer },
      cameras: { main: {} },
    } as never,
    createKeys({
      moveRight: sign > 0 && tick % 80 < 24,
      moveLeft: sign < 0 && tick % 80 < 24,
      moveDown: tick % 90 < 30,
      moveUp: tick % 90 >= 30 && tick % 90 < 60,
      reload: tick % 71 === 20,
      alternate: tick % 130 >= 70,
      info: false,
      enter: false,
      activeCard: tick === 260,
    }),
  );
  return input;
}

function testInput(): BattleInputState {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 640,
    aimY: 338,
    shootPressed: false,
    bombPressed: false,
    activeCardPressed: false,
    reloadPressed: false,
    alternateHeld: false,
    infoHeld: false,
  };
}

function createKeys(state: Record<keyof BattleKeyMap, boolean>): BattleKeyMap {
  const key = (isDown: boolean) => ({ isDown, _justDown: isDown });
  return {
    moveUp: key(state.moveUp),
    moveLeft: key(state.moveLeft),
    moveDown: key(state.moveDown),
    moveRight: key(state.moveRight),
    alternate: key(state.alternate),
    reload: key(state.reload),
    info: key(state.info),
    enter: key(state.enter),
    activeCard: key(state.activeCard),
  } as unknown as BattleKeyMap;
}
