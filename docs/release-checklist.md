# Release candidate checklist

Author: Parusan Natheeswaran

Published candidate: **1.1.0-rc.1**, Windows x64, unsigned prerelease, October 14, 2026. The implementation is now on main; the installer remains frozen at `00a25d5`.

| Gate | Required evidence / status |
| --- | --- |
| Source | Locked Windows/Linux lint, types, unit, browser, public and deterministic replay results for the selected revision |
| Fresh installer | Separate runner, no source checkout/Ollama, complete payload hash comparison, real native audio, cancellation, nine archive round trips |
| Recovery | Force backend termination, invalidate credentials, preserve post-crash drafts, explicitly restart once, reject old credentials |
| Migration | Read legacy bytes unchanged, migrate only on write, retain exact `.v1.bak`, reject conflicting backup without replacing original |
| Upgrade | Install checksum-pinned published v1.0.0 then candidate in disposable non-ASCII path; execute recovery/migration/native probes on upgraded files |
| Uninstall | Silent NSIS uninstall removes the installed executable in the disposable runner |
| Offline | `--strict-offline` rejects non-loopback Chromium traffic, update checks and model downloads; native phones, transcription and synthesis run |
| Accessibility | Core/public axe and keyboard tests; actual Electron 200% zoom checked during recovery acceptance |
| Signing | Inspect actual executable/installer Authenticode state. Candidate is unsigned unless a verified signature result says otherwise |
| Evidence | Installer SHA-256, complete payload manifest, source/lock/model identities, test links and explicit scope exclusions |

All required candidate gates passed for `00a25d5`. [Retained outcomes and hashes](verification/w25-release/README.md) include both platforms, fresh installation, upgrade/uninstall and earlier failures. The candidate is unsigned and is now publicly available as a prerelease.

## Selected scope and exclusions

Automatic update download/application and recovery from power loss inside NSIS are **not supported release claims**. The app only checks manually, never downloads automatically. The upgrade gate tests the actual old/new installers and controlled legacy project data; it does not launch the old app or certify every historical profile. A backup-conflict failure tests a failed migration write, not an interrupted NSIS transaction. On failed installation, preserve user data, reinstall the chosen version, and use a compatible pre-migration backup for an older app. Never ask an older app to read a new schema.

The accented installation-directory check does not certify every Unicode path accepted by third-party native tools, including arbitrary system temporary-file paths. First-launch interruption and recovery are not exhaustively certified; the forced-crash gate covers a running backend.

Uninstall is not a secure data-erasure feature. Acceptance user data is intentionally separate and retained for diagnosis. Physical microphone/speaker behavior, human screen-reader usability, arbitrary codecs, non-Windows packages, general unknown-language decipherment and publisher authentication are excluded. Automated accessibility and keyboard evidence is not a screen-reader certification. Three existing native unit checks remain environment-gated; native behavior is separately required in installed acceptance.

Strict offline mode is an application policy, not a host firewall. Chromium completed-request observations cover the app's network stack; independently running Ollama and OS services are outside that capture. The backend accepts only loopback Ollama URLs, rejects reported cloud-backed models and disables downloads in strict mode. The model service's metadata and behavior remain trust assumptions. Browser/OS voice fallback is disabled in strict mode because a voice may use a network service. Fonts and native speech assets are bundled.

## Rollback and signing

Close the app before copying data. Export `.xeno` for a current-version backup. For an older version, restore the untouched `profile.json.v1.bak` (or matching schema backup) into a separate copy of the older app's profile directory. Keep newer profiles and recording assets separately; do not overwrite the only copy. An archive from a newer schema is not an older-version rollback format.

electron-builder supports `CSC_LINK`/`CSC_KEY_PASSWORD` through its existing signing integration. Set `XENO_REQUIRE_SIGNING=1` to make a release build fail without signing. No certificate is purchased or fabricated. Verify `Get-AuthenticodeSignature` on both the installer and installed executable; a signing log line alone does not prove a signature. Keep credentials outside source and evidence logs.

## Publication boundary

The owner authorized publication on October 14, 2026. The exact checked draft artifact is now a public prerelease; its version, date, size and pinned URL identify the website download. Historical verification files retain their original draft-time metadata. Future candidates stay draft until reviewed and authorized; publication does not replace or rewrite frozen evidence.
