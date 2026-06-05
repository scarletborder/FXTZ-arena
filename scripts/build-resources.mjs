import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const frontendRoot = path.join(repoRoot, "apps", "frontend");
const publicRoot = path.join(frontendRoot, "public");
const resourcesRoot = path.join(frontendRoot, "resources");
const outputPath = path.join(publicRoot, "resources.dat");
const signaturePath = path.join(publicRoot, "resources.dat.sig");
const magic = Buffer.from("FXTZRES1\n", "ascii");

const files = new Map();

// 直接从 resources 目录收集所有文件
await collectResources(resourcesRoot);

const entries = [];
const chunks = [];
let offset = 0;

for (const [key, filePath] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const data = await readFile(filePath);
  entries.push({
    key,
    mime: mimeFromPath(key),
    offset,
    length: data.length,
  });
  chunks.push(data);
  offset += data.length;
}

const manifest = Buffer.from(JSON.stringify({ version: 1, files: entries }), "utf8");
const manifestSize = Buffer.allocUnsafe(4);
manifestSize.writeUInt32LE(manifest.length, 0);

await mkdir(path.dirname(outputPath), { recursive: true });
const output = Buffer.concat([magic, manifestSize, manifest, ...chunks]);
await writeFile(outputPath, output);
await writeFile(signaturePath, `${createHash("sha256").update(output).digest("hex")}\n`);

console.log(`Built ${path.relative(repoRoot, outputPath)} with ${entries.length} resources.`);
console.log(`Wrote ${path.relative(repoRoot, signaturePath)}.`);

// 直接收集 resources 目录下的所有文件
async function collectResources(root) {
  if (!(await exists(root))) {
    await mkdir(root, { recursive: true });
    console.log(`Created resources directory: ${root}`);
    return;
  }

  await walk(root, async (filePath) => {
    const relative = `assets/${slash(path.relative(root, filePath))}`;
    // 所有文件都加入，不再有过滤规则
    files.set(relative, filePath);
  });
}

async function walk(root, onFile) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(entryPath, onFile);
    } else if (entry.isFile()) {
      await onFile(entryPath);
    }
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function slash(value) {
  return value.replaceAll(path.sep, "/");
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".avif": "image/avif",
    ".json": "application/json",
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".webp": "image/webp",
  }[ext] ?? "application/octet-stream";
}
