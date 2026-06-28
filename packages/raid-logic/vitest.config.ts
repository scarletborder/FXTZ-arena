import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@repo/content": fileURLToPath(
        new URL("../content/src/index.ts", import.meta.url),
      ),
      "@repo/i18n": fileURLToPath(
        new URL("../i18n/src/index.ts", import.meta.url),
      ),
      "@repo/types": fileURLToPath(
        new URL("../types/src/index.ts", import.meta.url),
      ),
    },
  },
});
