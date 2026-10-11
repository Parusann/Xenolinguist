# ADR 001: Serialized JSON with explicit recovery

Author: Parusan Natheeswaran

Status: implemented. Profiles remain local JSON because the application has one backend owner and modest project-level write concurrency. Adding a database would not by itself fix stale UI mutations, retry duplication or cross-origin desktop drafts.

Expected revisions, per-profile queues, a persisted mutation ledger, flushed atomic replacement and previous snapshots make the current ownership model testable. Indexes are rebuildable, and migration copies original bytes before the first write. Desktop drafts use a stable directory because a new server port changes IndexedDB origin.

Tradeoff: whole-document validation/write cost grows with the corpus. Multi-file profile/audio/archive operations require explicit staging and recovery; they are not one atomic transaction. Multi-user access, substantially larger corpora or transactional cross-project queries would justify a database migration backed by the same client idempotency contracts. See [storage source](../../server/src/services/profile-store.ts) and [performance evidence](../performance.md).
