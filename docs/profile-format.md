# Profile format, version 2

Profiles now carry `schema_version: 2` and a nonnegative `revision`. Zod schemas under `shared/schemas` define both runtime validation and the TypeScript data types. Server-owned IDs and timestamps cannot be replaced through editable data fields.

The boundary checks nested dictionaries, grammar rules, samples, audio clips, segment bounds, identifier uniqueness, references, timestamps, optional manual ratings (null or finite values in 0-100), and an unknown (`null`) or integer number base in 2-36. Unknown fields and malformed nested values are rejected rather than silently discarded. Number-base validation happens before imported data can enter the number-decoding UI.

`user_asserted_confidence` records the explicitly manual score. The older `confidence` field remains a compatibility alias for current editors; parsing synchronizes the manual field from that alias. Neither field is a calibrated probability or evidence-backed validation status. W08 labels ratings as user belief and starts new entries unrated. See [workspace evidence](workspace-evidence.md).

Unversioned/version-1 profiles are validated and migrated in memory on read. The original profile is not rewritten by a GET. Before the first successful migrated write, the store creates and flushes `<id>.json.v1.bak` without replacing an existing backup. The backup is byte-for-byte original content. A mismatched existing backup aborts the write. Missing optional historical sample fields become `null`; IDs, timestamps, notes, and legitimate scores remain intact.

Malformed JSON, invalid stored structure, mismatched file identity, unreadable files, and unsupported future versions have distinct error codes. Invalid files remain untouched. Error responses retain the legacy `error` string and add `code`, `message`, `requestId`, `retryable`, and field `issues` where applicable. API writes and the dashboard import use the same validators. Deleting a dictionary entry clears its segment references so the resulting profile remains structurally valid.

Writes now use serialized transactions and revision preconditions. The profile also stores a bounded `recent_mutations` ledger so a retried request can be acknowledged without applying it twice. The client persists pending edits before sending them and exposes save failures and conflicts. See [Persistence and recovery](persistence.md) for the API contract, file ownership, recovery procedure, and durability limits.

JSON export still carries metadata only; portable audio archives arrive in W13. Keep the original backup when rolling back to an older application; do not edit a version-2 file with a reader that does not understand its schema. Older clients that omit a revision from PUT now receive HTTP 428 and must be upgraded alongside the server.

`metric_snapshots` is optional server-owned metadata. A successful save records changed metric counts with a definition version, committed revision and recording time, retaining the latest 1,000 snapshots. Importing content cannot overwrite an existing workspace history. Profiles without snapshots have no reconstructed history.
