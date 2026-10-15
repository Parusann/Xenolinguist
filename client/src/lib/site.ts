export const isPublicSite = import.meta.env.VITE_PUBLIC_SITE === 'true'
export const REPO_URL = 'https://github.com/Parusann/Xenolinguist'
// Keep the installer, tag, date and limitations together. Update after verifying a new release.
export const RELEASE = { version: '1.1.0-rc.1', tag: 'v1.1.0-rc.1', date: '2026-10-14', bytes: 405501373 }
export const DOWNLOAD_URL = `${REPO_URL}/releases/download/${RELEASE.tag}/Xenolinguist-Setup-${RELEASE.version}.exe`
export const SOURCE_REVISION: string = import.meta.env.VITE_SOURCE_REVISION || 'unversioned'
export const SOURCE_URL = `${REPO_URL}/tree/main`
export const PRIMARY_LABEL = isPublicSite ? 'Download for Windows' : 'Open workbench'
