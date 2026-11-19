# Local decipherment research workspace

M0 prepares a separate, reproducible workspace for the specialist-model research track. It does not train a model or change the desktop application's behavior.

## Storage and runtime

Use a dedicated non-system NTFS drive with at least 30 GiB initially available. Keep the checkout, its independent Git object store, portable runtime, caches, temporary files and results beneath one workspace root. The verified setup uses E:\Xenolinguist with its checkout in source/.

PowerShell 7.2 or later is required. The portable Windows x64 Node version, archive URL and SHA-256 hashes are pinned in [the runtime lock](../research/runtime-lock.json). Verify the archive against that lock before extraction, and retain the distribution's license files. This does not upgrade system Node.

The local marker belongs at WORKSPACE\config\research-workspace.json, outside the Git checkout. It records schemaVersion = 1, project = xenolinguist-research, the absolute root/source/nodeDirectory paths, volumeUniqueId from Get-Volume, minimumFreeGiB = 20, and the starting commit. Do not copy a volume identity from another computer.

For an initial setup, clone into the selected drive, download and verify the pinned Node ZIP directly on that drive, and extract it under runtime/node/. Then create the marker, using actual paths:

~~~powershell
$root = 'E:\Xenolinguist'
$volume = Get-Volume -DriveLetter E
$marker = @{
    schemaVersion = 1
    project = 'xenolinguist-research'
    root = $root
    source = Join-Path $root 'source'
    volumeUniqueId = $volume.UniqueId
    minimumFreeGiB = 20
    nodeDirectory = Join-Path $root 'runtime\node\node-v24.22.2-win-x64'
    baselineCommit = git -C (Join-Path $root 'source') rev-parse HEAD
}
New-Item -ItemType Directory -Path (Join-Path $root 'config') -Force
$marker | ConvertTo-Json |
    Set-Content (Join-Path $root 'config\research-workspace.json') -Encoding utf8
~~~

Create the marker only for a deliberately selected workspace; it is not a recovery mechanism for a missing disk. The launcher verifies the volume identity, refuses the Windows system drive, checks runtime integrity, rejects paths/junctions escaping the workspace, and refuses new work below 20 GiB free. It warns below 30 GiB.

## Commands

Run from the dedicated checkout:

~~~powershell
pwsh -NoProfile -File scripts/research.ps1 -Action doctor
pwsh -NoProfile -File scripts/research.ps1 -Action install
pwsh -NoProfile -File scripts/research.ps1 -Action check
pwsh -NoProfile -File scripts/research.ps1 -Action baseline
pwsh -NoProfile -File tests/tooling/research-workspace.test.ps1
~~~

Use -WorkspaceRoot to select another prepared workspace. The default is the checkout's parent directory; an absent marker never causes automatic initialization.

- **doctor** checks the selected disk/runtime and prints the process environment destinations.
- **install** installs the existing locked server/shared/engine/evaluation dependencies. Lifecycle scripts, Electron/browser downloads and the workspace root package are excluded. This is a research installation, not a complete desktop packaging environment.
- **check** runs existing engine/evaluation tests with two workers, saves a JSON report, and type-checks evaluation/ without emitting build output.
- **baseline** replays the frozen CI development fixture using lookup and symbolic methods, preserving the existing verifier and a new output directory for every run.

The environment redirects npm, Python package, model, browser and Electron caches into the workspace for processes it launches. It does not change machine-wide settings, move an existing model library, or relocate a daemon that was already running. The M0 commands do not start Ollama or make model calls.

The environment script may be dot-sourced for an intentional research shell; ordinary use in a child pwsh process keeps environment changes within that process. Large model downloads and training require a separate later step.

## Retained M0 evidence

The October 31, 2026 run started from ec1952a121b98bb0130871697bd4e52170b22d03, matching upstream main at setup time. The original checkout was preserved.

- Small 4 MiB HDD write/read probe matched its checksum. This is an integrity check, not a throughput benchmark.
- 168 existing tests passed across 16 engine/evaluation files; evaluation TypeScript checking passed.
- Seven workspace checks passed: valid environment, missing root, missing marker, wrong volume, insufficient free space, outside-workspace runtime, and changed executable.
- The existing development fixture produced and verified 12 scheduled records with zero model calls.

At 29 supplied observations, the existing symbolic method recovered 10/10 withheld meanings across two development languages. At 8 and 16 observations it recovered 0/10; exact lookup recovered 0/10 at each budget. The symbolic method uses a supplied grammar prior. This replay checks reproducibility of an existing bounded system; it does not establish a new model gain, general decipherment, or reserved-test performance.

The [verification record](verification/m0-research-workspace.json) records counts and artifact digests. Full reports, source snapshots and logs remain in the local workspace's data/research/ and logs/ directories. No private corpus, model weight or volume identifier is committed.

## Next research stage

M1 defines the bounded decipherment protocol, visible information, ambiguity/abstention behavior and evaluation metrics. New data and experiments receive distinct protocol versions; existing fixtures and published results remain unchanged.
