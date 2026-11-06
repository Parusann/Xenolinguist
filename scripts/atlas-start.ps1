#Requires -Version 7.2
param([switch]$DatabaseOnly)
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $AtlasWorkspace.Database 'PG_VERSION'))) { throw 'Run atlas-setup.ps1 first' }

& (Join-Path $AtlasWorkspace.Postgres 'pg_ctl.exe') -D $AtlasWorkspace.Database status *> $null
if ($LASTEXITCODE -ne 0) {
    if (Get-NetTCPConnection -State Listen -LocalPort 5438 -ErrorAction SilentlyContinue) { throw 'Atlas database port 5438 is occupied' }
    # File redirection prevents the background server from retaining a caller's PowerShell output pipe.
    $startOptions = @{
        FilePath = Join-Path $AtlasWorkspace.Postgres 'pg_ctl.exe'
        WindowStyle = 'Hidden'
        PassThru = $true
        ArgumentList = @('-D', ('"' + $AtlasWorkspace.Database + '"'), '-l', ('"' + (Join-Path $AtlasWorkspace.Log 'postgres.log') + '"'), '-w', '-t', '60', 'start')
        RedirectStandardOutput = Join-Path $AtlasWorkspace.Log 'pg-start.out.log'
        RedirectStandardError = Join-Path $AtlasWorkspace.Log 'pg-start.err.log'
    }
    $starter = Start-Process @startOptions
    if (-not $starter.WaitForExit(65000) -or $starter.ExitCode -ne 0) { throw 'Atlas database startup failed. Inspect its local startup log.' }
}
$values = Get-AtlasSecrets
try {
    Set-AtlasConnection -Secrets $values
    $actual = & (Join-Path $AtlasWorkspace.Postgres 'psql.exe') -X -At -v ON_ERROR_STOP=1 -c 'SHOW data_directory'
    if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($actual.Trim()) -ne $AtlasWorkspace.Database) { throw 'Connected database differs from the atlas cluster' }
    # Passwords are generated hexadecimal values. Only fixed role identifiers enter the bootstrap SQL.
    $commands = @()
    foreach ($role in @('atlas_app', 'atlas_auth', 'atlas_worker')) {
        if ($values[$role] -notmatch '^[a-f0-9]{64}$') { throw 'Invalid protected database credential' }
        $commands += 'DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ''{0}'') THEN CREATE ROLE {0} LOGIN PASSWORD ''{1}'' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;' -f $role, $values[$role]
    }
    $commands += 'DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ''atlas_owner'') THEN CREATE ROLE atlas_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;'
    ($commands -join [Environment]::NewLine) | & (Join-Path $AtlasWorkspace.Postgres 'psql.exe') -X -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE) { throw 'Database role bootstrap failed' }
    $exists = & (Join-Path $AtlasWorkspace.Postgres 'psql.exe') -X -At -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='xenolinguist_atlas'"
    if ($LASTEXITCODE) { throw 'Could not inspect atlas database' }
    if ($exists -ne '1') {
        Invoke-AtlasPostgres -Program createdb -Arguments @('-O', 'atlas_owner', 'xenolinguist_atlas')
    }
    $sql = @'
REVOKE ALL ON DATABASE xenolinguist_atlas FROM PUBLIC;
GRANT CONNECT ON DATABASE xenolinguist_atlas TO atlas_app, atlas_auth, atlas_worker;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS atlas AUTHORIZATION atlas_owner;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION atlas_auth;
ALTER ROLE atlas_auth IN DATABASE xenolinguist_atlas SET search_path = auth, pg_catalog;
ALTER ROLE atlas_app IN DATABASE xenolinguist_atlas SET search_path = atlas, pg_catalog;
ALTER ROLE atlas_worker IN DATABASE xenolinguist_atlas SET search_path = atlas, pg_catalog;
'@
    $env:PGDATABASE = 'xenolinguist_atlas'
    $sql | & (Join-Path $AtlasWorkspace.Postgres 'psql.exe') -X -q -v ON_ERROR_STOP=1
    if ($LASTEXITCODE) { throw 'Atlas schemas failed to initialize' }
    if ($DatabaseOnly) { Write-Output 'Atlas PostgreSQL is ready on 127.0.0.1:5438'; return }
    throw 'The atlas application entry point is pending. Use -DatabaseOnly for the runtime milestone.'
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
