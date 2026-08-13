/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/catalog-data": {
        target: "http://127.0.0.1:4174",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/catalog-data/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
  },
});
