import type {
  StageDocument,
  StageNode,
  WaveMemberSpec,
  EnemyDefinition,
  FireSpec,
  BulletPattern,
} from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

const BULLET_KINDS = ["orb", "knife", "diamond", "spark"];
const SPEED_RANKS = ["low", "medium", "high"];
const MOB_CLASSES = ["minion", "elite", "boss"];

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

function validateBulletPattern(p: string, pattern: BulletPattern, issues: ValidationIssue[]): void {
  const kind = (pattern as { type?: string }).type;
  if (kind === "laser") return;
  const bp = pattern as BulletPattern & { bullet?: unknown };
  if (!bp.bullet || typeof bp.bullet !== "object") {
    issues.push({ path: `${p}.bullet`, message: "缺少 bullet 参数", severity: "error" });
    return;
  }
  const bullet = bp.bullet as Record<string, unknown>;
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
}

/** Returns true when the document has no error-severity issues. */
export function isValidStage(doc: unknown): boolean {
  return validateStageDocument(doc).every((i) => i.severity !== "error");
}
