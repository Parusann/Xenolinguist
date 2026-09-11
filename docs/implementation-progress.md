# Implementation progress

The implementation follows the 26-work-package review plan. This log distinguishes implemented boundaries from remaining release and research work.

| Package | Status | Delivered scope |
| --- | --- | --- |
| W01 | Implemented in `c33b581` | Isolated browser and packaged-app probes; reproducible WAV, IPA, concurrency, sandbox and Unicode findings; hashed verification records. |
| W02 | Implemented in `18896b2` | Shared version-2 runtime schemas, guarded import, byte-preserving legacy migration backups, structured errors and manual-confidence provenance. |
| W03 | Implemented with W04 | Revision-checked serialized mutations, persisted retry ledger, atomic replacement, previous snapshots, derived-index repair and one backend owner per data directory. |
| W04 | Implemented with W03 | Durable per-profile save queues, explicit failure/conflict states, field-level rebase, persisted text drafts and phase, and native close/restart recovery. |
| W05 | Implemented locally; clean-runner gate pending | Explicit runtime resolution, staged production dependencies, pinned asset provisioning, input/error contracts, output provenance and packaged positive/negative inference checks. |
| W06 onward | Pending | Continue the original plan with audio transactions, sandbox integrity, confidence semantics and the later research engine. |

W03 and W04 ship together because requiring revisions without updating the existing client would break saves. Desktop draft persistence uses a stable user-data file store instead of renderer IndexedDB, because the desktop backend's random port changes the browser origin on restart. Browser use retains IndexedDB.

The W03/W04 verification baseline is 108 passing unit tests and three gated native unit checks skipped, plus six repaired browser acceptance checks and four expected failures. The packaged Windows app confirms pending-save and text-draft recovery after the real close handshake and a new process launch. Full packaged acceptance remains unsuccessful because IPA still returns HTTP 503 from the unresolved external Transformers import. WAV attachment, sandbox grading/state and Unicode translation remain explicit defects. Test artifacts are local under ignored `test-results/`; commands and limitations are recorded in [testing.md](testing.md).

No installer release or main-branch merge is implied by these implementation commits. Performance at large profile sizes, broad crash/power-loss certification, automatic corrupt-draft salvage, audio archive garbage collection, and downstream scientific evaluation remain unfinished.

W05 verification supersedes the earlier packaged IPA failure: the current local unpacked executable returns nonempty ARPABET phones with the expected model hash, and the complete release probe passes. Removing the model from the isolated test artifact returns the specific missing-model code. Exact provisioning from the pinned installer and rejection of changed assets were exercised independently. There are 123 passing unit tests and three native unit skips. A separate Windows build/verification workflow is included; its first remote result is pending. The four browser defects described above remain open. Original quantization provenance is incomplete and recorded explicitly in the asset manifest rather than inferred.
