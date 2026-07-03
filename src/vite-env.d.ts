/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Injected by vite.config.ts `define` at build time.
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_DEV_AUTH_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
