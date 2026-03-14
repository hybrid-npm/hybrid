/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly AGENT_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
