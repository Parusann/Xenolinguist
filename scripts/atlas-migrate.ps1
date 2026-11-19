#Requires -Version 7.2
param([switch]$GenerateAuth)
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$ErrorActionPreference = 'Stop'
Set-AtlasNodeEnvironment -Secrets (Get-AtlasSecrets) -Admin
Push-Location $ResearchWorkspace.Source
try {
    if ($GenerateAuth) {
        & $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs cloud/src/migrate.ts --generate-auth
        if ($LASTEXITCODE) { throw 'Authentication migration generation failed' }
    }
    & $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs cloud/src/migrate.ts
    if ($LASTEXITCODE) { throw 'Atlas migrations failed' }
} finally {
    Remove-Item Env:ATLAS_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
    Pop-Location
}
