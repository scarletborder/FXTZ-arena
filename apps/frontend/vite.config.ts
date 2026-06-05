import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_APP_BASE ?? "/",
  resolve: {
    alias: {
      "@repo/constants": fileURLToPath(new URL("../../packages/constants/src/index.ts", import.meta.url)),
      "@repo/content": fileURLToPath(new URL("../../packages/content/src/index.ts", import.meta.url)),
      "@repo/i18n": fileURLToPath(new URL("../../packages/i18n/src/index.ts", import.meta.url)),
      "@repo/raid-logic": fileURLToPath(new URL("../../packages/raid-logic/src/index.ts", import.meta.url)),
      "@repo/types": fileURLToPath(new URL("../../packages/types/src/index.ts", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/phaser")) {
            return "phaser";
          }

          if (id.includes("node_modules/@dimforge/rapier")) {
            return "rapier";
          }
        },
      },
    },
  },
  server: {
    port: 3000,
  },
});
