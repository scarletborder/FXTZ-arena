import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { build } from "esbuild";

const version = process.env.APP_VERSION ?? process.env.VITE_APP_VERSION ?? "0.0.0";
const commit = process.env.APP_COMMIT ?? process.env.VITE_APP_COMMIT ?? "local";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  tsconfig: "tsconfig.json",
  banner: {
    js: [
      "import { createRequire } from 'node:module';",
      "const require = createRequire(import.meta.url);",
      `process.env.APP_VERSION ??= ${JSON.stringify(version)};`,
      `process.env.APP_COMMIT ??= ${JSON.stringify(commit)};`,
      `process.env.VITE_APP_VERSION ??= ${JSON.stringify(version)};`,
      `process.env.VITE_APP_COMMIT ??= ${JSON.stringify(commit)};`,
    ].join(" "),
  },
  define: {
    "process.env.APP_VERSION": JSON.stringify(version),
    "process.env.APP_COMMIT": JSON.stringify(commit),
    "process.env.VITE_APP_VERSION": JSON.stringify(version),
    "process.env.VITE_APP_COMMIT": JSON.stringify(commit),
  },
});

// Emit a package.json so the dist is self-contained and Node.js knows
// it's ESM, even when deployed outside the dedicated-server directory
// (e.g. PM2 with ecosystem.config.cjs).
writeFileSync("dist/package.json", JSON.stringify({ type: "module" }));

// Copy WebTransport native modules and their runtime dependencies.
// These cannot be bundled by esbuild (dynamic imports + native .node addons),
// so they must be resolvable from the dist directory via node_modules.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "../../..");
// The pnpm virtual store is typically at the workspace root's .pnpm directory.
const PNPM_STORE = resolve(WORKSPACE_ROOT, "node_modules/.pnpm");
const WT_PACKAGES = [
  "@fails-components/webtransport",
  "@fails-components/webtransport-transport-http3-quiche",
];
// Transitive npm dependencies used by the packages above at runtime.
const TRANSITIVE_DEPS = ["debug", "ms"];

/**
 * Given a pnpm store directory and a package name, find the actual
 * package path inside the .pnpm virtual store.
 *
 * Example: "debug"  → "node_modules/.pnpm/debug@4.4.3/node_modules/debug"
 * Example: "@scope/name" → "node_modules/.pnpm/@scope+name@1.0.0/node_modules/@scope/name"
 */
function resolvePnpmPackage(pnpmDir, pkgName) {
  const prefix = pkgName.startsWith("@")
    ? pkgName.replace("/", "+") + "@"
    : pkgName + "@";
  const entry = readdirSync(pnpmDir).find((e) => e.startsWith(prefix));
  if (!entry) return null;
  return join(pnpmDir, entry, "node_modules", pkgName);
}

/** Copy a package (resolving pnpm symlinks) into dist/node_modules/. */
function copyPackageToDist(pkgName, srcDir) {
  const destDir = `dist/node_modules/${pkgName}`;
  mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true, dereference: true });
  console.log(`[build] Copied ${pkgName} → ${destDir}`);
}

// 1) Copy the scoped @fails-components packages
for (const pkg of WT_PACKAGES) {
  const src = `node_modules/${pkg}`;
  if (!existsSync(src)) {
    console.warn(`[build] ${pkg} not found in node_modules (symlink) — WebTransport will be unavailable at runtime.`);
    continue;
  }
  try {
    const realSrc = realpathSync(src);
    copyPackageToDist(pkg, realSrc);
  } catch (error) {
    console.warn(`[build] Failed to copy ${pkg}:`, error);
  }
}

// 2) Copy transitive npm dependencies needed by the WebTransport packages
for (const pkg of TRANSITIVE_DEPS) {
  try {
    const realSrc = resolvePnpmPackage(PNPM_STORE, pkg);
    if (realSrc && existsSync(realSrc)) {
      copyPackageToDist(pkg, realSrc);
    } else {
      console.warn(`[build] ${pkg} not found in pnpm store — WebTransport may not initialize properly.`);
    }
  } catch (error) {
    console.warn(`[build] Failed to copy ${pkg}:`, error);
  }
}
