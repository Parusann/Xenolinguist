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

## Vendoring whisper.cpp (Windows) — voice Increment 2 (STT)

The speech-to-text sidecar bundles a prebuilt whisper.cpp CPU binary + a quantized model
under `vendor/whisper/win/`, shipped to `resources/whisper/` via `extraResources`. The
Electron main process sets `WHISPER_BIN`/`WHISPER_MODEL` (win32 only, `existsSync`-guarded);
elsewhere they stay unset and `/api/stt` returns 503 (the UI degrades gracefully).

Vendored files (do **not** add the other tools or `SDL2.dll` — `whisper-cli` only needs these):

- From the **whisper.cpp v1.8.6** GitHub release asset `whisper-bin-x64.zip` (the plain **CPU**
  build — portable, no CUDA/BLAS deps): `whisper-cli.exe`, `whisper.dll`, `ggml.dll`,
  `ggml-base.dll`, `ggml-cpu.dll`.
- Model `ggml-base-q5_1.bin` (~57 MB, multilingual) from
  `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin`.

`.gitattributes` marks `vendor/whisper/win/*`, `*.dll`, `*.bin`, `*.wav` as `binary` so the
exe/DLLs/model and the test WAV fixture aren't corrupted by line-ending conversion.

**Verify the bundled binary transcribes:** `node scripts/verify-stt.mjs` (runs the real
spawn → JSON → language/mode path against `server/src/__tests__/fixtures/hello-16k.wav`;
expects `mode: transcription`). This is the canonical check — the vitest gated test
(`WHISPER_E2E=1`) is unreliable on Windows because vitest's forked worker can't spawn the
multi-DLL `whisper-cli.exe`.

**To re-vendor / upgrade:** download the matching `whisper-bin-x64.zip` for the new release,
copy the 5 files above, and re-run `verify-stt.mjs`.

**macOS / Linux:** not yet vendored — STT degrades to browser/none there until those builds
add their whisper binaries. (Same staged approach as espeak-ng in Increment 1.)

