# CI and installed release verification

W12 introduces two independent required-to-review workflow results on pull requests and pushes to `main` and `implementation/reliability`. Repository branch protection is a separate setting; these workflows do not configure it.

[Retained W12 evidence](verification/w12-ci-gates.json) records source revisions, installer checksums, verification results and the failures that led to the final gates.

1. **Source regression gates** uses Node 24 and `npm ci` on Windows and Linux. `npm run check:source` runs client ESLint, syntax checks for repository MJS scripts, TypeScript checks across client/server/desktop/tests, unit and tooling tests, and the production desktop bundle. It then runs the isolated workbench browser suite and public-site suite. Reports and failure traces are retained for 14 days.
2. **Windows installer acceptance** verifies the pinned native asset manifest on every build, including cache hits, builds an NSIS installer with publication disabled, and hashes every unpacked application file. A second Windows runner has no source checkout or application dependency installation. It installs only the harness's locked Playwright dependencies, silently installs the actual NSIS artifact into a disposable directory, then verifies the installed application against the build inventory before launching it.

The portable inventory records the source revision, source lock hash, native models, staged dependency identities and SHA-256/byte length of every application file. Verification rejects changed/missing files, duplicate or escaping paths, symlinks and unexpected additions. The NSIS-generated `Uninstall Xenolinguist.exe` is the only permitted addition; it is not covered by the pre-install application inventory. Artifact transfer and this comparison provide integrity evidence within the CI run, not publisher authentication or a reproducible-build claim.

Lock hashes cover exact checkout bytes. Git line-ending conversion produces different raw lock hashes on Windows and Linux for the same committed JSON; each report retains its own hash, and the installed Windows payload is compared with its Windows build lock.

ONNX staging selects only the target platform and architecture while retaining its code and notices. The Windows installer comparison exposed six missing foreign-architecture files in the earlier all-platform payload. Selecting Windows x64 before packaging removes eleven unused binaries (158,113,768 bytes uncompressed) and keeps the unpacked inventory aligned with the intended installer contents. The verifier still requires every declared file.

Installed acceptance requires real bundled phone inference, nonempty STT, a TTS WAV, authenticated API access, anonymous/foreign-window rejection, microphone permission with a synthetic capture device, profile/sample persistence, original audio checksums and playback, job cancellation, and draft/practice/proposal recovery across a native close and relaunch. Temporarily hiding the phone model must produce `IPA_MODEL_MISSING`; a missing native runtime cannot silently pass as a skip. The temporary model rename is restored even on failure.

Ollama is deliberately unavailable during isolated installed acceptance. The result records that real chat inference was **not run**; model-unavailable behavior and deterministic fixtures still run. On a host with already-installed local models, run `npm run verify:local-model` separately. This command fails when the required default model cannot run, performs no model download, and records optional remote/embedding rejection coverage according to what is installed. Neither fixture responses nor a synthetic dictionary prompt establish model accuracy.

## Local commands

```powershell
npm ci
npm run check:source
npx playwright install chromium
npm run test:e2e:run
npm run test:public
npm run audit:record
npm run provision:models -- --download
npx electron-builder --config electron/builder.config.cjs --win --dir --x64 --publish never --config.directories.output="$env:TEMP/xeno-acceptance-local-build"
node scripts/prepare-release-harness.mjs "$env:TEMP/xeno-acceptance-local-harness"
node scripts/verify-artifact-layout.mjs "$env:TEMP/xeno-acceptance-local-build/win-unpacked" "$env:TEMP/xeno-acceptance-local-harness/artifact-manifest.json" --record
npm ci --ignore-scripts --prefix "$env:TEMP/xeno-acceptance-local-harness"
node "$env:TEMP/xeno-acceptance-local-harness/scripts/verify-release.mjs" "$env:TEMP/xeno-acceptance-local-build/win-unpacked/Xenolinguist.exe" test-results/release-report.json --standalone "--artifact-manifest=$env:TEMP/xeno-acceptance-local-harness/artifact-manifest.json" --negative-model
```

Use a fresh temporary build/harness directory for each run. The local commands exercise an unpacked application without altering an existing installation. The installer installation step runs on disposable CI machines. Installed acceptance reports are retained for 30 days and installer/harness artifacts for seven days; permanent compact evidence belongs in `docs/verification/`.

Pages now runs client lint, TypeScript, unit/tooling and public browser checks before uploading the exact public build that passed. It still deploys only from `main` or an explicit manual dispatch. The older packaged-phone workflow remains available as a manual diagnostic. No workflow publishes an installer automatically. Signing, upgrade/uninstall behavior, physical audio hardware, broad model evaluation and public release certification remain later release work.
