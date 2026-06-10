import type { NeutralMobState } from "@repo/types";

import { secondsToTicks } from "../../seconds-to-ticks";
import {
  NeutralMobSpawner,
  type BattleNeutralMob,
  type NeutralMobSpawnerContext,
  type NeutralMobSpawnerState,
} from "../base";
import type {
  CollaborateSpawnerNode,
  MobClass,
  WaveDefinition,
  WaveSpawnerState,
} from "./wave-types";

export abstract class WaveMobSpawner<
  TState extends WaveSpawnerState & NeutralMobSpawnerState = WaveSpawnerState &
    NeutralMobSpawnerState,
> extends NeutralMobSpawner<TState> {
  protected abstract readonly nodes: readonly CollaborateSpawnerNode[];

  private nodeIndex = 0;
  private phase: WaveSpawnerState["phase"] = "running";
  private shopIndex = 0;
  private waveStartFrame = 0;
  private nextWaveAllowedFrame = 0;
  private forceNextWaveFrame = 0;
  private readonly spawnedMemberKeys = new Set<string>();

  step(ctx: NeutralMobSpawnerContext): void {
    const node = this.nodes[this.nodeIndex];
    if (!node) {
      return;
    }

    if (node.kind === "shop") {
      this.stepShopNode(ctx);
      return;
    }

    if (this.isAwaitingTransition(ctx)) {
      this.syncCollaborateWave(ctx, node);
      return;
    }

    this.ensureWaveFrames(ctx, node);
    this.spawnDueMembers(ctx, node);
    this.syncCollaborateWave(ctx, node);

    if (this.hasSpecialMobAlive(ctx)) {
      return;
    }
    if (ctx.frame < this.nextWaveAllowedFrame) {
      return;
    }
    if (this.hasActiveMobs(ctx) && ctx.frame < this.forceNextWaveFrame) {
      return;
    }
    this.advanceToNextNode(ctx);
  }

  snapshot(): TState {
    return {
      spawnerId: this.id,
      nodeIndex: this.nodeIndex,
      phase: this.phase,
      shopIndex: this.shopIndex,
      waveStartFrame: this.waveStartFrame,
      nextWaveAllowedFrame: this.nextWaveAllowedFrame,
      forceNextWaveFrame: this.forceNextWaveFrame,
      spawnedMemberKeys: Array.from(this.spawnedMemberKeys).sort(),
    } as unknown as TState;
  }

  restore(snapshot: TState): void {
    this.nodeIndex = snapshot.nodeIndex;
    this.phase = snapshot.phase;
    this.shopIndex = snapshot.shopIndex;
    this.waveStartFrame = snapshot.waveStartFrame;
    this.nextWaveAllowedFrame = snapshot.nextWaveAllowedFrame;
    this.forceNextWaveFrame = snapshot.forceNextWaveFrame;
    this.spawnedMemberKeys.clear();
    for (const key of snapshot.spawnedMemberKeys) {
      this.spawnedMemberKeys.add(key);
    }
  }

  reset(): void {
    this.nodeIndex = 0;
    this.phase = "running";
    this.shopIndex = 0;
    this.waveStartFrame = 0;
    this.nextWaveAllowedFrame = 0;
    this.forceNextWaveFrame = 0;
    this.spawnedMemberKeys.clear();
  }

  abstract createMobFromSnapshot(
    snapshot: NeutralMobState,
  ): BattleNeutralMob | undefined;

  private stepShopNode(ctx: NeutralMobSpawnerContext): void {
    this.phase = "shop";
    if (this.hasActiveMobs(ctx)) {
      this.syncCollaborateShop(ctx);
      return;
    }

    const ready = ctx.collaborateExtra?.shop.readyByPlayerId;
    if (!ctx.collaborateExtra?.shop.open) {
      ctx.beginCollaborateTransition("shop", "auto");
      this.syncCollaborateShop(ctx);
      return;
    }
    if (ready?.Player1 && ready.Player2) {
      this.advanceToNextNode(ctx);
    }
  }

  private advanceToNextNode(ctx: NeutralMobSpawnerContext): void {
    this.nodeIndex += 1;
    this.phase = "running";
    this.waveStartFrame = ctx.frame + 1;
    this.nextWaveAllowedFrame = this.waveStartFrame;
    this.forceNextWaveFrame = this.waveStartFrame;
    this.spawnedMemberKeys.clear();
    const nextNode = this.nodes[this.nodeIndex];
    const nextSpecialClass =
      nextNode?.kind === "wave" ? firstSpecialClass(nextNode) : undefined;
    if (nextSpecialClass) {
      this.phase = "transition_sync";
      ctx.beginCollaborateTransition(nextSpecialClass, "manual");
    }
    ctx.updateCollaborateExtra((extra) => ({
      ...extra,
      wave: {
        ...extra.wave,
        waveIndex: this.nodeIndex,
        currentWaveId: nextNode?.id ?? null,
        waveStartFrame: this.waveStartFrame,
        nextWaveAllowedFrame: this.nextWaveAllowedFrame,
        forceNextWaveFrame: this.forceNextWaveFrame,
      },
      shop: {
        ...extra.shop,
        open: false,
        readyByPlayerId: { Player1: false, Player2: false, Neutral: false },
      },
    }));
  }

  private ensureWaveFrames(
    ctx: NeutralMobSpawnerContext,
    wave: WaveDefinition,
  ): void {
    if (
      this.waveStartFrame !== 0 ||
      this.nextWaveAllowedFrame !== 0 ||
      this.forceNextWaveFrame !== 0
    ) {
      return;
    }
    this.waveStartFrame = ctx.frame;
    this.nextWaveAllowedFrame =
      ctx.frame + secondsToTicks(wave.minNextWaveSeconds);
    this.forceNextWaveFrame =
      ctx.frame + secondsToTicks(wave.maxNextWaveSeconds);
  }

  private spawnDueMembers(
    ctx: NeutralMobSpawnerContext,
    wave: WaveDefinition,
  ): void {
    for (
      let memberIndex = 0;
      memberIndex < wave.members.length;
      memberIndex += 1
    ) {
      const member = wave.members[memberIndex];
      const memberKey = `${wave.id}:${member.key}`;
      if (this.spawnedMemberKeys.has(memberKey)) {
        continue;
      }
      const spawnAtFrame =
        this.waveStartFrame + secondsToTicks(member.spawnAtSeconds ?? 0);
      if (ctx.frame < spawnAtFrame) {
        continue;
      }
      member.spawn(ctx, {
        waveId: this.nodeIndex + 1,
        waveIndex: this.nodeIndex,
        memberIndex,
        memberKey,
      });
      this.spawnedMemberKeys.add(memberKey);
    }
  }

  private syncCollaborateWave(
    ctx: NeutralMobSpawnerContext,
    wave: WaveDefinition,
  ): void {
    ctx.updateCollaborateExtra((extra) => ({
      ...extra,
      wave: {
        waveIndex: this.nodeIndex,
        currentWaveId: wave.id,
        waveStartFrame: this.waveStartFrame,
        nextWaveAllowedFrame: this.nextWaveAllowedFrame,
        forceNextWaveFrame: this.forceNextWaveFrame,
      },
    }));
  }

  private syncCollaborateShop(ctx: NeutralMobSpawnerContext): void {
    ctx.updateCollaborateExtra((extra) => ({
      ...extra,
      wave: {
        ...extra.wave,
        waveIndex: this.nodeIndex,
        currentWaveId: this.nodes[this.nodeIndex]?.id ?? null,
      },
    }));
  }

  private isAwaitingTransition(ctx: NeutralMobSpawnerContext): boolean {
    return ctx.collaborateExtra?.state === "transition_sync";
  }

  private hasActiveMobs(ctx: NeutralMobSpawnerContext): boolean {
    return ctx.neutralMobs.some((mob) => mob.state.active);
  }

  private hasSpecialMobAlive(ctx: NeutralMobSpawnerContext): boolean {
    return ctx.neutralMobs.some((mob) =>
      isSpecialMobClass(resolveMobClass(mob.state)),
    );
  }
}

function resolveMobClass(state: NeutralMobState): MobClass {
  const maybeClass = (state as NeutralMobState & { class?: MobClass }).class;
  if (maybeClass) {
    return maybeClass;
  }
  return state.kind.includes("boss") || state.kind.includes("elite")
    ? state.kind.includes("boss")
      ? "boss"
      : "elite"
    : "minion";
}

function isSpecialMobClass(mobClass: MobClass): boolean {
  return mobClass === "elite" || mobClass === "boss";
}

function firstSpecialClass(wave: WaveDefinition): "elite" | "boss" | undefined {
  for (const member of wave.members) {
    if (member.class === "boss") {
      return "boss";
    }
    if (member.class === "elite") {
      return "elite";
    }
  }
  return undefined;
}
