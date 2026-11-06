#Requires -Version 7.2
param([switch]$BuildOnly)
. (Join-Path $PSScriptRoot 'research-env.ps1')
$desktopData = Assert-ResearchPath (Join-Path $ResearchWorkspace.Root 'data/desktop')
New-Item -ItemType Directory -Path $desktopData -Force | Out-Null
$desktopSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls.exe $desktopData /inheritance:r /grant:r ("*" + $desktopSid + ':(OI)(CI)F') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict research desktop data permissions' }
Push-Location $ResearchWorkspace.Source
try {
    & $ResearchWorkspace.Node $ResearchWorkspace.Npm run build:desktop
    if ($LASTEXITCODE -ne 0) { throw 'Research workbench build failed' }
    if ($BuildOnly) { return }
    $electron = Assert-ResearchPath (Join-Path $ResearchWorkspace.Source 'node_modules/electron/dist/electron.exe')
    if (-not (Test-Path -LiteralPath $electron)) { throw 'The research Electron runtime has not been downloaded to this HDD.' }
    Start-Process -FilePath $electron -WindowStyle Hidden -WorkingDirectory $ResearchWorkspace.Source -ArgumentList @(
        ('"' + (Join-Path $ResearchWorkspace.Source 'electron/dist/main.cjs') + '"'), '--research-workbench'
    )
} finally { Pop-Location }
