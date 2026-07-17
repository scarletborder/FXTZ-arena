import { describe, expect, it, vi } from "vitest";
import { BulletCmd, LaserCmd } from "@repo/content";
import { ProjectileCommandScheduler } from "./projectile-command-scheduler";

describe("ProjectileCommandScheduler", () => {
  it("keeps burst/repeat schedules compact and emits only on due frames", () => {
    const scheduler = new ProjectileCommandScheduler();
    const spawnBullet = vi.fn();
    const spawnLaser = vi.fn();
    scheduler.scheduleBullet(
      new BulletCmd(bulletParams()).burst(2, 3).repeat(3, 10),
      100,
    );

    expect(scheduler.snapshot(100)).toHaveLength(1);
    for (let frame = 100; frame <= 123; frame += 1) {
      scheduler.step(frame, spawnBullet, spawnLaser);
    }

    expect(spawnBullet.mock.calls.map(([params]) => params.frame)).toEqual([
      100, 103, 110, 113, 120, 123,
    ]);
    expect(spawnLaser).not.toHaveBeenCalled();
    expect(scheduler.snapshot(123)).toHaveLength(0);
  });

  it("restores BulletCmd and LaserCmd cursors without expanding commands", () => {
    const original = new ProjectileCommandScheduler();
    original.scheduleBullet(
      new BulletCmd(bulletParams()).after(2).repeat(3, 5),
      10,
    );
    original.scheduleLaser(
      new LaserCmd(laserParams()).burst(2, 4),
      10,
    );

    const firstBullets = vi.fn();
    const firstLasers = vi.fn();
    for (let frame = 10; frame <= 14; frame += 1) {
      original.step(frame, firstBullets, firstLasers);
    }
    const snapshot = original.snapshot(14);
    expect(snapshot).toHaveLength(1);

    const restored = new ProjectileCommandScheduler();
    restored.restore(snapshot, 14, original.getNextId());
    const bullets = vi.fn();
    const lasers = vi.fn();
    for (let frame = 15; frame <= 22; frame += 1) {
      restored.step(frame, bullets, lasers);
    }

    expect(firstBullets.mock.calls.map(([params]) => params.frame)).toEqual([12]);
    expect(firstLasers.mock.calls.map(([params]) => params.frame)).toEqual([
      10, 14,
    ]);
    expect(bullets.mock.calls.map(([params]) => params.frame)).toEqual([17, 22]);
    expect(lasers).not.toHaveBeenCalled();
  });
});

function bulletParams() {
  return {
    owner: "Player1" as const,
    kind: "orb" as const,
    x: 1,
    y: 2,
    angle: 0,
    speedRank: "medium" as const,
    width: 6,
    height: 6,
    homingTicks: 0,
  };
}

function laserParams() {
  return {
    owner: "Player1" as const,
    x: 1,
    y: 2,
    angle: 0,
  };
}
