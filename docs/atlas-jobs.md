# Durable Atlas comparisons

The local service owns one PostgreSQL-backed comparison queue. Requests use owner-scoped retry keys. An account may retain 1,000 jobs and have at most 100 queued or running jobs. Completed reports are bounded to 4 MiB. Deleting a dataset removes its job history.

The worker uses a session advisory lock for leadership and an atomic `FOR UPDATE SKIP LOCKED` claim. Each attempt gets a new UUID token and a 90-second lease. A heartbeat renews an unexpired running lease every ten seconds. Expired work can be reclaimed, with a maximum of three attempts. Ordinary computation errors become explicit terminal failures. A service interruption leaves the leased record recoverable after expiry.

Computation runs in a separate thread with a 256 MiB old-generation heap limit and a 60-second external deadline. The alignment engine also enforces its own cell and unit limits. The application remains responsive while the comparison runs. A timeout terminates the compute thread. These heap limits are not a claim about total process or operating-system memory.

Before publication the worker rechecks ownership, the current immutable version, raw-object integrity and reference digests. Its final write requires the same live token and running status. Cancelling a queued or running job clears the token. Deleting the input cascades to its jobs. A stale or cancelled attempt cannot overwrite another attempt or disclose a report. Comparisons currently use the submitting owner's data and licensed public references. Cross-account sharing remains a later release.

Uploads and physical object deletion hold a shared publication lock. Backups and orphan scans can take its exclusive counterpart. Deferred cleanup removes deleted files before retiring their database metadata, making a retry safe after uncertain commits. Old partial or unreferenced files get a minimum one-hour grace period. An exclusive scan cannot mistake an uncommitted upload for an orphan. Recent files and referenced objects are retained.

The [PostgreSQL and HTTP verification](verification/l6-atlas-jobs.json) uses a fresh disposable database and reproducible files on the configured HDD. It checks account isolation, idempotent submission, competing claims, expiry recovery, stale-token rejection, external timeout, cancellation, deleted input, attempt exhaustion, blocked orphan scans and repeated physical cleanup. Lease expiry is advanced in the disposable database to simulate an interrupted claim. It does not claim to have measured a 90-second wait or a physical power failure.

The signed-in status endpoint reports worker availability, current activity, its last error code and pending physical deletions. Errors do not include uploaded content or connection credentials. An unavailable worker leaves jobs durable for the next successful startup.
