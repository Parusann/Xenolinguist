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

An initial launcher test exposed inherited native output handles keeping a caller waiting after startup. Starting `pg_ctl` with explicit file redirection fixed the return path. The verified restart returned in 1,396 ms, and the inserted test record survived shutdown and restart. Eight 4 KiB files passed write, flush, cached read and byte-integrity checks. Flushed writes ranged from 159.69 to 240.29 ms while model conversion/import work used the same HDD. The reads used warm cache. [Measured runtime verification](verification/l1-atlas-runtime.json)

Application schemas use a separate owner role. Authentication tables live in `auth`, while dataset and job tables live in `atlas`. Tenant context is transaction-scoped, and protected tables force row-level security. The first application migration is generated from the pinned authentication library and retained as SQL. Applied migration hashes normalize line endings and reject changed migrations. [Migration code](../cloud/src/migrate.ts) · [PostgreSQL transaction guidance](https://node-postgres.com/features/transactions)

The current backup location is on the research drive. An independent recovery copy must be established before storing irreplaceable submissions. The database and storage tests use reproducible data.
