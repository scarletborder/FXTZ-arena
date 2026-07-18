import type {
  BattleBulletSpawnParams,
  BattleLaserSpawnParams,
  BulletCmd,
  LaserCmd,
} from "@repo/content";
import type {
  NeutralMobSpawnerStateValue,
  ProjectileCommandSnapshot,
} from "@repo/types";

interface ScheduledCommand<TKind extends "bullet" | "laser", TParams> {
  readonly id: number;
  readonly kind: TKind;
  readonly params: TParams;
  readonly startFrame: number;
  readonly burstCount: number;
  readonly burstInterval: number;
  readonly repeatCount: number;
  readonly repeatInterval: number;
  readonly forwardStep: number;
  readonly sideStep: number;
  readonly angleStep: number;
  burstIndex: number;
  repeatIndex: number;
}

type ScheduledProjectileCommand =
  | ScheduledCommand<"bullet", BattleBulletSpawnParams>
  | ScheduledCommand<"laser", BattleLaserSpawnParams>;

export class ProjectileCommandScheduler {
  private commands: ScheduledProjectileCommand[] = [];
  private nextId = 1;

  scheduleBullet(command: BulletCmd, frame: number): void {
    this.schedule("bullet", command.params, command.schedule, frame);
  }

  scheduleLaser(command: LaserCmd, frame: number): void {
    this.schedule("laser", command.params, command.schedule, frame);
  }

  step(
    frame: number,
    spawnBullet: (params: BattleBulletSpawnParams) => void,
    spawnLaser: (params: BattleLaserSpawnParams) => void,
  ): void {
    const remaining: ScheduledProjectileCommand[] = [];
    for (const command of this.commands) {
      while (this.nextFrame(command) <= frame) {
        if (command.kind === "bullet") {
          spawnBullet({ ...this.paramsAtCursor(command), frame });
        } else {
          spawnLaser({ ...this.paramsAtCursor(command), frame });
        }
        this.advance(command);
        if (command.repeatIndex >= command.repeatCount) break;
      }
      if (command.repeatIndex < command.repeatCount) remaining.push(command);
    }
    this.commands = remaining;
  }

  snapshot(frame: number): readonly ProjectileCommandSnapshot[] {
    return this.commands.map((command) => ({
      id: command.id,
      kind: command.kind,
      params: command.params as unknown as NeutralMobSpawnerStateValue,
      startIn: command.startFrame - frame,
      burstCount: command.burstCount,
      burstInterval: command.burstInterval,
      repeatCount: command.repeatCount,
      repeatInterval: command.repeatInterval,
      forwardStep: command.forwardStep,
      sideStep: command.sideStep,
      angleStep: command.angleStep,
      burstIndex: command.burstIndex,
      repeatIndex: command.repeatIndex,
    }));
  }

  restore(
    snapshots: readonly ProjectileCommandSnapshot[],
    frame: number,
    nextId?: number,
  ): void {
    this.commands = snapshots.map((snapshot) => ({
      id: snapshot.id,
      kind: snapshot.kind,
      params: snapshot.params as unknown as
        | BattleBulletSpawnParams
        | BattleLaserSpawnParams,
      startFrame: frame + snapshot.startIn,
      burstCount: snapshot.burstCount,
      burstInterval: snapshot.burstInterval,
      repeatCount: snapshot.repeatCount,
      repeatInterval: snapshot.repeatInterval,
      forwardStep: snapshot.forwardStep ?? 0,
      sideStep: snapshot.sideStep ?? 0,
      angleStep: snapshot.angleStep ?? 0,
      burstIndex: snapshot.burstIndex,
      repeatIndex: snapshot.repeatIndex,
    })) as ScheduledProjectileCommand[];
    this.nextId = Math.max(
      nextId ?? 1,
      ...this.commands.map((command) => command.id + 1),
    );
  }

  reset(): void {
    this.commands = [];
    this.nextId = 1;
  }

  getNextId(): number {
    return this.nextId;
  }

  private schedule(
    kind: "bullet",
    params: BattleBulletSpawnParams,
    schedule: BulletCmd["schedule"],
    frame: number,
  ): void;
  private schedule(
    kind: "laser",
    params: BattleLaserSpawnParams,
    schedule: BulletCmd["schedule"],
    frame: number,
  ): void;
  private schedule(
    kind: "bullet" | "laser",
    params: BattleBulletSpawnParams | BattleLaserSpawnParams,
    schedule: BulletCmd["schedule"],
    frame: number,
  ): void {
    this.commands.push({
      id: this.nextId++,
      kind,
      params,
      startFrame: frame + schedule.delay,
      burstCount: schedule.burstCount,
      burstInterval: schedule.burstInterval,
      repeatCount: schedule.repeatCount,
      repeatInterval: schedule.repeatInterval,
      forwardStep: schedule.forwardStep,
      sideStep: schedule.sideStep,
      angleStep: schedule.angleStep,
      burstIndex: 0,
      repeatIndex: 0,
    } as ScheduledProjectileCommand);
  }

  private nextFrame(command: ScheduledProjectileCommand): number {
    return (
      command.startFrame +
      command.repeatIndex * command.repeatInterval +
      command.burstIndex * command.burstInterval
    );
  }

  private advance(command: ScheduledProjectileCommand): void {
    command.burstIndex += 1;
    if (command.burstIndex >= command.burstCount) {
      command.burstIndex = 0;
      command.repeatIndex += 1;
    }
  }

  private paramsAtCursor<T extends ScheduledProjectileCommand>(
    command: T,
  ): T["params"] {
    const step = command.burstIndex;
    const angle = command.params.angle + command.angleStep * step;
    const distance = command.forwardStep * step;
    const side = command.sideStep * step;
    return {
      ...command.params,
      x: command.params.x + Math.cos(angle) * distance - Math.sin(angle) * side,
      y: command.params.y + Math.sin(angle) * distance + Math.cos(angle) * side,
      angle,
    } as T["params"];
  }
}
