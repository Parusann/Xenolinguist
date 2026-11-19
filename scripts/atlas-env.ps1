#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'research-env.ps1')

$atlasPaths = [ordered]@{}
foreach ($entry in @{
    Data = 'data/atlas'
    Database = 'data/atlas/postgres'
    Objects = 'data/atlas/objects'
    Config = 'config/atlas'
    Postgres = 'runtime/postgres/pgsql/bin'
    Restic = 'runtime/restic/restic.exe'
    Log = 'logs/atlas'
    Backup = 'data/atlas-backups'
    Cache = 'cache/restic'
}.GetEnumerator()) {
    $atlasPaths[$entry.Key] = Assert-ResearchPath (Join-Path $ResearchWorkspace.Root $entry.Value)
}
$AtlasWorkspace = [pscustomobject]$atlasPaths
$atlasLock = Get-Content (Join-Path $ResearchWorkspace.Source 'research/atlas-runtime-lock.json') -Raw | ConvertFrom-Json

function Invoke-AtlasPostgres {
    param([string]$Program, [string[]]$Arguments)
    $executable = Assert-ResearchPath (Join-Path $AtlasWorkspace.Postgres ($Program + '.exe'))
    & $executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL $Program failed with exit code $LASTEXITCODE" }
}

function Get-AtlasSecrets {
    $file = Join-Path $AtlasWorkspace.Config 'secrets.clixml'
    $protected = Import-Clixml -LiteralPath $file
    $values = @{}
    foreach ($key in $protected.Keys) {
        $values[$key] = [pscredential]::new('atlas', $protected[$key]).GetNetworkCredential().Password
    }
    return $values
}

function Set-AtlasConnection {
    param([hashtable]$Secrets, [string]$User = 'atlas_admin', [string]$Database = 'postgres')
    $env:PGHOST = '127.0.0.1'
    $env:PGPORT = '5438'
    $env:PGUSER = $User
    $env:PGDATABASE = $Database
    $env:PGPASSWORD = $Secrets[$User]
    $env:PGCONNECT_TIMEOUT = '5'
    $env:PGCLIENTENCODING = 'UTF8'
}

function Set-AtlasNodeEnvironment {
    param([hashtable]$Secrets, [switch]$Admin)
    foreach ($entry in @{ ATLAS_DATABASE_URL = 'atlas_app'; ATLAS_AUTH_DATABASE_URL = 'atlas_auth'; ATLAS_WORKER_DATABASE_URL = 'atlas_worker' }.GetEnumerator()) {
        $value = 'postgresql://' + $entry.Value + ':' + [Uri]::EscapeDataString($Secrets[$entry.Value]) + '@127.0.0.1:5438/xenolinguist_atlas'
        [Environment]::SetEnvironmentVariable($entry.Key, $value, 'Process')
    }
    if ($Admin) {
        $env:ATLAS_ADMIN_DATABASE_URL = 'postgresql://atlas_admin:' + [Uri]::EscapeDataString($Secrets.atlas_admin) + '@127.0.0.1:5438/xenolinguist_atlas'
    }
    $env:ATLAS_AUTH_SECRET = $Secrets.auth_secret
    $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secrets.auth_secret))
    try {
        $env:ATLAS_CONTROL_TOKEN = [Convert]::ToHexString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes('xeno-atlas-local-control-1'))).ToLowerInvariant()
    } finally { $hmac.Dispose() }
    $env:NODE_ENV = 'production'
}
