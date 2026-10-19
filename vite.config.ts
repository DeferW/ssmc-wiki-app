/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import packageJson from "./package.json" with { type: "json" };

function buildCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_COMMIT__: JSON.stringify(buildCommit()),
  },
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
