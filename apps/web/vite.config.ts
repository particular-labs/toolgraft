import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  base: "./",
  publicDir: "../../packages/brand/assets",
  build: {
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        start: resolve(import.meta.dirname, "get-started.html"),
        docs: resolve(import.meta.dirname, "docs.html"),
        registry: resolve(import.meta.dirname, "registry.html"),
        privacy: resolve(import.meta.dirname, "privacy.html"),
        agent: resolve(import.meta.dirname, "agent-guide.html"),
      },
    },
  },
});
