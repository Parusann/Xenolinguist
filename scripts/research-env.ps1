#Requires -Version 7.2
[CmdletBinding()]
param(
    [string]$WorkspaceRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$researchRoot = [IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd('\')
if (-not (Test-Path -LiteralPath $researchRoot -PathType Container)) {
    throw 'Research workspace is missing. No fallback directory will be created.'
}

function Assert-ResearchPath {
    param([Parameter(Mandatory)][string]$Path)
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -ne $researchRoot -and
        -not $full.StartsWith($researchRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the research workspace: $full"
    }
    # A cache or runtime junction must not redirect project writes to another disk.
    $cursor = $full
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Research path contains a link or junction: $cursor"
            }
        }
        $parent = Split-Path $cursor -Parent
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $full
}

$null = Assert-ResearchPath $researchRoot
$markerPath = Assert-ResearchPath (Join-Path $researchRoot 'config\research-workspace.json')
if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    throw 'Research workspace marker is missing; refusing to initialize an empty replacement.'
}
$marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
if ($marker.schemaVersion -ne 1 -or $marker.project -ne 'xenolinguist-research' -or
    [IO.Path]::GetFullPath($marker.root).TrimEnd('\') -ne $researchRoot) {
    throw 'Research workspace marker does not match the requested root.'
}
$driveRoot = [IO.Path]::GetPathRoot($researchRoot)
if ($driveRoot.TrimEnd('\') -eq $env:SystemDrive -or $driveRoot -notmatch '^[A-Za-z]:\\$') {
    throw 'Research storage must use a dedicated local drive outside the Windows system drive.'
}
$volume = Get-Volume -DriveLetter $driveRoot[0]
if ($volume.UniqueId -ne $marker.volumeUniqueId -or $volume.FileSystem -ne 'NTFS' -or
    $volume.HealthStatus -ne 'Healthy') {
    throw 'Research volume identity, filesystem or reported health does not match the workspace.'
}
$minimumFreeGiB = [Math]::Max(20, [double]$marker.minimumFreeGiB)
if ($volume.SizeRemaining -lt $minimumFreeGiB * 1GB) {
    throw "Research drive has less than $minimumFreeGiB GiB free; refusing new work."
}

$sourceRoot = Assert-ResearchPath $marker.source
$actualSource = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
if ($sourceRoot -ne $actualSource -or
    -not (Test-Path -LiteralPath (Join-Path $sourceRoot '.git') -PathType Container)) {
    throw 'Run from the dedicated research checkout with its own Git directory.'
}
$null = Assert-ResearchPath (Join-Path $sourceRoot '.git')
if (Test-Path -LiteralPath (Join-Path $sourceRoot '.git\objects\info\alternates')) {
    throw 'The research checkout must not depend on another checkout object store.'
}

$runtimeRoot = Assert-ResearchPath $marker.nodeDirectory
$nodePath = Assert-ResearchPath (Join-Path $runtimeRoot 'node.exe')
$npmPath = Assert-ResearchPath (Join-Path $runtimeRoot 'node_modules\npm\bin\npm-cli.js')
$runtimeLock = Get-Content -LiteralPath (Join-Path $sourceRoot 'research\runtime-lock.json') -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $npmPath -PathType Leaf) -or
    (Get-FileHash -LiteralPath $nodePath -Algorithm SHA256).Hash -ne $runtimeLock.executableSha256) {
    throw 'Portable Node runtime is missing or differs from the reviewed runtime lock.'
}
$nodeVersion = & $nodePath --version
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne $runtimeLock.nodeVersion) {
    throw 'Portable Node runtime version does not match the runtime lock.'
}

$relativePaths = [ordered]@{
    TEMP = 'temp'
    TMP = 'temp'
    TMPDIR = 'temp'
    npm_config_cache = 'cache\npm'
    npm_config_prefix = 'runtime\npm-global'
    XDG_CACHE_HOME = 'cache\xdg'
    HF_HOME = 'cache\huggingface'
    HF_HUB_CACHE = 'cache\huggingface\hub'
    TORCH_HOME = 'cache\torch'
    PIP_CACHE_DIR = 'cache\pip'
    UV_CACHE_DIR = 'cache\uv'
    OLLAMA_MODELS = 'data\models'
    ELECTRON_CACHE = 'cache\electron'
    ELECTRON_BUILDER_CACHE = 'cache\electron-builder'
    PLAYWRIGHT_BROWSERS_PATH = 'cache\playwright'
    XENO_RESEARCH_RESULTS = 'data\research'
}
# Validate every destination before creating any directory or changing the environment.
$researchPaths = [ordered]@{}
foreach ($entry in $relativePaths.GetEnumerator()) {
    $researchPaths[$entry.Key] = Assert-ResearchPath (Join-Path $researchRoot $entry.Value)
}
$userConfigPath = Assert-ResearchPath (Join-Path $researchRoot 'config\research.npmrc')
foreach ($entry in $researchPaths.GetEnumerator()) {
    New-Item -ItemType Directory -Path $entry.Value -Force | Out-Null
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
}
if (-not (Test-Path -LiteralPath $userConfigPath)) {
    Set-Content -LiteralPath $userConfigPath -Value '# Project-local npm configuration.' -Encoding utf8
}
$env:npm_config_userconfig = $userConfigPath
$env:PATH = $runtimeRoot + ';' + $env:PATH
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
$env:XENO_RESEARCH_ROOT = $researchRoot

$ResearchWorkspace = [pscustomobject]@{
    Root = $researchRoot
    Source = $sourceRoot
    Node = $nodePath
    Npm = $npmPath
    NodeVersion = $nodeVersion
    FreeGiB = [Math]::Round($volume.SizeRemaining / 1GB, 2)
    BelowPreferredHeadroom = $volume.SizeRemaining -lt 30GB
    Paths = $researchPaths
}
