import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@repo/constants": fileURLToPath(new URL("../../packages/constants/src/index.ts", import.meta.url)),
      "@repo/content": fileURLToPath(new URL("../../packages/content/src/index.ts", import.meta.url)),
      "@repo/raid-logic": fileURLToPath(new URL("../../packages/raid-logic/src/index.ts", import.meta.url)),
      "@repo/types": fileURLToPath(new URL("../../packages/types/src/index.ts", import.meta.url)),
    },
  },
});
