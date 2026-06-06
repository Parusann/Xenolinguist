# Desktop release

## One-time prerequisites (maintainer provides)
- **macOS:** Apple Developer ID Application cert + notarization creds
  (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
- **Windows:** code-signing cert (`CSC_LINK`, `CSC_KEY_PASSWORD`).
- **GitHub token** with `repo` scope as `GH_TOKEN` for publishing.

## Cut a release
1. Bump `version` in `package.json`.
2. `npm run dist` locally to smoke-test the installer (unsigned is fine for local testing).
3. With the env vars above set: `npx electron-builder --config electron/builder.config.cjs --publish always`.
4. electron-builder uploads signed artifacts + `latest.yml` to a GitHub Release;
   installed apps auto-update on next launch via `electron-updater`.

Unsigned builds run locally but show OS "unidentified developer" warnings; signing is
required before public distribution.
