import Phaser from "phaser";

import type { FighterKey, FighterState } from "@repo/raid-logic";
import { Depth } from "../../../utils/depth";
import {
  CirnoWingmanProfile,
  EllenWingmanProfile,
  IkuWingmanProfile,
  KaguyaWingmanProfile,
  MarisaWingmanProfile,
  ReimuWingmanProfile,
  ReisenWingmanProfile,
  SakuyaWingmanProfile,
  YoumuWingmanProfile,
  YuyukoWingmanProfile,
  YukariWingmanProfile,
} from "./character";
import {
  CharacterWingmanProfile,
  pointPowerTier,
  type OrbitSource,
  type RelativeSource,
  type WingmanEmitterConfig,
} from "./types";
import { abilityCardWingmen } from "./card";

interface WingmanVisual {
  readonly root: Phaser.GameObjects.Container;
  readonly graphics: Phaser.GameObjects.Graphics;
  initialized: boolean;
  activeCharacterId: string;
}

type WingmanSlot = "player" | "target";

interface WingmanRenderParams {
  readonly player: FighterState;
  readonly target: FighterState;
  readonly frame: number;
  readonly gameOver: boolean;
  readonly localFighterKey: FighterKey;
  readonly alpha: number;
  readonly rollbackBlend?: number;
}

const ROLLBACK_MAX_STEP = 24;
const ROLLBACK_SNAP_THRESHOLD = 4;

export class WingmanView {
  private readonly visuals: Record<WingmanSlot, WingmanVisual>;

  constructor(private readonly scene: Phaser.Scene) {
    this.visuals = {
      player: this.createVisual(),
      target: this.createVisual(),
    };
  }

  render(params: WingmanRenderParams): void {
    this.renderFighter("player", params.player, params);
    this.renderFighter("target", params.target, params);
  }

  private createVisual(): WingmanVisual {
    const root = this.scene.add.container(0, 0).setDepth(Depth.Character + 0.2);
    const graphics = this.scene.add.graphics();
    graphics.setBlendMode(Phaser.BlendModes.ADD);
    root.add(graphics);
    return { root, graphics, initialized: false, activeCharacterId: "" };
  }

  private renderFighter(
    slot: WingmanSlot,
    fighter: FighterState,
    params: WingmanRenderParams,
  ): void {
    const visual = this.visuals[slot];
    const isPlayer =
      (slot === "player" && params.localFighterKey === "Player1") ||
      (slot === "target" && params.localFighterKey === "Player2");
    const visible = params.gameOver
      ? fighter.deadUntil === 0
      : fighter.deadUntil === 0 || isPlayer;
    // When the active character changes, snap wingmen to the fighter's
    // current position instead of smoothly sliding from the old spot.
    if (visual.activeCharacterId !== fighter.activeCharacter.id) {
      visual.initialized = false;
      visual.activeCharacterId = fighter.activeCharacter.id;
    }

    const profile = wingmanProfile(fighter.activeCharacter.id);
    const tier = pointPowerTier(fighter.pointCount);
    const emitters = [
      ...(profile?.wingmenForTier(tier) ?? []),
      ...abilityCardWingmen(fighter, tier),
    ];

    if (!visible || emitters.length === 0) {
      visual.root.setVisible(false);
      visual.graphics.clear();
      return;
    }

    const x = lerp(fighter.previousX, fighter.x, params.alpha);
    const y = lerp(fighter.previousY, fighter.y, params.alpha);
    const position = visual.initialized
      ? smoothPointWithMaxStep(
          visual.root.x,
          visual.root.y,
          x,
          y,
          ROLLBACK_MAX_STEP,
          ROLLBACK_SNAP_THRESHOLD,
        )
      : { x, y };
    visual.initialized = true;

    const blend = params.rollbackBlend ?? 1;
    visual.root.setPosition(position.x, position.y);
    visual.root.setAlpha(smoothValue(visual.root.alpha, 0.92, blend));
    visual.root.setVisible(true);

    renderWingmanGraphics(
      visual.graphics,
      emitters,
      params.frame,
      lerpAngle(fighter.previousFacing, fighter.facing, params.alpha),
    );
  }
}

function renderWingmanGraphics(
  graphics: Phaser.GameObjects.Graphics,
  emitters: readonly WingmanEmitterConfig[],
  frame: number,
  facing: number,
): void {
  graphics.clear();

  for (const emitter of emitters) {
    const position = sourcePosition(emitter.source, facing, frame);
    const shotAngle =
      facing + (emitter.shotAngleOffset ?? sourceAngle(emitter.source, frame));
    const pulse = 0.5 + Math.sin(frame * 0.18 + (emitter.phase ?? 0)) * 0.5;
    drawEmitter(graphics, emitter, position.x, position.y, shotAngle, pulse);
  }
}

function drawEmitter(
  graphics: Phaser.GameObjects.Graphics,
  emitter: WingmanEmitterConfig,
  x: number,
  y: number,
  shotAngle: number,
  pulse: number,
): void {
  const scale = emitter.scale ?? 1;

  if (emitter.kind === "laser") {
    drawLaserEmitter(graphics, x, y, shotAngle, emitter, pulse, scale);
  } else if (emitter.kind === "knife") {
    drawKnifeEmitter(graphics, x, y, shotAngle, emitter, pulse, scale);
  } else if (emitter.kind === "diamond") {
    drawDiamondEmitter(graphics, x, y, shotAngle, emitter, pulse, scale);
  } else if (emitter.kind === "slash") {
    drawSlashEmitter(graphics, x, y, shotAngle, emitter, pulse, scale);
  } else {
    drawOrbEmitter(graphics, x, y, shotAngle, emitter, pulse, scale);
  }
}

function drawOrbEmitter(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  shotAngle: number,
  emitter: WingmanEmitterConfig,
  pulse: number,
  scale: number,
): void {
  const radius = (5 + pulse * 1.5) * scale;
  graphics.fillStyle(emitter.color, 0.8);
  graphics.fillCircle(x, y, radius);
  graphics.fillStyle(emitter.accent, 0.9);
  graphics.fillCircle(x - 1.8 * scale, y - 1.8 * scale, 1.8 * scale);
  drawMuzzleLine(graphics, x, y, shotAngle, emitter.color, 14 * scale, 0.46);
}

function drawLaserEmitter(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  shotAngle: number,
  emitter: WingmanEmitterConfig,
  _pulse: number,
  scale: number,
): void {
  const nx = -Math.sin(shotAngle);
  const ny = Math.cos(shotAngle);
  graphics.lineStyle(5 * scale, 0x101522, 0.78);
  graphics.beginPath();
  graphics.moveTo(x - nx * 4 * scale, y - ny * 4 * scale);
  graphics.lineTo(x + nx * 4 * scale, y + ny * 4 * scale);
  graphics.strokePath();
  drawMuzzleLine(graphics, x, y, shotAngle, emitter.accent, 22 * scale, 0.5);
}

function drawKnifeEmitter(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  shotAngle: number,
  emitter: WingmanEmitterConfig,
  pulse: number,
  scale: number,
): void {
  const cos = Math.cos(shotAngle);
  const sin = Math.sin(shotAngle);
  const nx = -sin;
  const ny = cos;
  const length = (17 + pulse * 3) * scale;
  graphics.lineStyle(3 * scale, emitter.color, 0.82);
  graphics.beginPath();
  graphics.moveTo(x - cos * length * 0.35, y - sin * length * 0.35);
  graphics.lineTo(x + cos * length * 0.65, y + sin * length * 0.65);
  graphics.strokePath();
  graphics.lineStyle(1, emitter.accent, 0.95);
  graphics.beginPath();
  graphics.moveTo(x - nx * 5 * scale, y - ny * 5 * scale);
  graphics.lineTo(x + nx * 5 * scale, y + ny * 5 * scale);
  graphics.strokePath();
}

function drawDiamondEmitter(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  shotAngle: number,
  emitter: WingmanEmitterConfig,
  pulse: number,
  scale: number,
): void {
  const r = (6 + pulse) * scale;
  graphics.fillStyle(emitter.color, 0.72);
  graphics.beginPath();
  graphics.moveTo(x, y - r);
  graphics.lineTo(x + r, y);
  graphics.lineTo(x, y + r);
  graphics.lineTo(x - r, y);
  graphics.closePath();
  graphics.fillPath();
  drawMuzzleLine(graphics, x, y, shotAngle, emitter.color, 12 * scale, 0.42);
}

function drawSlashEmitter(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  shotAngle: number,
  emitter: WingmanEmitterConfig,
  pulse: number,
  scale: number,
): void {
  graphics.lineStyle(2 * scale, emitter.color, 0.65);
  graphics.beginPath();
  graphics.arc(x, y, (9 + pulse * 2) * scale, shotAngle - 0.9, shotAngle + 0.9);
  graphics.strokePath();
  graphics.fillStyle(emitter.accent, 0.72);
  graphics.fillCircle(x, y, 2.2 * scale);
}

function drawMuzzleLine(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  shotAngle: number,
  color: number,
  length: number,
  alpha: number,
): void {
  graphics.lineStyle(2, color, alpha);
  graphics.beginPath();
  graphics.moveTo(x, y);
  graphics.lineTo(
    x + Math.cos(shotAngle) * length,
    y + Math.sin(shotAngle) * length,
  );
  graphics.strokePath();
}

const PROFILES: ReadonlyMap<
  FighterState["activeCharacter"]["id"],
  CharacterWingmanProfile
> = new Map([
  ["reimu", new ReimuWingmanProfile()],
  ["marisa", new MarisaWingmanProfile()],
  ["sakuya", new SakuyaWingmanProfile()],
  ["cirno", new CirnoWingmanProfile()],
  ["youmu", new YoumuWingmanProfile()],
  ["kaguya", new KaguyaWingmanProfile()],
  ["reisen", new ReisenWingmanProfile()],
  ["ellen", new EllenWingmanProfile()],
  ["iku", new IkuWingmanProfile()],
  ["yuyuko", new YuyukoWingmanProfile()],
  ["yukari", new YukariWingmanProfile()],
]);

function wingmanProfile(
  characterId: FighterState["activeCharacter"]["id"],
): CharacterWingmanProfile | undefined {
  return PROFILES.get(characterId);
}

function sourcePosition(
  source: RelativeSource | OrbitSource,
  facing: number,
  frame: number,
): { readonly x: number; readonly y: number } {
  if ("radius" in source) {
    const angle = facing + sourceAngle(source, frame);
    return {
      x: Math.cos(angle) * source.radius,
      y: Math.sin(angle) * source.radius,
    };
  }
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  return {
    x: cos * source.forward - sin * source.side,
    y: sin * source.forward + cos * source.side,
  };
}

function sourceAngle(
  source: RelativeSource | OrbitSource,
  frame: number,
): number {
  if ("radius" in source) {
    return source.angleOffset + (source.angularSpeed ?? 0) * frame;
  }
  return Math.atan2(source.side, source.forward);
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}

function smoothValue(current: number, target: number, blend: number): number {
  if (blend >= 1) return target;
  return current + (target - current) * Math.max(0, blend);
}

function smoothPointWithMaxStep(
  currentX: number,
  currentY: number,
  targetX: number,
  targetY: number,
  maxStep: number,
  snapThreshold: number,
): { readonly x: number; readonly y: number } {
  const dx = targetX - currentX;
  const dy = targetY - currentY;
  const distance = Math.hypot(dx, dy);
  if (distance <= snapThreshold || distance <= maxStep) {
    return { x: targetX, y: targetY };
  }
  const ratio = maxStep / distance;
  return { x: currentX + dx * ratio, y: currentY + dy * ratio };
}
