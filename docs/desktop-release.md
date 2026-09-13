# Desktop builds and release status

## Published artifact versus development

The latest published installer verified through GitHub release metadata on September 13, 2026 is [v1.0.0](https://github.com/Parusann/Xenolinguist/releases/tag/v1.0.0), published June 14, 2026. Its asset is [Xenolinguist-Setup-1.0.0.exe](https://github.com/Parusann/Xenolinguist/releases/download/v1.0.0/Xenolinguist-Setup-1.0.0.exe), 440,684,361 bytes, SHA256 `5974906a74a11eb7d4e14c0923ec5ff870e5669ad050b832b10b773e8491c6b5`. The release is unsigned. Metadata/HTTP reachability checks are not installer execution tests.

The `implementation/reliability` preview contains W01–W11 changes that are absent from that installer. The package version is still 1.0.0; identify preview builds by source revision, working-file hashes and artifact hashes in [verification records](verification/), not by the package version alone. The published tag's startup code can pull the default Ollama model automatically. W10 removed that behavior from the preview.

The old installer predates the repaired native dependency layout, durable saves and audio drafts, authenticated local API, verified local model selection and cancellable jobs. The [pre-implementation baseline](testing-baseline.json) reproduced phone-loading failure in a separately packaged artifact. Later successful Windows probes verify their own artifacts; they do not retroactively certify the old installer.

Windows x64 is the only current native packaging target. `beforePack` rejects other targets because the manifest only covers Windows x64. Legacy macOS/Linux builder fields do not establish platform support. Do not describe an unpacked acceptance run as signed-installer or clean-machine installation certification.

## Build a local preview

Use a Node release compatible with locked dependencies, install with `npm ci`, and preserve all third-party notices. Local W10 checks used Node 25.8.2; the Electron 42 artifact embeds Node 24.15.0. Provision exact native assets before packaging:

```sh
npm ci
npm run provision:models
# Explicitly retrieve the pinned distribution only if the ignored model is absent:
npm run provision:models -- --download
npm run typecheck
npm run lint -w client
npm test
npm run test:e2e
npm run test:public
npm run dist
```

The asset provisioner validates checksums and fails rather than silently replacing mismatched files. It can also use a checksum-matching local installer with `--release-file=C:/Downloads/Xenolinguist-Setup-1.0.0.exe`. See [phone provisioning](ipa-model-notes.md).

The build bundles main, preload, backend and phone-child entries, stages production native dependencies outside ASAR, verifies lockfile versions and manifests, and packages the SPA plus native resources. The Windows output is `release/Xenolinguist-Setup-<version>.exe` and an unpacked executable. Ollama models are a separate optional installation; the preview does not pull them at startup.

A packaged probe should run outside the source checkout. For negative model checks, use an isolated `xeno-acceptance-*` copy under system temp, as enforced by the verifier:

```sh
npm run verify:release -- C:/Users/<user>/AppData/Local/Temp/xeno-acceptance-build/win-unpacked/Xenolinguist.exe test-results/release.json --negative-model
```

That probe exercises the actual packaged runtime, native audio, API boundary and close/relaunch recovery. Synthetic fixtures do not establish physical microphone compatibility or linguistic accuracy. `node scripts/verify-local-chat.mjs` separately checks an already-installed local model, rejection of remote/embedding models and real generation cancellation/retry; it downloads no models.

## Preparing a future release

A commit/push to the implementation branch does not publish an installer. Before a future explicitly chosen release:

1. Select a source revision and a new package/release version. Run the applicable unit, browser, public-page and packaged checks; retain hashes and limitations.
2. Build the Windows installer from that verified source. Exercise installation and upgrade in an isolated environment; an unpacked test alone is insufficient.
3. Decide and document signing status. A configured Windows certificate may use `CSC_LINK` and `CSC_KEY_PASSWORD`; an unsigned build will not gain trust from source visibility.
4. Publish the exact checked artifact and updater metadata through the release workflow with the required GitHub credentials. Never put credentials into source or logs.
5. Update `client/src/lib/site.ts` release version, date, size and URL together, and update its corresponding limitations, README and release notes. Verify the actual asset destination before deploying Pages.

The desktop calls `electron-updater.checkForUpdatesAndNotify()` in packaged operation. This uses the network; successful update/rollback behavior is not certified by the local runtime tests. W12/W25 contain the broader release gates.

## Native maintenance

`vendor/model-manifest.json` and `vendor/THIRD_PARTY.md` are authoritative for shipped bytes and notices. Upgrade the whisper binary, dependent DLLs and model as a coherent set; update hashes and rerun native verification. Do not copy arbitrary latest binaries over manifested assets or claim reproducibility of a conversion whose original tool/model revision is unknown.

Windows packaging can require privileges for electron-builder's helper symlinks. Use an appropriately configured Windows build environment and record failures; do not bypass failed asset or runtime checks. No signed or cross-platform release is produced by this documentation update.
