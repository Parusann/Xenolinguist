#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
Set-AtlasNodeEnvironment -Secrets (Get-AtlasSecrets)
Remove-Item Env:ATLAS_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
Push-Location $ResearchWorkspace.Source
try {
    & $ResearchWorkspace.Node --max-old-space-size=512 cloud/dist/main.mjs 1> (Join-Path $AtlasWorkspace.Log 'api.out.log') 2> (Join-Path $AtlasWorkspace.Log 'api.err.log')
    exit $LASTEXITCODE
} finally { Pop-Location }
