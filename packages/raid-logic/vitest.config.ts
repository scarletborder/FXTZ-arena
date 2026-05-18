import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@repo/types": fileURLToPath(new URL("../types/src/index.ts", import.meta.url)),
    },
  },
});
