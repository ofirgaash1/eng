import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Automatically determines the correct base path for Vite builds.
 * Works both locally (base="./") and on GitHub Pages (base="/<repo>/").
 */
function getBase() {
  // 1️⃣ Explicitly use env variable if provided
  const explicit = process.env.VITE_DEPLOY_BASE;
  if (explicit && explicit !== "." && explicit !== "./") {
    return explicit.endsWith("/") ? explicit : `${explicit}/`;
  }

  // 2️⃣ Detect GitHub Pages environment (either via Actions or local build)
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const isPages = process.env.GITHUB_PAGES === "true" || !!repo;

  if (isPages && repo) {
    return `/${repo}/`; // e.g., "/eng/"
  }

  // 3️⃣ Default for local dev
  return "./";
}

export default defineConfig({
  base: getBase(),
  plugins: [react()],
  server: {
    port: 5173,
  },
});
