/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
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
  },
});
