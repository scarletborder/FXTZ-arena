import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const targets = [join("apps", "frontend", "dist")];

for (const entry of readdirSync("packages", { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const distPath = join("packages", entry.name, "dist");

  try {
    if (statSync(distPath).isDirectory()) {
      targets.push(distPath);
    }
  } catch {
    // Ignore missing dist folders.
  }
}

for (const target of targets) {
  rmSync(target, { recursive: true, force: true });
}
