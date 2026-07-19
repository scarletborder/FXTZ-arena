/**
 * Coordinate symmetry transforms for stage documents.
 *
 * These utilities power the maker-cli "copy with symmetry" feature
 * (`append --from --symmetry mirror|axis`): cloning a node or enemy definition
 * and reflecting every coordinate so the copy occupies the mirrored half of the
 * cooperate arena.
 *
 * - `mirror` reflects across the vertical center axis: `x' = width - x`.
 * - `axis`   reflects across the horizontal center axis: `y' = height - y`.
 *
 * Reflections reverse rotary motion, so `circle` paths flip their `clockwise`
 * flag and rotate `startAngleDegrees` accordingly; `drift`/`follow` negate the
 * relevant velocity/offset component. Fire patterns are angle-based and left
 * untouched (they remain relative to the now-reflected mob position).
 */

import type {
  Vec2,
  PathSpec,
  MovementSpec,
  MovementPhase,
  EnemyDefinition,
  StageNode,
  WaveNode,
  SpellCardConfig,
  SpellPhase,
  SymmetryKind,
} from "./types";

export type { SymmetryKind };

export interface SymmetryOptions {
  kind: SymmetryKind;
  width: number;
  height: number;
}

export function transformVec2(v: Vec2, opts: SymmetryOptions): Vec2 {
  if (opts.kind === "mirror") return { x: opts.width - v.x, y: v.y };
  return { x: v.x, y: opts.height - v.y };
}

export function transformPathSpec(path: PathSpec, opts: SymmetryOptions): PathSpec {
  switch (path.kind) {
    case "point": {
      const p = transformVec2({ x: path.x, y: path.y }, opts);
      return { kind: "point", x: p.x, y: p.y };
    }
    case "line":
      return {
        ...path,
        from: transformVec2(path.from, opts),
        to: transformVec2(path.to, opts),
      };
    case "bezier":
      return {
        ...path,
        from: transformVec2(path.from, opts),
        control: transformVec2(path.control, opts),
        to: transformVec2(path.to, opts),
      };
    case "circle": {
      const center = transformVec2(path.center, opts);
      // Reflection reverses the rotation direction and maps the start angle
      // onto the reflected position on the circle.
      const startAngleDegrees =
        opts.kind === "mirror"
          ? 180 - path.startAngleDegrees
          : -path.startAngleDegrees;
      const clockwise =
        path.clockwise === undefined ? undefined : !path.clockwise;
      return {
        ...path,
        center,
        startAngleDegrees,
        clockwise,
      };
    }
    case "follow": {
      const offsetX =
        opts.kind === "mirror"
          ? path.offsetX !== undefined
            ? -path.offsetX
            : undefined
          : path.offsetX;
      const offsetY =
        opts.kind === "axis"
          ? path.offsetY !== undefined
            ? -path.offsetY
            : undefined
          : path.offsetY;
      return { ...path, offsetX, offsetY };
    }
    case "drift": {
      const vx = opts.kind === "mirror" ? -path.vx : path.vx;
      const vy = opts.kind === "axis" ? -path.vy : path.vy;
      return { ...path, vx, vy };
    }
  }
}

export function transformMovementPhase(
  phase: MovementPhase,
  opts: SymmetryOptions,
): MovementPhase {
  return { ...phase, path: transformPathSpec(phase.path, opts) };
}

export function transformMovementSpec(
  m: MovementSpec,
  opts: SymmetryOptions,
): MovementSpec {
  if ("type" in m) {
    if (m.type === "static") {
      const p = transformVec2({ x: m.x, y: m.y }, opts);
      return { type: "static", x: p.x, y: p.y };
    }
    if (m.type === "phases") {
      return {
        type: "phases",
        phases: m.phases.map((p) => transformMovementPhase(p, opts)),
      };
    }
    return m;
  }
  // Bare MovementPhase (no discriminant).
  return transformMovementPhase(m, opts);
}

function transformSpellPhase(
  phase: SpellPhase,
  opts: SymmetryOptions,
): SpellPhase {
  if (!phase.movement) return phase;
  return { ...phase, movement: transformMovementSpec(phase.movement, opts) };
}

function transformSpellCard(
  sc: SpellCardConfig,
  opts: SymmetryOptions,
): SpellCardConfig {
  return { phases: sc.phases.map((p) => transformSpellPhase(p, opts)) };
}

/** Returns a copy of `def` with spawn + movement coordinates reflected. */
export function transformEnemyDef(
  def: EnemyDefinition,
  opts: SymmetryOptions,
): EnemyDefinition {
  const out: EnemyDefinition = { ...def };
  if (def.spawn) out.spawn = transformVec2(def.spawn, opts);
  if (def.movement) out.movement = transformMovementSpec(def.movement, opts);
  if (def.spellCard) out.spellCard = transformSpellCard(def.spellCard, opts);
  return out;
}

/**
 * Returns a copy of `node` with member spawn positions (wave) or shop position
 * reflected. Enemy definitions are referenced by id and are NOT cloned here —
 * use {@link transformEnemyDef} for that.
 */
export function transformStageNode(
  node: StageNode,
  opts: SymmetryOptions,
): StageNode {
  if (node.kind === "shop") {
    const p = transformVec2({ x: node.x, y: node.y }, opts);
    return { ...node, x: p.x, y: p.y };
  }
  const wave = node as WaveNode;
  const members = wave.members.map((m) =>
    m.spawn ? { ...m, spawn: transformVec2(m.spawn, opts) } : m,
  );
  return { ...wave, members };
}
