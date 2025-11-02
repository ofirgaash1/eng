import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoBase =
  process.env.GITHUB_PAGES === "true" && process.env.GITHUB_REPOSITORY
    ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
    : undefined;

const base = process.env.VITE_DEPLOY_BASE ?? repoBase ?? "./";

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
  },
});
