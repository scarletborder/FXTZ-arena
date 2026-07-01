import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const appVersion = normalizeVersion(process.env.APP_VERSION);
const updaterEndpoint = requiredEnv("TAURI_UPDATER_ENDPOINT");
const updaterPubkey = requiredEnv("TAURI_UPDATER_PUBKEY");
const tempDir = mkdtempSync(join(tmpdir(), "fxtz-tauri-config-"));
const configPath = join(tempDir, "tauri.conf.json");

try {
  writeFileSync(
    configPath,
    JSON.stringify({
      version: appVersion,
      bundle: {
        createUpdaterArtifacts: true,
        targets: ["nsis"],
      },
      plugins: {
        updater: {
          endpoints: [updaterEndpoint],
          pubkey: updaterPubkey,
        },
      },
    }),
  );

  const result = spawnSync("tauri", ["build", "--config", configPath], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  assertLatestJsonCreated();
  process.exit(0);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function normalizeVersion(version) {
  const normalized = (version || "0.0.0").replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error(`APP_VERSION must be a SemVer value, got ${version}`);
  }
  return normalized;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function assertLatestJsonCreated() {
  const bundleDir = resolve("src-tauri/target/release/bundle");
  const latestJson = findFile(bundleDir, "latest.json");
  if (!latestJson) {
    throw new Error(
      `Tauri updater manifest was not generated. Expected latest.json under ${bundleDir}.`,
    );
  }
  console.log(`[desktop] updater manifest generated: ${latestJson}`);
}

function findFile(dir, fileName) {
  if (!existsSync(dir)) {
    return null;
  }

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const found = findFile(fullPath, fileName);
      if (found) {
        return found;
      }
      continue;
    }
    if (entry === fileName) {
      return fullPath;
    }
  }
  return null;
}
