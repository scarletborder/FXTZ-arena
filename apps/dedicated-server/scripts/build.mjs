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
