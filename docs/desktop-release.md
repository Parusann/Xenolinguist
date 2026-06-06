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

## Windows: building without admin (winCodeSign symlink workaround)

On Windows, `electron-builder` extracts its `winCodeSign` tool, which contains macOS
`.dylib` **symlinks**. Creating symlinks needs a privilege a normal user lacks, so the
NSIS build fails with:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
  ... winCodeSign\<hash>\darwin\10.12\lib\libcrypto.dylib
```

Two fixes (the macOS files are irrelevant to a Windows build):

- **Preferred:** enable **Developer Mode** (Settings → Privacy & security → For developers)
  or run the build from an elevated terminal, then `npm run dist`.
- **No-admin workaround:** pre-extract `winCodeSign` into the cache *excluding* `darwin`,
  so electron-builder finds a valid cache and skips its own (failing) extraction:

  ```bash
  CACHE="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
  SZA="node_modules/7zip-bin/win/x64/7za.exe"
  # any of the cached *.7z is winCodeSign-2.6.0.7z
  "$SZA" x "$CACHE/<one>.7z" -o"$CACHE/winCodeSign-2.6.0" '-xr!darwin' -y
  CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist
  ```

Either way the output (`release/Xenolinguist Setup <ver>.exe`) is **unsigned** — it runs
but shows a SmartScreen "unknown publisher" prompt until real signing certs are configured.

