/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare interface ImportMetaEnv {
  readonly VITE_AMAP_KEY: string
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv
}
