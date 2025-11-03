import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const normalizeBase = (value: string) => {
  if (!value) {
    return "./";
  }

  if (value === "./" || value === ".") {
    return "./";
  }

  const trimmed = value.trim();
  const withLeading = trimmed.startsWith("/") || trimmed.startsWith("http")
    ? trimmed
    : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
};

const base = normalizeBase(process.env.VITE_DEPLOY_BASE ?? "");

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
  },
});
