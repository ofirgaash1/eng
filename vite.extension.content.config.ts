import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist-extension",
    emptyOutDir: false,
    target: "es2020",
    lib: {
      entry: resolve(__dirname, "src/extension/content/content.ts"),
      formats: ["iife"],
      name: "SubtitleWordTrackerContent",
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
