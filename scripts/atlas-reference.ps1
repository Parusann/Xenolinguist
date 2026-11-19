#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$ErrorActionPreference = 'Stop'
Set-AtlasNodeEnvironment -Secrets (Get-AtlasSecrets) -Admin
Push-Location $ResearchWorkspace.Source
try {
    & $ResearchWorkspace.Node --import tsx cloud/src/reference-cli.ts
    if ($LASTEXITCODE) { throw 'Reference ingestion failed' }
} finally {
    Remove-Item Env:ATLAS_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
    Pop-Location
}
