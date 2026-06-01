import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = resolve(root, "src/locales");
const target = resolve(root, "dist/locales");

await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });
