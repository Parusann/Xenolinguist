#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$recoverySecrets = Get-AtlasSecrets
Set-AtlasNodeEnvironment -Secrets $recoverySecrets -Admin
$env:RESTIC_PASSWORD = $recoverySecrets.restic_password
New-Item -ItemType Directory -Path $AtlasWorkspace.Backup -Force | Out-Null
$recoverySid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls.exe $AtlasWorkspace.Backup /inheritance:r /grant:r ("*" + $recoverySid + ':(OI)(CI)F') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict recovery staging permissions' }
Push-Location $ResearchWorkspace.Source
try {
    & $ResearchWorkspace.Node --import tsx cloud/src/backup-cli.ts create
    if ($LASTEXITCODE -ne 0) { throw 'Atlas backup or complete restore verification failed' }
} finally { Remove-Item Env:RESTIC_PASSWORD, Env:ATLAS_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue; Pop-Location }
