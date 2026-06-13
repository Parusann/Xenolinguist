// Distinguishes the two builds produced from this one codebase:
//   - desktop / in-app build  → VITE_PUBLIC_SITE unset → isPublicSite === false
//   - public GitHub Pages build → workflow sets VITE_PUBLIC_SITE=true
export const isPublicSite = import.meta.env.VITE_PUBLIC_SITE === 'true'

// Direct installer URL injected by the Pages workflow from the latest GitHub
// Release. Falls back to the releases page when not provided (e.g. local builds).
export const DOWNLOAD_URL =
  import.meta.env.VITE_DOWNLOAD_URL ||
  'https://github.com/Parusann/Xenolinguist/releases/latest'
