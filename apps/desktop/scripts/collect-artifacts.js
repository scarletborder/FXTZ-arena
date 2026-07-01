import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { execSync } from "node:child_process";

const releaseDir = resolve("src-tauri/target/release");
const frontendDistDir = resolve("../frontend/dist");
const resourceAssetsDir = join(frontendDistDir, "resource-assets");
const outputDir = resolve("../../release");
const supplementalReadmeSource = resolve("docs/README.txt");
const portableBinaryBaseName = "fxtz-arena-desktop";
const portableBinaryName = process.platform === "win32" ? `${portableBinaryBaseName}.exe` : portableBinaryBaseName;
const portableBinarySource = join(releaseDir, portableBinaryName);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const buildLabel = getBuildLabel();
const binaryArtifactName = `fxtz-arena-desktop-${buildLabel}${process.platform === "win32" ? ".exe" : ""}`;
const binaryArtifactPath = join(outputDir, binaryArtifactName);
const zipPath = join(outputDir, `fxtz-arena-desktop-portable-${buildLabel}.zip`);

if (!existsSync(portableBinarySource)) {
  throw new Error(`[desktop] Portable binary not found: ${portableBinarySource}`);
}

mkdirSync(outputDir, { recursive: true });
copyArtifact(portableBinarySource, binaryArtifactPath);
console.log(`[desktop] collected portable binary ${binaryArtifactPath}`);

const zipEntries = [
  {
    name: portableBinaryName,
    path: portableBinarySource,
    mode: statSync(portableBinarySource).mode,
  },
];

if (existsSync(supplementalReadmeSource)) {
  zipEntries.push({
    name: basename(supplementalReadmeSource),
    path: supplementalReadmeSource,
    mode: statSync(supplementalReadmeSource).mode,
  });
} else {
  console.warn(`[desktop] Supplemental README not found: ${supplementalReadmeSource}`);
}

if (existsSync(resourceAssetsDir)) {
  zipEntries.push(...collectFiles(resourceAssetsDir, "resource-assets"));
} else {
  console.warn(`[desktop] Resource assets not found: ${resourceAssetsDir}`);
}

writeFileSync(zipPath, createZip(zipEntries));
console.log(`[desktop] collected portable package ${zipPath}`);

function getBuildLabel() {
  if (process.env.BUILD_LABEL) {
    return sanitizeArtifactLabel(process.env.BUILD_LABEL);
  }

  try {
    const tagName = execSync("git describe --tags --abbrev=0", { encoding: "utf8" }).trim();
    const commitCount = execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
    return sanitizeArtifactLabel(`${tagName}+${commitCount}`);
  } catch (error) {
    console.warn("[desktop] Could not determine build label from git, using default");
    return "dev";
  }
}

function sanitizeArtifactLabel(value) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

function collectFiles(root, zipRoot) {
  const entries = [];
  for (const entry of readdirSync(root)) {
    const fullPath = join(root, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      entries.push(...collectFiles(fullPath, `${zipRoot}/${entry}`));
      continue;
    }
    const entryName = `${zipRoot}/${relative(root, fullPath).split(sep).join("/")}`;
    entries.push({ name: entryName, path: fullPath, mode: stat.mode });
  }
  return entries;
}

function copyArtifact(source, destination) {
  if (existsSync(destination)) {
    rmSync(destination, { force: true });
  }
  copyFileSync(source, destination);
}

function createZip(entries) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  for (const entry of entries) {
    const data = readFileSync(entry.path);
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30 + name.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    name.copy(localHeader, 30);
    chunks.push(localHeader, data);

    const centralHeader = Buffer.alloc(46 + name.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(((entry.mode & 0xffff) << 16) >>> 0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    name.copy(centralHeader, 46);
    centralDirectory.push(centralHeader);

    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralDirectory.reduce((size, chunk) => size + chunk.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...centralDirectory, endRecord]);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
