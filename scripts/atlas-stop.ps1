#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $AtlasWorkspace.Database 'PG_VERSION'))) { return }
& (Join-Path $AtlasWorkspace.Postgres 'pg_ctl.exe') -D $AtlasWorkspace.Database status *> $null
if ($LASTEXITCODE -eq 0) {
    Invoke-AtlasPostgres -Program pg_ctl -Arguments @('-D', $AtlasWorkspace.Database, '-w', '-t', '60', '-m', 'fast', 'stop')
}
