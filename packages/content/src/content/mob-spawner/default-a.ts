import { secondsToTicks } from "../seconds-to-ticks";
import { ExampleFairy, type ExampleFairyMovementVariant } from "./mobs/example-fairy";
import { NeutralMobSpawner, type BattleNeutralMob, type NeutralMobSpawnerContext, type NeutralMobSpawnerState } from "./base";
import type { NeutralMobState } from "@repo/types";

export interface DefaultMobSpawnerAState extends NeutralMobSpawnerState {
  readonly spawnerId: "default-a";
}

const WAVE_START_FRAME = secondsToTicks(5);
const WAVE_INTERVAL = secondsToTicks(15);
const MOB_COUNT = 8;
const MOB_INTERVAL_TICKS = secondsToTicks(0.2);
const VOLLEY_OFFSETS: readonly number[] = [
  secondsToTicks(2),
  secondsToTicks(5),
  secondsToTicks(7),
];

export class DefaultMobSpawnerA extends NeutralMobSpawner<DefaultMobSpawnerAState> {
  readonly id = "default-a";

  step(ctx: NeutralMobSpawnerContext): void {
    this.spawnWaveMembers(ctx);
    this.queueWaveVolleys(ctx);
  }

  snapshot(): DefaultMobSpawnerAState {
    return { spawnerId: this.id };
  }

  restore(_snapshot: DefaultMobSpawnerAState): void {
    // Default A is frame-derived and has no hidden counters.
  }

  reset(): void {
    // Default A is frame-derived and has no hidden counters.
  }

  createMobFromSnapshot(snapshot: NeutralMobState): BattleNeutralMob | undefined {
    if (snapshot.kind !== "example_fairy") {
      return undefined;
    }
    return ExampleFairy.fromSnapshot(snapshot);
  }

  private spawnWaveMembers(ctx: NeutralMobSpawnerContext): void {
    const waveIndex = this.waveIndexForFrame(ctx.frame);
    if (waveIndex === undefined) {
      return;
    }
    const waveStart = WAVE_START_FRAME + waveIndex * WAVE_INTERVAL;
    const withinWave = ctx.frame - waveStart;
    if (withinWave < 0 || withinWave % MOB_INTERVAL_TICKS !== 0) {
      return;
    }
    const mobIndex = withinWave / MOB_INTERVAL_TICKS;
    if (!Number.isInteger(mobIndex) || mobIndex < 0 || mobIndex >= MOB_COUNT) {
      return;
    }
    const variant: ExampleFairyMovementVariant = waveIndex % 2 === 0 ? "left" : "right";
    ctx.spawnMob(new ExampleFairy({
      id: ctx.allocateMobId(),
      waveId: waveIndex + 1,
      movementVariant: variant,
      pointValue: mobIndex === MOB_COUNT - 1 ? 5 : 1,
    }));
  }

  private queueWaveVolleys(ctx: NeutralMobSpawnerContext): void {
    const currentWaveIndex = this.waveIndexForFrame(ctx.frame);
    if (currentWaveIndex === undefined) {
      return;
    }
    // Check all waves up to the current one (earlier waves may still have surviving mobs)
    for (let waveIndex = 0; waveIndex <= currentWaveIndex; waveIndex += 1) {
      const waveStart = WAVE_START_FRAME + waveIndex * WAVE_INTERVAL;
      const elapsed = ctx.frame - waveStart;
      if (!VOLLEY_OFFSETS.includes(elapsed)) {
        continue;
      }
      const waveId = waveIndex + 1;
      for (const mob of ctx.neutralMobs) {
        if (mob.state.kind !== "example_fairy" || mob.state.waveId !== waveId || !mob.state.active) {
          continue;
        }
        (mob as ExampleFairy).queueVolleyAt(mob.state.ageTicks + secondsToTicks(0.5));
      }
    }
  }

  private waveIndexForFrame(frame: number): number | undefined {
    if (frame < WAVE_START_FRAME) {
      return undefined;
    }
    return Math.floor((frame - WAVE_START_FRAME) / WAVE_INTERVAL);
  }
}
