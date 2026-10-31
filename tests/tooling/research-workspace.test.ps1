#Requires -Version 7.2
[CmdletBinding()]
param([string]$WorkspaceRoot = 'E:\Xenolinguist')

$ErrorActionPreference = 'Stop'
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runner = Join-Path $repository 'scripts\research.ps1'
$shell = (Get-Process -Id $PID).Path
$validOutput = & $shell -NoProfile -File $runner -Action doctor -WorkspaceRoot $WorkspaceRoot
if ($LASTEXITCODE -ne 0) { throw 'Valid research workspace failed its doctor check.' }
$doctor = ($validOutput -join [Environment]::NewLine) | ConvertFrom-Json
foreach ($entry in $doctor.Paths.PSObject.Properties) {
    if (-not $entry.Value.StartsWith($doctor.Root + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Environment path escaped the workspace: $($entry.Name)"
    }
}

$fixture = Join-Path $doctor.Paths.TEMP ('research-guard-' + [guid]::NewGuid().ToString('N'))
$expectedPrefix = [IO.Path]::GetFullPath($doctor.Paths.TEMP).TrimEnd('\') + '\'
$source = Join-Path $fixture 'source'
$markerPath = Join-Path $fixture 'config\research-workspace.json'
$results = [Collections.Generic.List[object]]::new()
$results.Add(@{case='valid workspace and contained environment paths';passed=$true})

function Expect-Rejection {
    param([string]$Name, [string]$Script, [string]$Root, [string]$Pattern)
    $output = & $shell -NoProfile -File $Script -WorkspaceRoot $Root 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0 -or ($output | Out-String) -notmatch $Pattern) {
        throw "Expected rejection did not occur: $Name. Output: $output"
    }
    $results.Add(@{case=$Name;passed=$true})
}

try {
    Expect-Rejection 'missing drive directory does not create fallback' $runner $fixture 'workspace is missing'
    if (Test-Path -LiteralPath $fixture) { throw 'Missing workspace was silently created.' }
    foreach ($relative in @('config','source\scripts','source\research','source\.git','runtime\node\node_modules\npm\bin')) {
        New-Item -ItemType Directory -Path (Join-Path $fixture $relative) -Force | Out-Null
    }
    Copy-Item -LiteralPath (Join-Path $repository 'scripts\research-env.ps1') -Destination (Join-Path $source 'scripts\research-env.ps1')
    Copy-Item -LiteralPath (Join-Path $repository 'research\runtime-lock.json') -Destination (Join-Path $source 'research\runtime-lock.json')
    $envScript = Join-Path $source 'scripts\research-env.ps1'
    Expect-Rejection 'missing marker cannot initialize a replacement' $envScript $fixture 'marker is missing'

    $marker = Get-Content -LiteralPath (Join-Path $WorkspaceRoot 'config\research-workspace.json') -Raw | ConvertFrom-Json
    $marker.root = $fixture
    $marker.source = $source
    $marker.nodeDirectory = Join-Path $fixture 'runtime\node'
    $realVolumeId = $marker.volumeUniqueId
    $marker.volumeUniqueId = 'deliberately-wrong-volume'
    $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
    Expect-Rejection 'reused drive letter with wrong volume is refused' $envScript $fixture 'volume identity'

    $marker.volumeUniqueId = $realVolumeId
    $marker.minimumFreeGiB = 1000000
    $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
    Expect-Rejection 'insufficient disk headroom is refused' $envScript $fixture 'refusing new work'

    $marker.minimumFreeGiB = 20
    $marker.nodeDirectory = Join-Path $env:SystemDrive 'outside-research-runtime'
    $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
    Expect-Rejection 'runtime outside selected workspace is refused' $envScript $fixture 'outside the research workspace'

    $marker.nodeDirectory = Join-Path $fixture 'runtime\node'
    $marker | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding utf8
    Set-Content -LiteralPath (Join-Path $marker.nodeDirectory 'node.exe') -Value 'Invalid executable: must never run.'
    Set-Content -LiteralPath (Join-Path $marker.nodeDirectory 'node_modules\npm\bin\npm-cli.js') -Value '// Fixture only.'
    Expect-Rejection 'changed executable is rejected before execution' $envScript $fixture 'differs from the reviewed runtime lock'

    $results | ConvertTo-Json
} finally {
    # Delete only the unique fixture created by this test, using PowerShell end-to-end.
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    if (-not $resolvedFixture.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Refusing cleanup outside the expected research temporary directory.'
    }
    if (Test-Path -LiteralPath $resolvedFixture) {
        Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
}
