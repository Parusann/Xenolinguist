# Portable project archives

W13 adds a `.xeno` export in the Field Log and an import in both the Field Log and profile selector. Save or resolve pending edits before exporting. On a fresh installation, expand **Restore a .xeno project archive**, select the file, review its verified counts, then choose **Restore project** and **Open restored project**.

New-project restore is the default. Replacing the active project requires selecting that destination and checking the replacement confirmation. The server compares the expected revision while holding its write lock. If it has changed, reload and inspect again. Before replacing anything, the server creates an independent complete archive of the existing project, including sandbox state. The result offers **Download previous project backup**. The backup also remains under `DATA_DIR/archive-backups/<project-id>-<uuid>.xeno`; importing it as a new project recovers that prior state. Desktop `DATA_DIR` is the application's user-data `data` directory. Backups are retained until explicitly removed by the user.

## Saved content

| Content | Archive behavior |
| --- | --- |
| Project description, notes, dictionary, grammar evidence, number mappings and samples | Preserved with their relationships. |
| Recordings | Original and analysis bytes, duration, checksums, waveform and linked segments are preserved. Missing or damaged required files block export/import. |
| Legacy recordings | Existing WAV/WebM files are preserved without inventing missing analysis assets. The preview identifies this limitation. |
| AI history | Saved user/assistant records, model labels, state and task metadata are retained. These remain proposals, not validated linguistic results. |
| Metric history | Existing snapshots remain intact; importing does not fabricate earlier history. |
| Sandbox answer key, events, guesses and progress | Exported only when **Include sandbox answers and progress** is selected. Replacement backups always include them. |
| Unsaved drafts, current session activity, running jobs, model binaries and settings | Excluded. Complete pending saves before export; local models are provisioned separately. |

There are no separate research-run records in schema 2 yet. Future research schemas need an explicit archive-version update rather than silently dropping unknown fields. JSON and CSV remain limited interchange formats: Dashboard JSON import replaces selected language fields and cannot restore recording bytes, AI history, sandbox sessions or metric history.

Excluding the sandbox session does not redact practice-derived dictionary entries, samples or answers already present in saved AI history. Inspect those records separately before sharing an archive.

## Format and input limits

The file is a standard ZIP with `manifest.json`, `profile.json`, and audio members named `audio/<id>/original`, `audio/<id>/analysis`, or `audio/<id>/legacy.wav` / `legacy.webm`. The version-1 manifest declares profile schema 2, source identity/revision, creation time, sandbox selection, and the byte length and SHA-256 of every payload member. The manifest is the metadata envelope and does not contain a self-referential hash. Checksums detect inconsistency; they are not a signature or proof of origin. Archives are readable and unencrypted.

| Limit | Value |
| --- | --- |
| Uploaded/exported archive and total expanded members | 256 MiB each |
| Individual audio member | 32 MiB |
| Profile / manifest | 10 MiB / 1 MiB |
| Members, including manifest | 2,048 |
| Accepted compression | Stored or deflate; expansion ratio at most 100:1 per member |
| Preview lifetime | 10 minutes; process-local tokens become invalid on restart |
| Staging workspaces / heavy operations | At most three workspaces and one active archive operation |

Exports use stored entries, avoiding unpredictable compression work and ensuring their own expansion ratios remain acceptable. Import uses [yauzl's lazy sequential reader](https://github.com/thejoshwolfe/yauzl) and export uses [yazl](https://github.com/thejoshwolfe/yazl); neither uses the ONNX installation helper. Incoming requests stream to staging with a byte counter. Each entry streams through its own byte counter and digest. Paths must match the precise format allowlist, but are never used as extraction destinations: staging files have server-generated flat names. Duplicate, undeclared, unreferenced, encrypted, directory, symlink and unsupported entries fail inspection. Checks include profile field validation, references, asset hashes and retained-audio format/duration. Unknown versions are rejected before any live writes. The original import file remains on the user's computer.

## Publication and recovery

1. Inspection writes only private staging files and returns counts/warnings. No live profile or audio asset is created.
2. Restore rechecks staged bytes, generates new globally shared audio IDs and new project entity IDs, and remaps sample/clip/segment/dictionary links. A new project receives a new project ID; explicit replacement keeps the destination project ID. Sandbox challenge IDs are deterministic and local to their newly identified session, so challenge references remain unchanged. Mutation retry ledgers are cleared.
3. Replacement checks the destination revision and writes the independent backup before installing assets. Both operations share the profile's mutation lock.
4. All imported asset files and retained metadata are flushed under fresh IDs. Existing shared assets are never overwritten. The complete prospective profile is validated against those files.
5. Atomic profile replacement is the sole publication point. Existing `.prev` recovery and index rebuilding apply. New projects preserve the source revision; replacement advances beyond both source and destination revisions, retaining historical metric revisions.

A failed or interrupted pre-publication import leaves the old profile visible, or no new profile. It may leave unreferenced fresh assets and a completed backup. These are retained conservatively; automatic reference-aware garbage collection is future work. Once publication succeeds, cleanup/index failures do not turn it into a reported failed restore. Expired staging is removed on the next archive workspace operation; previews are cancellable. On restart, inspect the original archive again. After an ambiguous connection failure, check the profile selector before retrying. This is a single-profile transaction built on immutable files and atomic publication, not a cross-filesystem database transaction or exhaustive power-loss certification.

## Verification

`server/src/__tests__/archive-roundtrip.test.ts` covers independent source/destination data directories, relationships, audio hashes and retrieval, continuing sandbox grading, optional sandbox exclusion, legacy recordings, collision-free repeated import, revision conflict, replacement-backup recovery, failed publication/retry, tampered staging and malformed archives. Negative inputs include truncation, checksum mismatch, missing files, future versions, incompatible fields, duplicate members, traversal, symlinks, excessive compression, entry-count overflow and invalid audio with otherwise consistent hashes.

`tests/e2e/archives.spec.ts` exercises UI export, empty-selector restore, playback, explicit replacement confirmation and backup download. The installed-app acceptance harness additionally requires both an audio project and a sandbox/history project to export and restore through the authenticated desktop frame. Native checks are recorded separately from source tests; see [implementation progress](implementation-progress.md).
