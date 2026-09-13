/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE?: string
  readonly VITE_SOURCE_REVISION?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
