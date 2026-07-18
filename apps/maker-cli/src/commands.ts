import {
  createEmptyStage,
  createSampleStage,
  type StageDocument,
  type StageNode,
  type EnemyDefinition,
  type BulletPreset,
  type ShopConfig,
} from "@repo/stage-schema";
import {
  readStage,
  writeStage,
  locateNode,
  locateEnemy,
  locateBullet,
  locateShop,
  resolveNodeIndex,
  validationErrors,
  type Section,
} from "./io";
import {
  getByPath,
  setByPath,
  deleteByPath,
} from "./paths";
import { parseValue, describeValue } from "./values";
import {
  defaultWaveNode,
  defaultShopNode,
  defaultEnemy,
  defaultBulletPreset,
  defaultShopConfig,
  clone,
} from "./defaults";
import {
  formatOverview,
  formatNode,
  formatEnemy,
  formatBulletPreset,
  formatShopConfig,
} from "./format";

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function sectionRequiresId(section: Section): void {
  if (section !== "node" && section !== "enemy" && section !== "bullet" && section !== "shop") {
    fail(`Unknown section "${section}". Expected node | enemy | bullet | shop.`);
  }
}

function printValidation(doc: StageDocument): void {
  const errs = validationErrors(doc);
  if (errs.length > 0) {
    process.stdout.write("\nValidation issues:\n");
    errs.forEach((e) => process.stdout.write(e + "\n"));
  } else {
    process.stdout.write("\nValidation: OK (no errors).\n");
  }
}

// ───────────────────────── create ─────────────────────────

export function cmdCreate(args: { positionals: string[]; flags: Record<string, string | boolean> }): void {
  const file = args.positionals[0];
  if (!file) fail("Usage: create <file> [--sample] [--id <id>] [--name <name>]");
  const sample = args.flags.sample === true;
  let doc: StageDocument;
  if (sample) {
    doc = createSampleStage();
  } else {
    doc = createEmptyStage({});
  }
  if (typeof args.flags.id === "string") doc.id = args.flags.id;
  if (typeof args.flags.name === "string") doc.name = args.flags.name;
  writeStage(file, doc);
  process.stdout.write(`Created ${sample ? "sample" : "empty"} stage "${doc.name}" (id: ${doc.id}) at ${file}.\n`);
  printValidation(doc);
}

// ───────────────────────── overview ─────────────────────────

export function cmdOverview(args: { positionals: string[] }): void {
  const file = args.positionals[0];
  if (!file) fail("Usage: overview <file>");
  const doc = readStage(file);
  process.stdout.write(formatOverview(doc) + "\n");
  printValidation(doc);
}

// ───────────────────────── view ─────────────────────────

export function cmdView(args: { positionals: string[]; flags: Record<string, string | boolean> }): void {
  const [file, section, id] = args.positionals;
  if (!file || !section || !id) fail("Usage: view <file> <section> <id>");
  sectionRequiresId(section as Section);
  const doc = readStage(file);
  const asJson = args.flags.json === true;

  if (section === "node") {
    const located = locateNode(doc, id);
    if (asJson) process.stdout.write(JSON.stringify(located.node, null, 2) + "\n");
    else process.stdout.write(formatNode(located.node, located.index) + "\n");
  } else if (section === "enemy") {
    const def = locateEnemy(doc, id);
    if (asJson) process.stdout.write(JSON.stringify(def, null, 2) + "\n");
    else process.stdout.write(formatEnemy(def) + "\n");
  } else if (section === "bullet") {
    const preset = locateBullet(doc, id);
    if (asJson) process.stdout.write(JSON.stringify(preset, null, 2) + "\n");
    else process.stdout.write(formatBulletPreset(preset) + "\n");
  } else {
    const shop = locateShop(doc, id);
    if (asJson) process.stdout.write(JSON.stringify(shop, null, 2) + "\n");
    else process.stdout.write(formatShopConfig(shop) + "\n");
  }
}

// ───────────────────────── edit ─────────────────────────

export function cmdEdit(args: { positionals: string[] }): void {
  const [file, section, id, field, ...valueParts] = args.positionals;
  if (!file || !section || !id || !field) {
    fail("Usage: edit <file> <section> <id> <field> <value>");
  }
  sectionRequiresId(section as Section);
  const valueRaw = valueParts.join(" ");
  if (valueRaw === "") fail("No value provided. Pass a value (or \"null\" to delete).");

  const doc = readStage(file);
  let target: unknown;
  let label: string;
  if (section === "node") {
    const located = locateNode(doc, id);
    target = located.node;
    label = `node ${located.node.id}`;
  } else if (section === "enemy") {
    target = locateEnemy(doc, id);
    label = `enemy ${id}`;
  } else if (section === "bullet") {
    target = locateBullet(doc, id);
    label = `bullet ${id}`;
  } else {
    target = locateShop(doc, id);
    label = `shop ${id}`;
  }

  const before = getByPath(target, field);
  const parsed = parseValue(valueRaw);
  if ("delete" in parsed) {
    deleteByPath(target, field);
  } else {
    setByPath(target, field, parsed.value);
  }
  writeStage(file, doc);
  process.stdout.write(`Edited ${label}: ${field}\n`);
  process.stdout.write(`  before: ${describeValue(before)}\n`);
  process.stdout.write(`  after:  ${describeValue("delete" in parsed ? "(deleted)" : parsed.value)}\n`);
  printValidation(doc);
}

// ───────────────────────── append ─────────────────────────

export function cmdAppend(args: { positionals: string[]; flags: Record<string, string | boolean> }): void {
  const [file, section, id] = args.positionals;
  if (!file || !section || !id) {
    fail("Usage: append <file> <section> <id> [--kind wave|shop] [--from <srcId>] [--json '<json>']");
  }
  sectionRequiresId(section as Section);
  const doc = readStage(file);
  const fromId = typeof args.flags.from === "string" ? args.flags.from : undefined;
  const jsonSpec = typeof args.flags.json === "string" ? args.flags.json : undefined;

  if (section === "node") {
    appendNode(doc, id, args.flags, fromId, jsonSpec);
  } else if (section === "enemy") {
    appendEnemy(doc, id, fromId, jsonSpec);
  } else if (section === "bullet") {
    appendBullet(doc, id, fromId, jsonSpec);
  } else {
    appendShop(doc, id, fromId, jsonSpec);
  }
  writeStage(file, doc);
  printValidation(doc);
}

function appendNode(
  doc: StageDocument,
  id: string,
  flags: Record<string, string | boolean>,
  fromId?: string,
  jsonSpec?: string,
): void {
  if (resolveNodeIndex(doc.nodes, id) !== undefined && resolveNodeIndex(doc.nodes, id)! >= 0) {
    fail(`A node with id "${id}" already exists.`);
  }
  let node: StageNode;
  if (jsonSpec) {
    node = JSON.parse(jsonSpec) as StageNode;
    node.id = id;
  } else if (fromId) {
    const src = locateNode(doc, fromId).node;
    node = clone(src);
    node.id = id;
  } else {
    const kind = typeof flags.kind === "string" ? flags.kind : "wave";
    if (kind === "shop") node = defaultShopNode(id, doc.arena);
    else if (kind === "wave") node = defaultWaveNode(id);
    else fail(`--kind must be wave or shop (got "${kind}").`);
  }
  doc.nodes.push(node);
  process.stdout.write(`Appended node #${doc.nodes.length} [${node.kind}] "${node.id}".\n`);
}

function appendEnemy(
  doc: StageDocument,
  id: string,
  fromId?: string,
  jsonSpec?: string,
): void {
  if (doc.enemyDefs[id]) fail(`An enemy definition with id "${id}" already exists.`);
  let def: EnemyDefinition;
  if (jsonSpec) {
    def = JSON.parse(jsonSpec) as EnemyDefinition;
    def.id = id;
  } else if (fromId) {
    def = clone(locateEnemy(doc, fromId));
    def.id = id;
  } else {
    def = defaultEnemy(id, doc.arena);
  }
  doc.enemyDefs[id] = def;
  process.stdout.write(`Appended enemy definition "${id}".\n`);
}

function appendBullet(
  doc: StageDocument,
  id: string,
  fromId?: string,
  jsonSpec?: string,
): void {
  (doc.bulletPresets ??= {});
  if (doc.bulletPresets[id]) fail(`A bullet preset with id "${id}" already exists.`);
  let preset: BulletPreset;
  if (jsonSpec) {
    preset = JSON.parse(jsonSpec) as BulletPreset;
    preset.id = id;
  } else if (fromId) {
    preset = clone(locateBullet(doc, fromId));
    preset.id = id;
  } else {
    preset = defaultBulletPreset(id);
  }
  doc.bulletPresets[id] = preset;
  process.stdout.write(`Appended bullet preset "${id}".\n`);
}

function appendShop(
  doc: StageDocument,
  id: string,
  fromId?: string,
  jsonSpec?: string,
): void {
  (doc.shopPresets ??= {});
  if (doc.shopPresets[id]) fail(`A shop preset with id "${id}" already exists.`);
  let cfg: ShopConfig;
  if (jsonSpec) {
    cfg = JSON.parse(jsonSpec) as ShopConfig;
    cfg.id = id;
  } else if (fromId) {
    cfg = clone(locateShop(doc, fromId));
    cfg.id = id;
  } else {
    cfg = defaultShopConfig(id);
  }
  doc.shopPresets[id] = cfg;
  process.stdout.write(`Appended shop preset "${id}".\n`);
}
