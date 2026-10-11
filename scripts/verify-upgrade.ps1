param([Parameter(Mandatory)][string]$Installer, [Parameter(Mandatory)][string]$Harness)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or !$env:RUNNER_TEMP) { throw 'Installer lifecycle verification is restricted to disposable GitHub runners.' }
$taskRoot = [IO.Path]::GetFullPath((Join-Path $env:RUNNER_TEMP 'xeno-acceptance-upgrade-é'))
$runnerRoot = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\') + '\'
if (!$taskRoot.StartsWith($runnerRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Upgrade target escaped runner temp.' }
$oldInstaller = Join-Path $env:RUNNER_TEMP 'xeno-v1-original.exe'
Invoke-WebRequest 'https://github.com/Parusann/Xenolinguist/releases/download/v1.0.0/Xenolinguist-Setup-1.0.0.exe' -OutFile $oldInstaller
if ((Get-FileHash -LiteralPath $oldInstaller -Algorithm SHA256).Hash.ToLowerInvariant() -ne '5974906a74a11eb7d4e14c0923ec5ff870e5669ad050b832b10b773e8491c6b5') { throw 'Published installer hash mismatch.' }
function Install-Candidate([string]$File) {
  $process = Start-Process -FilePath $File -ArgumentList "/S /D=$taskRoot" -WindowStyle Hidden -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
  if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'Xenolinguist.exe'))) { throw 'Installed executable missing.' }
}
Install-Candidate $oldInstaller
Install-Candidate ([IO.Path]::GetFullPath($Installer))
$installedExe = Join-Path $taskRoot 'Xenolinguist.exe'
$env:XENO_UPGRADE_EXE = $installedExe
Push-Location $Harness
try {
  node --input-type=module -e "import {verifyDesktopRecovery} from './scripts/verify-desktop-recovery.mjs'; import {readFile,writeFile} from 'node:fs/promises'; const r=await verifyDesktopRecovery(process.env.XENO_UPGRADE_EXE,await readFile('server/src/__tests__/fixtures/hello-16k.wav')); await writeFile('upgrade-runtime.json',JSON.stringify(r,null,2));"
  if ($LASTEXITCODE -ne 0) { throw 'Upgraded runtime verification failed.' }
} finally { Pop-Location }
$signature = Get-AuthenticodeSignature -LiteralPath $installedExe
$uninstaller = Join-Path $taskRoot 'Uninstall Xenolinguist.exe'
if (!(Test-Path -LiteralPath $uninstaller)) { throw 'Uninstaller missing.' }
$process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Uninstaller failed.' }
$deadline = (Get-Date).AddSeconds(30)
while ((Test-Path -LiteralPath $installedExe) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
if (Test-Path -LiteralPath $installedExe) { throw 'Application executable remains after uninstall.' }
@{ passed=$true; fromVersion='1.0.0'; upgradeInstalled=$true; nonAsciiInstallPath=$true; uninstallRemovedExecutable=$true; signatureStatus=$signature.Status.ToString(); limits=@('Old application not launched; controlled legacy data tested in upgraded runtime.', 'Power-loss interruption of NSIS is not certified; automatic update application is excluded.') } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Harness 'upgrade-install.json') -Encoding utf8
