#Requires -Version 7.2
[CmdletBinding()]
param(
    [ValidateSet('doctor', 'install', 'check', 'baseline', 'corpus', 'decipherment-controls', 'decipherment-model')]
    [string]$Action = 'doctor',
    [string]$WorkspaceRoot = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
)

. (Join-Path $PSScriptRoot 'research-env.ps1') -WorkspaceRoot $WorkspaceRoot

function Invoke-ResearchNode {
    param([string[]]$Arguments)
    & $ResearchWorkspace.Node @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Research command failed with exit code $LASTEXITCODE." }
}

Push-Location $ResearchWorkspace.Source
try {
    if ($ResearchWorkspace.BelowPreferredHeadroom) {
        Write-Warning 'Research drive has less than the preferred 30 GiB free.'
    }
    switch ($Action) {
        'doctor' {
            $ResearchWorkspace | ConvertTo-Json -Depth 4
        }
        'install' {
            Invoke-ResearchNode -Arguments @(
                $ResearchWorkspace.Npm, 'ci',
                '--workspace', 'server', '--workspace', 'shared',
                '--workspace', '@xenolinguist/engine', '--workspace', '@xenolinguist/evaluation',
                '--include-workspace-root=false', '--ignore-scripts', '--no-audit', '--no-fund'
            )
        }
        'check' {
            $runId = 'checks-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
            $directory = Join-Path $env:XENO_RESEARCH_RESULTS $runId
            New-Item -ItemType Directory -Path $directory | Out-Null
            $report = Join-Path $directory 'vitest.json'
            # Pure research suites: no model download, service startup or external-model call.
            Push-Location 'server'
            try {
                Invoke-ResearchNode -Arguments @(
                    '../node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2',
                    '../engine/src/__tests__', '../evaluation/src',
                    '--reporter=default', '--reporter=json', "--outputFile.json=$report"
                )
            } finally { Pop-Location }
            Invoke-ResearchNode -Arguments @('node_modules/typescript/bin/tsc', '-p', 'evaluation', '--noEmit')
            Write-Output "Research check report: $report"
        }
        'baseline' {
            $runId = 'existing-baseline-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
            $directory = Join-Path $env:XENO_RESEARCH_RESULTS $runId
            # Frozen CI development fixture: lookup + symbolic methods, never the reserved model study.
            Invoke-ResearchNode -Arguments @(
                'node_modules/tsx/dist/cli.mjs', 'evaluation/src/runner.ts',
                'evaluation/configs/ci.json', $directory
            )
        }
        'corpus' {
            $runId = 'corpus-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
            $directory = Join-Path $env:XENO_RESEARCH_RESULTS $runId
            Invoke-ResearchNode -Arguments @('node_modules/tsx/dist/cli.mjs', 'evaluation/src/decipherment/cli.ts', 'audit')
            foreach ($split in @('train', 'development')) {
                Invoke-ResearchNode -Arguments @('node_modules/tsx/dist/cli.mjs', 'evaluation/src/decipherment/cli.ts', 'export', $split, (Join-Path $directory $split))
            }
            Write-Output "Verified corpus: $directory"
        }
        { $_ -in @('decipherment-controls', 'decipherment-model') } {
            $runId = $Action + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
            $directory = Join-Path $env:XENO_RESEARCH_RESULTS $runId
            $mode = if ($Action -eq 'decipherment-model') { 'local-model' } else { 'controls' }
            if ($mode -eq 'local-model') { $env:OLLAMA_BASE_URL = 'http://127.0.0.1:11435' }
            Invoke-ResearchNode -Arguments @('node_modules/tsx/dist/cli.mjs', 'evaluation/src/decipherment/study.ts', $mode, $directory)
            Write-Output "Verified decipherment study: $directory"
        }
    }
} finally { Pop-Location }
