/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SITE?: string
  readonly VITE_DOWNLOAD_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
