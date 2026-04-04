/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_TRANSLATE_API_KEY?: string;
  readonly VITE_USERNAME_SYNC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
