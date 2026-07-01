import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { execSync } from "node:child_process";

const bundleDir = resolve("src-tauri/target/release/bundle");
const releaseDir = resolve("src-tauri/target/release");
const outputDir = resolve("../../dist-desktop");
const supplementalReadmeSource = resolve("docs/README.txt");
const supplementalReadmeTarget = join(outputDir, "README.txt");
const artifactPattern = /\.(msi|exe|dmg|deb|rpm|AppImage|sig|json|zip)$/;
const portableBinaryName = "fxtz-arena-desktop";
const collectedArtifacts = [];
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

// Get version info from environment or git
function getBuildLabel() {
  // Try to get from environment variables first (GitHub Actions)
  if (process.env.BUILD_LABEL) {
    return process.env.BUILD_LABEL;
  }
  
  // Try to get from git for local builds
  try {
    const tagName = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
    const commitCount = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
    return `${tagName}+${commitCount}`;
  } catch (error) {
    console.warn('[desktop] Could not determine build label from git, using default');
    return 'dev';
  }
}

mkdirSync(outputDir, { recursive: true });

function collect(dir, options = { recursive: true }) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (options.recursive) {
        collect(fullPath, options);
      }
      continue;
    }
    if (isArtifact(entry)) {
      const destination = copyArtifact(fullPath, join(outputDir, basename(entry)));
      collectedArtifacts.push(destination);
      console.log(`[desktop] collected ${destination}`);
    }
  }
}

function copyArtifact(source, destination) {
  let target = destination;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      if (existsSync(target)) {
        rmSync(target, { force: true });
      }
      copyFileSync(source, target);
      return target;
    } catch (error) {
      if (!["EBUSY", "EPERM", "EACCES"].includes(error?.code) || attempt === 11) {
        target = withTimestamp(destination);
        copyFileSync(source, target);
        return target;
      }
      sleep(250);
    }
  }
}

function withTimestamp(filePath) {
  const dotIndex = filePath.lastIndexOf(".");
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  if (dotIndex < 0) {
    return `${filePath}-${stamp}`;
  }
  return `${filePath.slice(0, dotIndex)}-${stamp}${filePath.slice(dotIndex)}`;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

collect(releaseDir, { recursive: false });
collect(bundleDir, { recursive: true });

if (existsSync(supplementalReadmeSource)) {
  const destination = copyArtifact(supplementalReadmeSource, supplementalReadmeTarget);
  collectedArtifacts.push(destination);
  console.log(`[desktop] collected supplemental README ${destination}`);
} else {
  console.warn(`[desktop] Supplemental README not found: ${supplementalReadmeSource}`);
}

const buildLabel = getBuildLabel();
const zipPath = join(outputDir, `fxtz-arena-desktop-${buildLabel}.zip`);
const zipEntries = collectedArtifacts.map((path) => ({ name: basename(path), path, mode: statSync(path).mode }));

if (zipEntries.length > 0) {
  writeFileSync(zipPath, createZip(zipEntries));
  console.log(`[desktop] zipped ${zipPath}`);
} else {
  console.warn('[desktop] No artifacts collected, zip not created');
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

function isArtifact(entry) {
  return artifactPattern.test(entry) || entry === portableBinaryName;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
