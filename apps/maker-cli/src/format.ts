import type {
  StageDocument,
  StageNode,
  WaveNode,
  ShopNode,
  EnemyDefinition,
  BulletPreset,
  ShopConfig,
  MovementSpec,
  MovementPhase,
  PathSpec,
  FireSpec,
  FirePattern,
  BulletParams,
  LaserPattern,
  BulletPattern,
  RewardConfig,
  RewardDrop,
  DeathRule,
  SpellCardConfig,
  SpellPhase,
  FormRule,
} from "@repo/stage-schema";

const DEG = "\u00B0";

export function formatOverview(doc: StageDocument): string {
  const lines: string[] = [];
  lines.push(`Stage: ${JSON.stringify(doc.name)} (id: ${doc.id})`);
  if (doc.description) lines.push(`Description: ${doc.description}`);
  if (doc.author) lines.push(`Author: ${doc.author}`);
  lines.push(
    `Arena: ${doc.arena.width} × ${doc.arena.height}` +
      (doc.arena.viewportWidth ? ` (viewport ${doc.arena.viewportWidth}×${doc.arena.viewportHeight ?? "?"})` : ""),
  );
  lines.push(`Compatible modes: ${doc.compatibleModes.join(", ") || "(none)"}`);
  lines.push(`Loop nodes: ${doc.settings?.loopNodes ? "yes" : "no"}`);
  lines.push("");
  lines.push(`Node timeline (${doc.nodes.length}):`);
  if (doc.nodes.length === 0) {
    lines.push("  (empty)");
  } else {
    doc.nodes.forEach((node, i) => lines.push(`  ${i + 1}. ${summarizeNode(node)}`));
  }
  lines.push("");
  const enemyIds = Object.keys(doc.enemyDefs);
  lines.push(`Enemy definitions (${enemyIds.length}):`);
  if (enemyIds.length === 0) lines.push("  (none)");
  else enemyIds.forEach((id) => lines.push(`  - ${summarizeEnemy(doc.enemyDefs[id]!)}`));
  lines.push("");
  const bulletIds = Object.keys(doc.bulletPresets ?? {});
  lines.push(`Bullet presets (${bulletIds.length}):`);
  if (bulletIds.length === 0) lines.push("  (none)");
  else bulletIds.forEach((id) => lines.push(`  - ${summarizeBulletPreset(doc.bulletPresets![id]!)}`));
  lines.push("");
  const shopIds = Object.keys(doc.shopPresets ?? {});
  lines.push(`Shop presets (${shopIds.length}):`);
  if (shopIds.length === 0) lines.push("  (none)");
  else shopIds.forEach((id) => lines.push(`  - ${summarizeShopConfig(doc.shopPresets![id]!)}`));
  return lines.join("\n");
}

export function formatNode(node: StageNode, index: number): string {
  const lines: string[] = [];
  lines.push(`Node #${index + 1} [${node.kind}] ${node.id}`);
  if (node.kind === "shop") {
    const shop = node as ShopNode;
    lines.push(`Position: (${shop.x}, ${shop.y})`);
    lines.push(
      `Rarity pulls: common=${shop.rarityPulls.common ?? 0}, rare=${shop.rarityPulls.rare ?? 0}`,
    );
    lines.push(`Preset: ${shop.presetId ?? "(none)"}`);
  } else {
    const wave = node as WaveNode;
    lines.push(
      `Timing: min=${wave.minNextWaveSeconds}s, max=${wave.maxNextWaveSeconds}s` +
        (wave.maxDurationSeconds !== undefined
          ? `, maxDuration=${wave.maxDurationSeconds}s${wave.clearOnTimeout ? " (clear on timeout)" : ""}`
          : ""),
    );
    lines.push(`Members (${wave.members.length}):`);
    if (wave.members.length === 0) {
      lines.push("  (none)");
    } else {
      wave.members.forEach((m, i) => {
        const parts = [
          `key=${JSON.stringify(m.key)}`,
          `enemy=${m.enemyDefId}`,
          `class=${m.class}`,
          `@${m.spawnAtSeconds ?? 0}s`,
          `spawn=(${m.spawn?.x ?? "?"},${m.spawn?.y ?? "?"})`,
        ];
        if (m.count && m.count > 1) {
          parts.push(`count=${m.count}`);
          if (m.formation) parts.push(`formation=${m.formation.type}`);
        }
        if (m.scaleHealth && m.scaleHealth !== 1) parts.push(`scaleHP=${m.scaleHealth}`);
        lines.push(`  ${i + 1}. ${parts.join(", ")}`);
      });
    }
  }
  return lines.join("\n");
}

export function formatEnemy(def: EnemyDefinition): string {
  const lines: string[] = [];
  lines.push(`Enemy definition: ${def.id}`);
  if (def.displayName) lines.push(`Display name: ${def.displayName}`);
  lines.push(`Class: ${def.class}`);
  if (def.textureKey) lines.push(`Texture key: ${def.textureKey}`);
  lines.push(`Max health: ${def.maxHealth}`);
  lines.push(`Hit radius: ${def.hitRadius}`);
  if (def.hitWidth) lines.push(`Hit box: ${def.hitWidth} × ${def.hitHeight ?? "?"}`);
  if (def.spawn) lines.push(`Spawn: (${def.spawn.x}, ${def.spawn.y})`);
  if (def.tint !== undefined) lines.push(`Tint: #${def.tint.toString(16).padStart(6, "0")}`);
  lines.push(`Rewards: ${describeRewards(def.rewards)}`);
  lines.push(`Movement: ${describeMovement(def.movement)}`);
  lines.push(`Fire (${def.fire?.length ?? 0} rules):`);
  if (!def.fire || def.fire.length === 0) lines.push("  (none)");
  else def.fire.forEach((f, i) => lines.push(`  ${i + 1}. ${describeFireSpec(f)}`));
  lines.push(`Forms (${def.forms?.length ?? 0}):`);
  if (!def.forms || def.forms.length === 0) lines.push("  (none)");
  else def.forms.forEach((r, i) => lines.push(`  ${i + 1}. ${describeFormRule(r)}`));
  lines.push(`Death: ${describeDeath(def.death)}`);
  lines.push(`Spell card: ${describeSpellCard(def.spellCard)}`);
  return lines.join("\n");
}

export function formatBulletPreset(preset: BulletPreset): string {
  const lines: string[] = [];
  lines.push(`Bullet preset: ${preset.id}`);
  if (preset.id) lines.push(`  (key matches id)`);
  lines.push(`Bullet: ${describeBulletParams(preset.bullet)}`);
  return lines.join("\n");
}

export function formatShopConfig(shop: ShopConfig): string {
  const lines: string[] = [];
  lines.push(`Shop preset: ${shop.id}`);
  if (shop.name) lines.push(`Name: ${shop.name}`);
  lines.push(`Rarity pulls: common=${shop.rarityPulls.common ?? 0}, rare=${shop.rarityPulls.rare ?? 0}`);
  return lines.join("\n");
}

// ───────────────────────── summaries (one-liners) ─────────────────────────

function summarizeNode(node: StageNode): string {
  if (node.kind === "shop") {
    const s = node as ShopNode;
    return `[shop] ${s.id} — at (${s.x},${s.y}), pulls common=${s.rarityPulls.common ?? 0} rare=${s.rarityPulls.rare ?? 0}${s.presetId ? `, preset=${s.presetId}` : ""}`;
  }
  const w = node as WaveNode;
  return (
    `[wave] ${w.id} — ${w.members.length} members, min=${w.minNextWaveSeconds}s/max=${w.maxNextWaveSeconds}s` +
    (w.maxDurationSeconds !== undefined
      ? `, maxDuration=${w.maxDurationSeconds}s${w.clearOnTimeout ? "(clear)" : ""}`
      : "")
  );
}

function summarizeEnemy(def: EnemyDefinition): string {
  const name = def.displayName ? ` (${def.displayName})` : "";
  const drops = describeRewards(def.rewards);
  const spell = def.spellCard ? `, spellCard ${def.spellCard.phases.length} phase(s)` : "";
  return `${def.id}${name} [${def.class}] HP=${def.maxHealth} r=${def.hitRadius}, fire=${def.fire?.length ?? 0}, forms=${def.forms?.length ?? 0}${spell}, drops={${drops}}`;
}

function summarizeBulletPreset(p: BulletPreset): string {
  const b = p.bullet;
  return `${p.id} — ${b.kind} ${b.speedRank} ${b.width}×${b.height}${b.color ? ` ${b.color}` : ""}`;
}

function summarizeShopConfig(s: ShopConfig): string {
  return `${s.id}${s.name ? ` (${s.name})` : ""} — common=${s.rarityPulls.common ?? 0} rare=${s.rarityPulls.rare ?? 0}`;
}

// ───────────────────────── detail descriptors ─────────────────────────

function describeRewards(r: RewardConfig | undefined): string {
  if (!r) return "(none)";
  const drops = rewardDrops(r);
  if (drops.length === 0) {
    const legacy: string[] = [];
    if (r.point) legacy.push(`point=${r.point}`);
    if (r.money) legacy.push(`money=${r.money}`);
    if (r.power) legacy.push(`power=${r.power}`);
    return legacy.length ? `legacy {${legacy.join(", ")}}` : "(none)";
  }
  return drops.map((d) => `${d.type} ${d.size} ×${d.count}`).join(", ");
}

function rewardDrops(r: RewardConfig): RewardDrop[] {
  if (r.drops && r.drops.length > 0) return r.drops;
  const out: RewardDrop[] = [];
  if (r.point) out.push({ type: "point", size: r.point, count: 1 });
  if (r.money) out.push({ type: "money", size: r.money, count: 1 });
  if (r.power) out.push({ type: "power", size: r.power, count: 1 });
  return out;
}

function describeMovement(m: MovementSpec | undefined): string {
  if (!m) return "(none)";
  if ("type" in m) {
    if (m.type === "static") return `static at (${m.x}, ${m.y})`;
    if (m.type === "phases") {
      const parts = m.phases.map((p, i) => `  ${i + 1}. ${describePhase(p)}`);
      return `phased (${m.phases.length} phases)\n${parts.join("\n")}`;
    }
    return "(unknown)";
  }
  return `single phase: ${describePhase(m)}`;
}

function describePhase(p: MovementPhase): string {
  const loop = p.loop ? " loop" : "";
  return `@${p.startSeconds}s dur=${p.durationSeconds}s${loop}: ${describePath(p.path)}`;
}

function describePath(path: PathSpec): string {
  switch (path.kind) {
    case "point":
      return `point (${path.x}, ${path.y})`;
    case "line":
      return `line (${path.from.x},${path.from.y})→(${path.to.x},${path.to.y})${path.ease ? ` [${path.ease}]` : ""}`;
    case "bezier":
      return `bezier (${path.from.x},${path.from.y})→(${path.control.x},${path.control.y})→(${path.to.x},${path.to.y})${path.ease ? ` [${path.ease}]` : ""}`;
    case "circle":
      return `circle center(${path.center.x},${path.center.y}) r=${path.radius} start=${path.startAngleDegrees}${DEG} ${path.clockwise ? "cw" : "ccw"}${path.ease ? ` [${path.ease}]` : ""}`;
    case "follow":
      return `follow target=${path.target} offset=(${path.offsetX ?? 0},${path.offsetY ?? 0}) speed=${path.speed ?? 120}`;
    case "drift":
      return `drift vx=${path.vx} vy=${path.vy}`;
  }
}

function describeFireSpec(f: FireSpec): string {
  const id = f.id ? `${f.id} ` : "";
  const enabled = f.enabled === false ? " [disabled]" : "";
  const phase = f.phase !== undefined ? ` [phase ${f.phase}]` : "";
  const repeat = f.repeat !== undefined ? ` repeat=${f.repeat}` : "";
  return `${id}@${f.startSeconds}s every ${f.intervalSeconds}s${repeat}${phase}${enabled}: ${describePattern(f.pattern)}`;
}

function describePattern(p: FirePattern): string {
  if (p.type === "laser") return describeLaser(p);
  return `${describeBulletPattern(p as BulletPattern)}; bullet ${describeBulletParams(p.bullet)}`;
}

function describeBulletPattern(p: BulletPattern): string {
  switch (p.type) {
    case "ring":
      return `ring count=${p.count} start=${p.startAngleDegrees ?? 0}${DEG} rot/shot=${p.rotationDegreesPerShot ?? 0}${DEG} rot/s=${p.rotationDegreesPerSecond ?? 0}${DEG}`;
    case "spread":
      return `spread count=${p.count} center=${p.centerDegrees}${DEG} arc=${p.arcDegrees}${DEG}`;
    case "spiral":
      return `spiral arms=${p.arms} count=${p.count} angVel=${p.angularSpeedDegreesPerSecond}${DEG}/s start=${p.startAngleDegrees ?? 0}${DEG}`;
    case "aimed":
      return `aimed target=${p.target} count=${p.count ?? 1} spread=${p.spreadDegrees ?? 0}${DEG}`;
    case "custom":
      return `custom angles=[${p.anglesDegrees.join(", ")}]`;
  }
}

function describeLaser(p: LaserPattern): string {
  const target = p.target ? ` target=${p.target}` : "";
  return `laser${target} angle=${p.angleDegrees ?? 90}${DEG} len=${p.length ?? "?"} w=${p.width ?? "?"} dur=${p.durationSeconds}s${p.delaySeconds ? ` delay=${p.delaySeconds}s` : ""} dmg=${p.damage ?? 5}`;
}

function describeBulletParams(b: BulletParams): string {
  const parts = [`${b.kind} ${b.speedRank} ${b.width}×${b.height}`];
  if (b.damage) parts.push(`dmg=${b.damage}`);
  if (b.color) parts.push(b.color);
  if (b.homingTicks) parts.push(`homing=${b.homingTicks}`);
  if (b.expireTicks) parts.push(`expire=${b.expireTicks}`);
  return parts.join(" ");
}

function describeFormRule(r: FormRule): string {
  const threshold = r.threshold !== undefined ? ` threshold=${r.threshold}` : "";
  return `${r.when}${threshold} → form=${r.form}`;
}

function describeDeath(d: DeathRule | undefined): string {
  if (!d) return "default (dies at 0 HP)";
  const parts: string[] = [];
  parts.push(`onHealthZero=${d.onHealthZero ?? true}`);
  if (d.maxAgeSeconds !== undefined) parts.push(`maxAge=${d.maxAgeSeconds}s`);
  if (d.leaveScreen) parts.push("leaveScreen");
  if (d.invincible) parts.push("invincible");
  return parts.join(", ");
}

function describeSpellCard(sc: SpellCardConfig | undefined): string {
  if (!sc) return "(none)";
  return `${sc.phases.length} phase(s):\n${sc.phases.map((p, i) => `  ${i + 1}. ${describeSpellPhase(p)}`).join("\n")}`;
}

function describeSpellPhase(p: SpellPhase): string {
  const kindLabel = p.kind === "nonspell" ? "非符" : "符卡";
  const lines = [`[${kindLabel}] "${p.name}" HP=${p.maxHealth} dur=${p.durationSeconds}s`];
  if (p.movement) lines.push(`    movement: ${describeMovement(p.movement).replace(/\n/g, "\n    ")}`);
  if (p.fire && p.fire.length) {
    p.fire.forEach((f, i) => lines.push(`    fire ${i + 1}. ${describeFireSpec(f)}`));
  }
  return lines.join("\n");
}
