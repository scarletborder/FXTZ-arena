import { spawnSync } from "node:child_process";

const version = git(["describe", "--tags", "--abbrev=0"]) || "v0.0.0";
const commit = git(["rev-list", "--count", "HEAD"]) || "local";
const buildLabel = `${version}+${commit}`;

console.log(`[desktop] building frontend ${buildLabel}`);

const prebuild = spawnSync(
  "pnpm",
  ["--filter", "{./packages/*}", "run", "--if-present", "build"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (prebuild.error) {
  throw prebuild.error;
}

if (typeof prebuild.status === "number" && prebuild.status !== 0) {
  process.exit(prebuild.status);
}

const result = spawnSync("pnpm", ["--filter", "frontend", "build:desktop"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    APP_VERSION: version,
    APP_COMMIT: commit,
    VITE_APP_VERSION: version,
    VITE_APP_COMMIT: commit,
    VITE_APP_TARGET: "desktop",
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim();
}
