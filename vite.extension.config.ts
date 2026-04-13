import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";

function createManifestPlugin(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), "");
  const syncBaseUrl = (env.VITE_USERNAME_SYNC_BASE_URL ?? "").trim();
  const syncOrigin = syncBaseUrl ? new URL(syncBaseUrl).origin : "";
  const hostPermissions = [
    "https://www.youtube.com/*",
    "https://translation.googleapis.com/*",
    ...(syncOrigin ? [`${syncOrigin}/*`] : []),
  ];
  const iconFiles = [
    { size: "16", path: resolve(__dirname, "src/extension/assets/icons/icon-16.png") },
    { size: "32", path: resolve(__dirname, "src/extension/assets/icons/icon-32.png") },
    { size: "48", path: resolve(__dirname, "src/extension/assets/icons/icon-48.png") },
    { size: "128", path: resolve(__dirname, "src/extension/assets/icons/icon-128.png") },
  ] as const;
  const icons = Object.fromEntries(iconFiles.map(({ size }) => [size, `assets/icon-${size}.png`]));
  const actionIcons = Object.fromEntries(
    iconFiles
      .filter(({ size }) => size === "16" || size === "32")
      .map(({ size }) => [size, `assets/icon-${size}.png`]),
  );

  return {
    name: "subtitle-word-tracker-extension-manifest",
    generateBundle() {
      iconFiles.forEach(({ size, path }) => {
        this.emitFile({
          type: "asset",
          fileName: `assets/icon-${size}.png`,
          source: readFileSync(path),
        });
      });

      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(
          {
            manifest_version: 3,
            name: "Subtitle Word Tracker",
            version: "0.1.0",
            description:
              "Clickable YouTube subtitle overlay with saved vocabulary and shared username sync.",
            icons,
            permissions: ["storage", "alarms", "tabs"],
            host_permissions: hostPermissions,
            background: {
              service_worker: "background.js",
              type: "module",
            },
            action: {
              default_popup: "src/extension/popup/popup.html",
              default_icon: actionIcons,
            },
            content_scripts: [
              {
                matches: ["https://www.youtube.com/*"],
                js: ["content.js"],
                run_at: "document_idle",
              },
            ],
            web_accessible_resources: [
              {
                resources: ["page-bridge.js"],
                matches: ["https://www.youtube.com/*"],
              },
            ],
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: "dist-extension",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/extension/popup/popup.html"),
        background: resolve(__dirname, "src/extension/background.ts"),
        "page-bridge": resolve(__dirname, "src/extension/page-bridge/page-bridge.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  plugins: [createManifestPlugin(mode)],
}));
