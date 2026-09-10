/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    // Generated snapshots are replaced as a directory. Watching their thousands
    // of assets wastes work and can hold directory handles open on Windows.
    watch: { ignored: ["**/public/data", "**/public/data/**", "**/public/.data-stage-*", "**/public/.data-stage-*/**"] },
    proxy: {
      "/admin-api": {
        target: "https://ssmc-wiki-admin-api.24dfffer.workers.dev",
        changeOrigin: true,
        headers: { Origin: "https://deferw.github.io" },
        rewrite: (path) => path.replace(/^\/admin-api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
