import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@repo/stage-schema": fileURLToPath(
        new URL("../../packages/stage-schema/src/index.ts", import.meta.url),
      ),
      "@repo/constants": fileURLToPath(
        new URL("../../packages/constants/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
  },
});
