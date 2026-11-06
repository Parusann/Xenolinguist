#Requires -Version 7.2
param([switch]$DatabaseOnly)
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $AtlasWorkspace.Database 'PG_VERSION'))) { throw 'Run atlas-setup.ps1 first' }

& (Join-Path $AtlasWorkspace.Postgres 'pg_ctl.exe') -D $AtlasWorkspace.Database status *> $null
if ($LASTEXITCODE -ne 0) {
    if (Get-NetTCPConnection -State Listen -LocalPort 5438 -ErrorAction SilentlyContinue) { throw 'Atlas database port 5438 is occupied' }
    # A separate hidden console isolates the background server from the caller's output pipes.
    $startOptions = @{
        FilePath = Join-Path $AtlasWorkspace.Postgres 'pg_ctl.exe'
        WindowStyle = 'Hidden'
        PassThru = $true
        ArgumentList = @('-D', ('"' + $AtlasWorkspace.Database + '"'), '-l', ('"' + (Join-Path $AtlasWorkspace.Log 'postgres.log') + '"'), '-w', '-t', '60', 'start')
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
    $endpoint = 'http://127.0.0.1:4318'
    if (Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue) {
        $existing = Invoke-RestMethod ($endpoint + '/health') -TimeoutSec 5
        if ($existing.service -ne 'xenolinguist-atlas' -or -not $existing.ready) { throw 'Atlas application port is occupied' }
        Write-Output $endpoint
        return
    }
    & (Join-Path $PSScriptRoot 'atlas-migrate.ps1')
    Set-AtlasNodeEnvironment -Secrets $values
    Remove-Item Env:ATLAS_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
    $startApi = @{
        FilePath = (Get-Process -Id $PID).Path
        WindowStyle = 'Hidden'
        PassThru = $true
        WorkingDirectory = $ResearchWorkspace.Source
        ArgumentList = @('-NoProfile', '-File', ('"' + (Join-Path $PSScriptRoot 'atlas-host.ps1') + '"'))
    }
    $api = Start-Process @startApi
    $deadline = (Get-Date).AddSeconds(60)
    do {
        try {
            $health = Invoke-RestMethod ($endpoint + '/health') -TimeoutSec 2
            if ($health.ready -and $health.service -eq 'xenolinguist-atlas') {
                $actual = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$health.pid)
                if ($actual.ParentProcessId -ne $api.Id) { throw 'Application readiness came from another process' }
                @{ pid = $health.pid; hostPid = $api.Id; endpoint = $endpoint; startedAt = (Get-Date).ToUniversalTime().ToString('o') } |
                    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $AtlasWorkspace.Config 'runtime.json') -Encoding utf8
                Write-Output $endpoint
                return
            }
        } catch {}
        if ($api.HasExited) { throw 'Atlas application exited. Inspect its local error log.' }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw 'Atlas application did not become ready within 60 seconds.'
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
