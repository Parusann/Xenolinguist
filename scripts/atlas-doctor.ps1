#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$report = [ordered]@{
    checkedAt = (Get-Date).ToUniversalTime().ToString('o')
    freeGiB = $ResearchWorkspace.FreeGiB
    paths = $AtlasWorkspace
    postgresInstalled = Test-Path -LiteralPath (Join-Path $AtlasWorkspace.Postgres 'postgres.exe')
    databaseInitialized = Test-Path -LiteralPath (Join-Path $AtlasWorkspace.Database 'PG_VERSION')
    resticInstalled = Test-Path -LiteralPath $AtlasWorkspace.Restic
    independentBackupConfigured = $false
    databaseEndpoint = '127.0.0.1:5438'
    applicationEndpoint = 'http://127.0.0.1:4318'
}
if ($report.postgresInstalled) {
    $report.postgresVersion = (& (Join-Path $AtlasWorkspace.Postgres 'postgres.exe') --version)
}
if ($report.databaseInitialized) {
    & (Join-Path $AtlasWorkspace.Postgres 'pg_ctl.exe') -D $AtlasWorkspace.Database status *> $null
    $report.databaseRunning = $LASTEXITCODE -eq 0
}
$backupStatusFile = Join-Path $AtlasWorkspace.Config 'backup-status.json'
if (Test-Path -LiteralPath $backupStatusFile) {
    $backupRecord = Get-Content -LiteralPath $backupStatusFile -Raw | ConvertFrom-Json
    if ($backupRecord.version -eq 'atlas-backup-status-1' -and $backupRecord.sourceDatabase -eq 'xenolinguist_atlas') {
        $report.lastVerifiedRestoreAt = $backupRecord.lastVerifiedAt
        $report.lastRecoveryAttemptSucceeded = $backupRecord.lastAttemptSucceeded
    }
}
$report | ConvertTo-Json -Depth 4
