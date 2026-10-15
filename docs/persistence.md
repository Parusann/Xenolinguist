# Persistence and recovery

Profile edits are optimistic in the interface, durable in a local pending-save store before transmission, and revision-checked in the backend. A visible failure means the edit has not been confirmed as saved. A local-storage failure means the latest edit may exist only in memory; keep the window open and retry.

## Mutation contract

`POST /api/profiles/:id/mutations` accepts `expectedRevision`, a unique `mutationId`, and an ordered `operations` array. Operations set editable profile fields or the number system, put dictionary entries, grammar rules, samples or audio-clip metadata, and remove an entity by collection and ID. Shared schemas validate the request and the complete resulting profile before writing. Existing entity creation timestamps and server-owned profile metadata are preserved.

For example, a profile at revision 4 can receive:

```json
{
  "expectedRevision": 4,
  "mutationId": "edit-7bf221",
  "operations": [
    { "type": "set-fields", "fields": { "phonetic_notes": "Final consonants are aspirated." } }
  ]
}
```

A successful response contains the current `profile`, `mutationId`, `appliedRevision`, and `duplicate`. Applying a new mutation increments the revision once. The last 128 mutation IDs, operation digests and applied revisions are stored in the same atomic profile write. Repeating an identical retained mutation returns the current profile with `duplicate: true`; changing its operations returns `MUTATION_ID_REUSED` (409). The ledger is bounded, so it is not an unlimited historical exactly-once guarantee. An older request whose ledger entry has expired must still satisfy the revision precondition.

A stale mutation returns `REVISION_CONFLICT` (409) and `currentRevision`. The client fetches the current profile and merges only fields changed locally. Independent edits survive. Conflicting changes to the same field stop for an explicit Keep my changes or Use saved version decision. Arrays within an entity and number-system mappings are treated as whole fields. Automatic rebasing is bounded to three conflicts per send cycle.

Compatibility `PUT /api/profiles/:id` requires the current `revision` in its body: omission or an invalid precondition returns 428; a stale value returns 409. Upgrade the frontend and backend together. Direct callers must not retry a stale full-profile replacement blindly.

## File ownership and replacement

One backend process owns a data directory through an exclusive `.owner.lock` containing a PID and token. A live owner blocks a second backend. Dead-owner reclamation is serialized with `.owner-recovery.lock`; unreadable or uncertain ownership fails closed. A leftover recovery lock requires manual inspection after confirming that no backend is running. Never remove locks from a running application.

Per-profile transactions serialize reading, checking the revision, applying operations, validation, replacement, and index refresh. Recovery and file replacement/deletion share a separate lock so a delayed restoration cannot resurrect a deleted profile. The profile lock is acquired before the recovery lock; the recovery lock is released before refreshing the index.

Each write creates an exclusive temporary sibling, flushes its contents, preserves a flushed `.json.prev` snapshot when replacing an existing profile, and renames the new file over the primary. Windows sharing violations receive at most five attempts with bounded backoff. The code never deletes the primary to make a rename succeed. Non-Windows systems also flush the containing directory. These checks do not certify survival of every filesystem, device, or power-loss failure; Windows directory fsync is unavailable here.

`profiles/<id>.json` is authoritative. `profiles.json` is a rebuildable index. An index-write failure is logged without rejecting an already committed profile write. Listing profiles rebuilds the index from files and includes damaged profiles as recovery-required entries. This currently scans profiles and favors correctness over large-library performance; indexing benchmarks belong to W24.

## Recovery and retained files

An absent primary can be restored from a validated, identity-matching `.json.prev`. The restored revision is logged. **That snapshot can be older than the last acknowledged edit.** Pending client operations may replay, but recovery cannot promise to reconstruct edits absent from both the backup and local queue. Invalid or future-version primaries are preserved and are never silently replaced with an older snapshot.

Before manual recovery, close the application and preserve a copy of the whole data directory and desktop `pending-saves` directory. Inspect the error, schema version, IDs, revisions, primary, previous snapshot, and any original migration backup. Keep the damaged original for diagnosis. Do not overwrite a future-version profile with an older application's output. See [Profile format](profile-format.md) for first-write legacy backup rules.

Deletion removes the previous snapshot before the primary while holding the recovery lock. Audio bytes and original migration backups are retained. Client removal of a sample or clip changes metadata through the queue and does not delete audio bytes before the mutation is acknowledged. Shared clips remain linked to remaining samples. Explicit archive-aware garbage collection is future work; retained files can consume disk space.

## Client queue and desktop lifecycle

Each profile has its own queue and draft values. An unsent tail coalesces rapid edits; a request already sealed for transmission is immutable. Its exact mutation ID and operations are persisted before sending. An acknowledged batch is removed from local storage only after updating its base profile. A lost response or restart can therefore retry the same request. Switching profiles does not cancel another profile's queue.

Browser storage uses IndexedDB and waits for transaction completion. Desktop storage uses validated, atomic files under `app.getPath('userData')/pending-saves`, accessed through named preload methods restricted to the application's main frame and expected origin. Desktop files are essential because the local backend chooses a new port on restart: the renderer's IndexedDB origin would otherwise change. There is no arbitrary filesystem or raw IPC bridge.

Sample text, translation, notes and mode; translation inputs and direction; and the active workbench phase are persisted by profile. Audio blobs and generated sandbox sessions have separate lifecycle work in W06/W07. Clearing browser site data, deleting desktop draft files, or a storage-device failure can remove recoverable drafts. A corrupt draft currently stops queue initialization with a visible recovery error while preserving stored files; automatic partial salvage is not implemented. Desktop queue records have a 64 MiB write limit and retain a previous snapshot for manual diagnosis.

Save status distinguishes pending, saving, saved, failed and conflicting edits, including local durability. Retry is available for failures and an overview includes pending work in other profiles. The desktop close handshake freezes editing, flushes pending work, and waits up to 20 seconds. If flushing fails or times out, Keep open is the default; Close anyway is an explicit decision to rely on whatever drafts were successfully stored. Cancelling close restores editing. Browser unload warns when local durability is unresolved.

## Verified boundaries

Unit checks cover stale writes, persisted mutation deduplication, index failure, atomic replacement failures, backend ownership, missing-primary recovery, queue coalescing, in-flight edits, lost responses, conflicts and local-storage failure. Real browser checks exercise persistence and restart through the built application. The Windows unpacked-app probe closes and relaunches the native executable, recovering one pending sample and a translation draft across different ports. See [Acceptance testing](testing.md) for commands and the still-failing IPA, WAV, sandbox and Unicode checks. This work does not certify a clean-machine installer or acoustic/model quality.
