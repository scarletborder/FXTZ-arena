import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

  process.exit(result.status ?? 1);
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
