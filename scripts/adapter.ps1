#Requires -Version 7.2
param([ValidateSet('setup', 'pilot', 'candidate')][string]$Action = 'pilot')
. (Join-Path $PSScriptRoot 'research-env.ps1')

$adapterRoot = Join-Path $ResearchWorkspace.Source 'research/adapter'
$trainingRoot = Assert-ResearchPath (Join-Path $ResearchWorkspace.Root 'data/training')
$environmentPath = Assert-ResearchPath (Join-Path $ResearchWorkspace.Root 'runtime/training-cpu')
$python = Assert-ResearchPath (Join-Path $environmentPath 'Scripts/python.exe')
$env:UV_PYTHON_INSTALL_DIR = Assert-ResearchPath (Join-Path $ResearchWorkspace.Root 'runtime/python')
$env:UV_NO_CONFIG = '1'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:HF_HUB_DISABLE_PROGRESS_BARS = '1'
$env:TOKENIZERS_PARALLELISM = 'false'
$env:HF_HUB_OFFLINE = '1'

function Confirm-Exit([string]$operation) {
    if ($LASTEXITCODE -ne 0) { throw "$operation failed with exit code $LASTEXITCODE" }
}

if ($Action -eq 'setup') {
    $lock = Get-Content (Join-Path $adapterRoot 'base-lock.json') -Raw | ConvertFrom-Json
    $baseDirectory = Assert-ResearchPath (Join-Path $trainingRoot "base/$($lock.sha)")
    if ($ResearchWorkspace.FreeGiB -lt 30) { throw 'Setup requires at least 30 GiB free on the research drive' }
    uv python install 3.12.13 --no-bin --no-registry
    Confirm-Exit 'Python installation'
    $managed = Assert-ResearchPath (uv python find --managed-python --no-project 3.12.13)
    if (-not (Test-Path -LiteralPath $python)) {
        uv venv $environmentPath --python $managed --no-project
        Confirm-Exit 'Virtual environment creation'
    }
    uv pip install --python $python --only-binary ':all:' --default-index https://pypi.org/simple -r (Join-Path $adapterRoot 'requirements-windows-cpu.txt')
    Confirm-Exit 'Pinned CPU dependencies'
    New-Item -ItemType Directory -Path $baseDirectory -Force | Out-Null
    foreach ($file in $lock.files) {
        $target = Assert-ResearchPath (Join-Path $baseDirectory $file.rfilename)
        if (Test-Path -LiteralPath $target) { continue } # The pilot verifies every file before loading it.
        $staging = $target + '.' + [guid]::NewGuid().ToString('N') + '.partial'
        $uri = 'https://huggingface.co/' + $lock.id + '/resolve/' + $lock.sha + '/' + $file.rfilename + '?download=true'
        curl.exe --fail --show-error --silent --location --retry 2 --output $staging $uri
        Confirm-Exit 'Base artifact download'
        if ((Get-Item -LiteralPath $staging).Length -ne $file.size) { throw 'Base file size mismatch' }
        if ($file.lfs) {
            if ((Get-FileHash -LiteralPath $staging).Hash -ne $file.lfs.sha256) { throw 'Weight SHA-256 mismatch' }
        } elseif ((git hash-object --no-filters $staging) -ne $file.blobId) { throw 'Model metadata hash mismatch' }
        Move-Item -LiteralPath $staging -Destination $target
    }
    $examples = Assert-ResearchPath (Join-Path $trainingRoot 'lexical-supervision-1')
    if (-not (Test-Path -LiteralPath $examples)) {
        Push-Location $ResearchWorkspace.Source
        try {
            & $ResearchWorkspace.Node node_modules/tsx/dist/cli.mjs evaluation/src/decipherment/training.ts $examples
            Confirm-Exit 'Lexical data export'
        } finally { Pop-Location }
    }
    return
}

if ($Action -eq 'candidate') {
    & $python -I (Join-Path $adapterRoot 'train_candidate.py')
    Confirm-Exit 'Fixed lexical candidate experiment'
    return
}

$runDirectory = Assert-ResearchPath (Join-Path $trainingRoot ('cpu-pilot-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)))
& $python -I (Join-Path $adapterRoot 'cpu_pilot.py') --output $runDirectory --threads 4
Confirm-Exit 'Adapter pilot'
Write-Output "Verified pilot results at $runDirectory"
