#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$ErrorActionPreference = 'Stop'
$listener = Get-NetTCPConnection -State Listen -LocalPort 4318 -ErrorAction SilentlyContinue
if ($listener) {
    $stateFile = Join-Path $AtlasWorkspace.Config 'runtime.json'
    if (-not (Test-Path -LiteralPath $stateFile)) { throw 'An application owns port 4318 without an atlas runtime record' }
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($listener.OwningProcess -notcontains $state.pid) { throw 'The atlas application process differs from its runtime record' }
    Set-AtlasNodeEnvironment -Secrets (Get-AtlasSecrets)
    $headers = @{ Authorization = 'Bearer ' + $env:ATLAS_CONTROL_TOKEN; Origin = 'http://127.0.0.1:4318' }
    $null = Invoke-RestMethod 'http://127.0.0.1:4318/internal/shutdown' -Method Post -Headers $headers -TimeoutSec 5
    $deadline = (Get-Date).AddSeconds(30)
    while (Get-Process -Id $state.pid -ErrorAction SilentlyContinue) {
        if ((Get-Date) -gt $deadline) { throw 'Atlas is still draining. Database shutdown was deferred.' }
        Start-Sleep -Milliseconds 250
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $AtlasWorkspace.Database 'PG_VERSION'))) { return }
& (Join-Path $AtlasWorkspace.Postgres 'pg_ctl.exe') -D $AtlasWorkspace.Database status *> $null
if ($LASTEXITCODE -eq 0) {
    Invoke-AtlasPostgres -Program pg_ctl -Arguments @('-D', $AtlasWorkspace.Database, '-w', '-t', '60', '-m', 'fast', 'stop')
}
