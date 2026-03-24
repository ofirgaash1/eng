/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USERNAME_SYNC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
