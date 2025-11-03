import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const normalizeBase = (value: string | undefined | null) => {
  if (!value || value === "./" || value === ".") {
    return "./";
  }

  const trimmed = value.trim();
  const withLeading =
    trimmed.startsWith("/") || trimmed.startsWith("http")
      ? trimmed
      : `/${trimmed}`;

  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
};

const resolveBase = () => {
  const explicit = normalizeBase(process.env.VITE_DEPLOY_BASE);
  if (explicit !== "./") {
    return explicit;
  }

  const isGitHubPages = process.env.GITHUB_PAGES === "true";
  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];

  if (isGitHubPages && repoName) {
    return normalizeBase(`/${repoName}/`);
  }

  return "./";
};

const base = resolveBase();

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
  },
});
