# Local atlas runtime

The atlas uses the configured research HDD for its binaries, database, objects, temporary files, caches and recovery snapshots. The initial service binds to `127.0.0.1:5438`. PostgreSQL 17.11 and restic 0.19.1 are pinned by download checksums. Required hosting subscriptions remain $0 per month. [Runtime lock](../research/atlas-runtime-lock.json) · [PostgreSQL binary provider](https://www.enterprisedb.com/download-postgresql-binaries) · [restic release](https://github.com/restic/restic/releases/tag/v0.19.1)

The database initialized with page checksums, SCRAM authentication, fsync, full-page writes and synchronous commits. Application, authentication and worker roles have separate generated credentials and lack superuser, database-creation and RLS-bypass privileges. An administrative credential is used by local setup and migration scripts. Windows DPAPI protects the configuration values for the current Windows account, and the configuration directory has a restricted ACL.

Run these commands from the configured research checkout in PowerShell 7.2 or newer.

~~~powershell
pwsh -NoProfile -File scripts/atlas-setup.ps1
pwsh -NoProfile -File scripts/atlas-doctor.ps1
pwsh -NoProfile -File scripts/atlas-start.ps1 -DatabaseOnly
pwsh -NoProfile -File scripts/atlas-stop.ps1
~~~

Setup downloads the pinned archives to the research cache, verifies their SHA-256 values and initializes the atlas cluster. Its PostgreSQL extraction selects the database runtime and required licenses. Repeated setup preserves an existing database. An incomplete extraction or initialization requires inspection. The start script rejects an occupied database port and verifies the connected cluster's actual data directory.

Launcher testing exposed inherited native output handles keeping a caller waiting after startup. Services now start in separate hidden hosts, and readiness is checked against the expected child process. Graceful stop waits for the API process to finish before stopping PostgreSQL. The database-only warm restart returned in 1,396 ms, and the inserted test record survived shutdown and restart. Eight 4 KiB files passed write, flush, cached read and byte-integrity checks. Flushed writes ranged from 159.69 to 240.29 ms during simultaneous model work. The reads used warm cache. [Runtime verification](verification/l1-atlas-runtime.json) · [Separate-process launcher verification](verification/l2-atlas-launcher.json)

Application schemas use a separate owner role. Authentication tables live in `auth`, while dataset and job tables live in `atlas`. Tenant context is transaction-scoped, and protected tables force row-level security. The first application migration is generated from the pinned authentication library and retained as SQL. Applied migration hashes normalize line endings and reject changed migrations. [Migration code](../cloud/src/migrate.ts) · [PostgreSQL transaction guidance](https://node-postgres.com/features/transactions)

The current backup location is on the research drive. An independent recovery copy must be established before storing irreplaceable submissions. The database and storage tests use reproducible data.

## Accounts and versioned evidence

The API uses Better Auth 1.7.18 with PostgreSQL-backed accounts and sessions. It derives dataset ownership from the verified session. Dataset tables force row-level security under a separate owner role. Transaction-local tenant context is cleared on commit or rollback before a pooled connection is reused.

CSV and JSON wordlists accept `id`, `form`, optional `meaning`, optional space-separated `transcription` and optional `annotations`. Plain text creates one sample per nonblank line. Original bytes remain downloadable by the owner, while normalized forms preserve their original spelling in a separate field. Each upload has an immutable version, source/rights declaration, checksum and retry key.

Initial bounds are 5 MiB per file, 5,000 records per file, 10 datasets per account, 20 versions per dataset and 256 MiB of objects per account. Input validation rejects duplicate identifiers, unknown fields and invalid paths. Concurrent requests with the same retry key publish one version. Reusing that key for different content returns a conflict.

The HTTP verification creates a fresh disposable database, applies migrations, creates two signed accounts and exercises upload, download, tampering, logout, deletion and tenant isolation. All 15 checks passed. Verification removes its disposable database and object directory after checking their generated names and workspace location. [Verification evidence](verification/l2-l3-atlas-foundation.json) · [Verification implementation](../cloud/src/verify.ts)

~~~powershell
pwsh -NoProfile -File scripts/atlas-start.ps1
# The API is available at http://127.0.0.1:4318.
pwsh -NoProfile -File scripts/atlas-stop.ps1
~~~

The browser interface and comparison worker are added in subsequent implementation units.
