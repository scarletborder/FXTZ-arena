import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_APP_BASE ?? "/",
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
