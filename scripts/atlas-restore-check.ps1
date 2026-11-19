#Requires -Version 7.2
param([ValidatePattern('^(latest|[a-f0-9]{64})$')][string]$Snapshot = 'latest')
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$recoverySecrets = Get-AtlasSecrets
Set-AtlasNodeEnvironment -Secrets $recoverySecrets -Admin
$env:RESTIC_PASSWORD = $recoverySecrets.restic_password
Push-Location $ResearchWorkspace.Source
try {
    & $ResearchWorkspace.Node --import tsx cloud/src/backup-cli.ts verify $Snapshot
    if ($LASTEXITCODE -ne 0) { throw 'Atlas restore verification failed' }
} finally { Remove-Item Env:RESTIC_PASSWORD, Env:ATLAS_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue; Pop-Location }
