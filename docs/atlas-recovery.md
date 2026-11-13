# HDD recovery and performance

The initial Atlas stores reproducible test data on the prepared research HDD. Required hosting, API and GPU subscriptions remain $0. Electricity and future storage purchases are unmeasured. PostgreSQL, object storage, binaries, caches, temporary recovery files and the encrypted repository all use that drive.

## Create and verify a snapshot

~~~powershell
pwsh -NoProfile -File scripts/atlas-backup.ps1
pwsh -NoProfile -File scripts/atlas-restore-check.ps1
pwsh -NoProfile -File scripts/atlas-doctor.ps1
~~~

The first command creates an encrypted restic snapshot and immediately verifies a complete restore. The second verifies the latest snapshot again. An exact 64-character snapshot ID can be supplied with `-Snapshot`. Both restore into a generated temporary database. They preserve the live database and objects.

Latest selection compares validated timestamps across all Atlas-tagged snapshots. Each backup uses a distinct staging path, so restic's per-host/per-path `--latest 1` result is not a single global latest snapshot. A two-snapshot regression verifies selection and restores the newer snapshot.

The setup script pins PostgreSQL 17.11 and restic 0.19.1, verifies the download checksums and restricts data, configuration, staging and cache directories to the current Windows account. DPAPI protects the repository password in the private configuration. Child processes receive required credentials through their environment. Credentials are excluded from command arguments and result records.

## Keep rows and files consistent

1. Acquire the exclusive object-publication lock before opening the database snapshot. This order matters. A snapshot opened while waiting for garbage collection could retain a row whose file was already deleted.
2. Open a repeatable-read transaction and export its PostgreSQL snapshot. `pg_dump` uses that exact snapshot. Object metadata and table fingerprints are read within it.
3. Verify each referenced original file and copy it to private staging. Upload publication and physical cleanup wait on the publication lock. Ordinary database reads can continue.
4. Seal a manifest containing database-dump SHA-256, object identities, byte counts and deterministic per-table fingerprints. Close the snapshot and release the publication lock.
5. Encrypt the sealed staging directory into restic. Retire staging only after restic returns an identifiable snapshot.
6. Read-check the repository and restore the selected subtree to a new HDD directory. Verify every file and the exact object inventory.
7. Restore the dump into a fresh database with the limited roles, database access rules and schema search paths. Verify all table fingerprints, forced RLS, owner scopes and up to ten complete saved comparison reports by deterministic replay.
8. Record a successful restore only after all checks pass. A failed attempt retains the previous successful snapshot identity and verification date.

Backups reserve 20 GiB plus their estimated staging needs before copying. The database dump is hashed as a stream. Files remain bounded to 5 MiB. Recovery paths reject links and escapes from the configured HDD. Temporary-database deletion checks its generated namespace. [PostgreSQL snapshots](https://www.postgresql.org/docs/17/app-pgdump.html) · [restic restore behavior](https://restic.readthedocs.io/en/stable/050_restore.html) · [Implementation](../cloud/src/backup.ts)

## Actual recovery results

The [recovery verification](verification/l9-atlas-recovery-performance.json) created two signed accounts, two private datasets and a completed report. It recovered nineteen tables and two raw objects. Both passwords signed in to the recovered service. Original bytes and the report matched, cross-account resources returned unavailable, every table fingerprint matched and the saved comparison replayed.

The test also rejected an incorrect repository password, blocked a changed primary byte from entering a new snapshot and exercised upload rollback under injected zero free space and a missing storage path. Zero free space was a controlled fault injection. The drive was not physically filled, unplugged or powered off.

The [normal backup command](verification/l9-atlas-primary-backup.json) separately restored the primary database, which intentionally contained no personal accounts or submissions. It recovered nineteen tables. A [second verification](verification/l9-atlas-primary-restore.json) restored that same encrypted snapshot again. Those empty-primary checks complement the populated two-account test.

A new database in the current cluster and Windows account is the verified recovery boundary. A different PC or lost drive also needs an independent snapshot copy, a recoverable repository password and PostgreSQL role provisioning. A same-drive snapshot cannot survive loss of that drive. Add the independent copy and preserve its recovery key before storing irreplaceable submissions. The later D: storage decision remains open. No second drive was used during these tests.

Deleting a dataset removes live access and queues its live objects for cleanup. Earlier encrypted snapshots retain their historical contents, including deleted evidence. This beta does not expire snapshots automatically. Define and test a retention/pruning policy, deletion handling after restore and portable key recovery before accepting other people's irreplaceable data. No snapshot was pruned during acceptance.

## Measured local performance

| Workload | Samples | p50 | p95 |
| --- | ---: | ---: | ---: |
| Warm authenticated dataset list/detail | 100, after 10 warmups | 1.50 ms | 1.97 ms |
| Queued comparison, 5,000 rows | 10 | 1.11 s | 1.23 s |
| Computation within those reports | 10 | 73.66 ms | 75.80 ms |

The bounded workload used 96-grapheme forms, eight anchored concepts and six reference languages. End-to-end timing includes queue scheduling and 100 ms polling resolution. Both initial targets passed: cached metadata below 500 ms p95 and the declared comparison below 60 seconds. The verifier's maximum resident set was 507,568 KiB, including its API and client code. PostgreSQL and restic child processes are excluded.

The [normal stop/start measurement](verification/l9-atlas-launcher.json) took 16.59 seconds, including graceful stop, database startup, migration, source verification and the production build. Filesystem caches were not flushed. These measurements use one Ryzen 9 7900 Windows host with 24 logical CPUs and approximately 31.14 GiB available system memory. They are local development measurements, with small job samples, rather than a multi-user service guarantee or a physical cold-disk benchmark.

The November 12 review [reran the populated recovery and workload](verification/l9-review-recovery.json), including the two-snapshot latest-selection regression. All eight phases passed. Warm metadata p95 was 5.56 ms and the same declared job p95 was 1.35 seconds. Both remain below the initial targets; the earlier table is retained as its original run, not substituted for the new measurement.

The first unrestricted full regression run produced eight archive/experiment timeouts during competing HDD access. Workspace-specific test concurrency is now one worker, while the original test deadlines remain intact. Normal CI retains its existing worker policy. This avoids treating a heavily parallel test harness as a product correctness failure.
