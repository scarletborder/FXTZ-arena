import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const frontendRoot = path.join(repoRoot, "apps", "frontend");
const publicRoot = path.join(frontendRoot, "public");
const resourcesRoot = path.join(frontendRoot, "resources");
const outputRoot = path.join(publicRoot, "resource-assets");
const manifestPath = path.join(publicRoot, "resource-manifest.json");
const legacyPackPaths = [
  path.join(publicRoot, "resources.dat"),
  path.join(publicRoot, "resources.dat.sig"),
];

const files = [];
await collectResources(resourcesRoot);

const previousManifest = await readPreviousManifest(manifestPath);
const previousOutputPaths = new Set(
  previousManifest?.files
    .map((file) => file.outputPath)
    .filter((value) => typeof value === "string" && value.length > 0),
);

await mkdir(outputRoot, { recursive: true });

const manifestFiles = [];
for (const file of files.sort((a, b) => a.key.localeCompare(b.key))) {
  const outputPath = path.join(outputRoot, file.relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await cp(file.sourcePath, outputPath, { force: true });

  const data = await readFile(file.sourcePath);
  const hash = createHash("sha256").update(data).digest("hex");
  const outputPathRelative = slash(path.relative(publicRoot, outputPath));
  manifestFiles.push({
    path: file.key,
    outputPath: outputPathRelative,
    hash,
    size: data.length,
    mime: mimeFromPath(file.key),
  });
  previousOutputPaths.delete(outputPathRelative);
}

for (const stalePath of previousOutputPaths) {
  await rm(path.join(publicRoot, stalePath), { force: true });
}

for (const legacyPath of legacyPackPaths) {
  await rm(legacyPath, { force: true });
}

const manifest = {
  version: 2,
  generatedAt: new Date().toISOString(),
  files: manifestFiles,
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built ${manifestFiles.length} resource files into ${path.relative(repoRoot, outputRoot)}.`);
console.log(`Wrote ${path.relative(repoRoot, manifestPath)}.`);

async function collectResources(root) {
  if (!(await exists(root))) {
    await mkdir(root, { recursive: true });
    console.log(`Created resources directory: ${root}`);
    return;
  }

  await walk(root, async (filePath) => {
    const relativePath = slash(path.relative(root, filePath));
    files.push({
      key: `assets/${relativePath}`,
      relativePath,
      sourcePath: filePath,
    });
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

async function readPreviousManifest(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
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
