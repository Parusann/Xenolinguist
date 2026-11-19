#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
Push-Location $ResearchWorkspace.Source
try {
    & $ResearchWorkspace.Node $ResearchWorkspace.Npm run build -w cloud
    if ($LASTEXITCODE -ne 0) { throw 'Atlas build failed' }
} finally { Pop-Location }
