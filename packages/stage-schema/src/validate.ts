import type {
  StageDocument,
  StageNode,
  WaveMemberSpec,
  EnemyDefinition,
  FireSpec,
  BulletPattern,
  FirePattern,
  SpellCardConfig,
  SpellPhase,
} from "./types";
import { COLLABORATE_STAGE_ARENA } from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

const BULLET_KINDS = ["orb", "knife", "diamond", "spark"];
const SPEED_RANKS = ["low", "medium", "high"];
const MOB_CLASSES = ["minion", "elite", "boss"];
const SPELL_PHASE_KINDS = ["nonspell", "spell"];
const SYMMETRY_KINDS = ["mirror", "axis"];

export function validateStageDocument(doc: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof doc !== "object" || doc === null) {
    return [{ path: "$", message: "关卡必须是一个对象", severity: "error" }];
  }
  const stage = doc as Partial<StageDocument>;

  if (stage.schemaVersion !== 1) {
    issues.push({ path: "schemaVersion", message: "schemaVersion 必须为 1", severity: "error" });
  }
  if (!stage.id || typeof stage.id !== "string") {
    issues.push({ path: "id", message: "缺少关卡 id", severity: "error" });
  }
  if (!stage.name || typeof stage.name !== "string") {
    issues.push({ path: "name", message: "缺少关卡名称", severity: "error" });
  }
  if (!stage.arena || typeof stage.arena.width !== "number" || typeof stage.arena.height !== "number") {
    issues.push({ path: "arena", message: "arena 需要 width/height", severity: "error" });
  } else if (
    Array.isArray(stage.compatibleModes) &&
    stage.compatibleModes.includes("collaborate")
  ) {
    // Collaborate stages must use the fixed collaborate-arena size.
    const a = stage.arena;
    if (
      a.width !== COLLABORATE_STAGE_ARENA.width ||
      a.height !== COLLABORATE_STAGE_ARENA.height
    ) {
      issues.push({
        path: "arena",
        message: `合作模式地图大小必须固定为 ${COLLABORATE_STAGE_ARENA.width}×${COLLABORATE_STAGE_ARENA.height}（与"合作测试竞技场"一致），当前为 ${a.width}×${a.height}`,
        severity: "error",
      });
    }
    if (
      a.viewportWidth !== undefined &&
      a.viewportWidth !== COLLABORATE_STAGE_ARENA.viewportWidth
    ) {
      issues.push({
        path: "arena.viewportWidth",
        message: `合作模式视窗宽度应为 ${COLLABORATE_STAGE_ARENA.viewportWidth}`,
        severity: "warning",
      });
    }
  }
  if (!Array.isArray(stage.compatibleModes) || stage.compatibleModes.length === 0) {
    issues.push({ path: "compatibleModes", message: "至少需要一个兼容模式", severity: "error" });
  }
  if (typeof stage.enemyDefs !== "object" || stage.enemyDefs === null) {
    issues.push({ path: "enemyDefs", message: "enemyDefs 必须是对象", severity: "error" });
  } else {
    for (const [defId, def] of Object.entries(stage.enemyDefs)) {
      validateEnemy(defId, def as EnemyDefinition, issues);
    }
  }
  if (!Array.isArray(stage.nodes) || stage.nodes.length === 0) {
    issues.push({ path: "nodes", message: "至少需要一个节点", severity: "warning" });
  } else {
    const ids = new Set<string>();
    stage.nodes.forEach((node, i) => validateNode(`nodes[${i}]`, node as StageNode, stage.enemyDefs ?? {}, ids, issues));
  }
  return issues;
}

function validateEnemy(defId: string, def: EnemyDefinition, issues: ValidationIssue[]): void {
  const p = `enemyDefs.${defId}`;
  if (def.id !== defId) {
    issues.push({ path: p, message: "enemyDefs 的键必须与 def.id 一致", severity: "warning" });
  }
  if (!MOB_CLASSES.includes(def.class)) {
    issues.push({ path: `${p}.class`, message: `class 必须是 ${MOB_CLASSES.join("/")}`, severity: "error" });
  }
  if (typeof def.maxHealth !== "number" || def.maxHealth <= 0) {
    issues.push({ path: `${p}.maxHealth`, message: "maxHealth 必须为正数", severity: "error" });
  }
  if (typeof def.hitRadius !== "number" || def.hitRadius <= 0) {
    issues.push({ path: `${p}.hitRadius`, message: "hitRadius 必须为正数", severity: "error" });
  }
  (def.fire ?? []).forEach((f, i) => validateFire(`${p}.fire[${i}]`, f as FireSpec, issues));

  if (def.spellCard) {
    validateSpellCard(`${p}.spellCard`, def.spellCard, issues);
    // Elite/boss with a spell-card arrangement should keep all movement and
    // fire inside the spell-card phases (nonspell/spell), not at the top level.
    if (def.class === "elite" || def.class === "boss") {
      if (def.movement) {
        issues.push({
          path: `${p}.movement`,
          message: `${def.class} 已启用符卡编排，应将移动放入各符卡阶段（非符/符卡）中，顶层 movement 不会生效`,
          severity: "warning",
        });
      }
      if (def.fire && def.fire.length > 0) {
        issues.push({
          path: `${p}.fire`,
          message: `${def.class} 已启用符卡编排，应将开火放入各符卡阶段（非符/符卡）中，顶层 fire 不会生效`,
          severity: "warning",
        });
      }
    }
  }
}

function validateSpellCard(p: string, sc: SpellCardConfig, issues: ValidationIssue[]): void {
  if (!Array.isArray(sc.phases) || sc.phases.length === 0) {
    issues.push({ path: `${p}.phases`, message: "spellCard 至少需要一个阶段", severity: "error" });
    return;
  }
  sc.phases.forEach((phase, i) => validateSpellPhase(`${p}.phases[${i}]`, phase as SpellPhase, issues));
}

function validateSpellPhase(p: string, phase: SpellPhase, issues: ValidationIssue[]): void {
  if (!SPELL_PHASE_KINDS.includes(phase.kind)) {
    issues.push({
      path: `${p}.kind`,
      message: `kind 必须是 ${SPELL_PHASE_KINDS.join("/")}（非符/符卡）`,
      severity: "error",
    });
  }
  if (typeof phase.maxHealth !== "number" || phase.maxHealth <= 0) {
    issues.push({ path: `${p}.maxHealth`, message: "maxHealth 必须为正数", severity: "error" });
  }
  if (typeof phase.durationSeconds !== "number" || phase.durationSeconds <= 0) {
    issues.push({ path: `${p}.durationSeconds`, message: "durationSeconds 必须为正数", severity: "error" });
  }
  (phase.fire ?? []).forEach((f, i) => validateFire(`${p}.fire[${i}]`, f as FireSpec, issues));
}

function validateFire(p: string, f: FireSpec, issues: ValidationIssue[]): void {
  if (typeof f.startSeconds !== "number" || f.startSeconds < 0) {
    issues.push({ path: `${p}.startSeconds`, message: "startSeconds 必须 >= 0", severity: "error" });
  }
  if (typeof f.intervalSeconds !== "number" || f.intervalSeconds <= 0) {
    issues.push({ path: `${p}.intervalSeconds`, message: "intervalSeconds 必须 > 0", severity: "error" });
  }
  validateBulletPattern(`${p}.pattern`, f.pattern, issues);
}

function validateBulletPattern(p: string, pattern: FirePattern, issues: ValidationIssue[]): void {
  const kind = (pattern as { type?: string }).type;
  if (kind === "laser") return;
  const bp = pattern as BulletPattern & { bullet?: unknown };
  if (!bp.bullet || typeof bp.bullet !== "object") {
    issues.push({ path: `${p}.bullet`, message: "缺少 bullet 参数", severity: "error" });
    return;
  }
  const bullet = bp.bullet as unknown as Record<string, unknown>;
  if (!BULLET_KINDS.includes(bullet.kind as string)) {
    issues.push({ path: `${p}.bullet.kind`, message: `kind 必须是 ${BULLET_KINDS.join("/")}`, severity: "error" });
  }
  if (!SPEED_RANKS.includes(bullet.speedRank as string)) {
    issues.push({ path: `${p}.bullet.speedRank`, message: `speedRank 必须是 ${SPEED_RANKS.join("/")}`, severity: "error" });
  }
  if (typeof bullet.width !== "number" || typeof bullet.height !== "number") {
    issues.push({ path: `${p}.bullet.width/height`, message: "width/height 必须为数字", severity: "error" });
  }
}

function validateNode(
  p: string,
  node: StageNode,
  enemyDefs: Record<string, unknown>,
  ids: Set<string>,
  issues: ValidationIssue[],
): void {
  if (!node.id) {
    issues.push({ path: `${p}.id`, message: "节点缺少 id", severity: "error" });
  } else if (ids.has(node.id)) {
    issues.push({ path: `${p}.id`, message: `节点 id 重复: ${node.id}`, severity: "error" });
  } else {
    ids.add(node.id);
  }
  if (node.kind === "wave") {
    if (!Array.isArray(node.members) || node.members.length === 0) {
      issues.push({ path: `${p}.members`, message: "wave 至少需要一个成员", severity: "error" });
    }
    node.members.forEach((m, i) => validateMember(`${p}.members[${i}]`, m as WaveMemberSpec, enemyDefs, issues));
  } else if (node.kind === "shop") {
    if (typeof node.x !== "number" || typeof node.y !== "number") {
      issues.push({ path: `${p}.x/y`, message: "shop 需要 x/y", severity: "error" });
    }
  } else {
    issues.push({ path: p, message: `未知节点类型: ${(node as { kind: string }).kind}`, severity: "error" });
  }
}

function validateMember(
  p: string,
  m: WaveMemberSpec,
  enemyDefs: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  if (!m.enemyDefId || !enemyDefs[m.enemyDefId]) {
    issues.push({ path: `${p}.enemyDefId`, message: `引用的敌人定义不存在: ${m.enemyDefId}`, severity: "error" });
  }
  if (!MOB_CLASSES.includes(m.class)) {
    issues.push({ path: `${p}.class`, message: `class 必须是 ${MOB_CLASSES.join("/")}`, severity: "error" });
  }
  if (m.symmetry !== undefined && !SYMMETRY_KINDS.includes(m.symmetry)) {
    issues.push({
      path: `${p}.symmetry`,
      message: `symmetry 必须是 ${SYMMETRY_KINDS.join("/")}（镜像/轴对称）`,
      severity: "error",
    });
  }
}

/** Returns true when the document has no error-severity issues. */
export function isValidStage(doc: unknown): boolean {
  return validateStageDocument(doc).every((i) => i.severity !== "error");
}
