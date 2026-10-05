/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_PRIMEUI_LICENSE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
