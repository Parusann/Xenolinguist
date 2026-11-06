#Requires -Version 7.2
. (Join-Path $PSScriptRoot 'atlas-env.ps1')
$ErrorActionPreference = 'Stop'
if ($ResearchWorkspace.FreeGiB -lt 25) { throw 'Atlas setup requires 25 GiB free on the research drive' }

foreach ($folder in @($AtlasWorkspace.Data, $AtlasWorkspace.Objects, $AtlasWorkspace.Config, $AtlasWorkspace.Log, $AtlasWorkspace.Backup, $AtlasWorkspace.Cache)) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
}
# DPAPI protects the values for this Windows account. Restrict the containing directory as well.
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach ($privateDirectory in @($AtlasWorkspace.Config, $AtlasWorkspace.Data)) {
    icacls.exe $privateDirectory /inheritance:r /grant:r ("*" + $sid + ':(OI)(CI)F') | Out-Null
    if ($LASTEXITCODE) { throw 'Could not restrict atlas data or configuration permissions' }
}

foreach ($name in @('postgres', 'restic')) {
    $asset = $atlasLock.$name
    $destination = Assert-ResearchPath (Join-Path $ResearchWorkspace.Root ('runtime/' + $name))
    if (Test-Path -LiteralPath $destination) { continue }
    $archive = Assert-ResearchPath (Join-Path $ResearchWorkspace.Root ('cache/' + $name + '-' + $asset.version + '.zip'))
    if (-not (Test-Path -LiteralPath $archive)) {
        $partial = $archive + '.partial'
        curl.exe --fail --silent --show-error --location --retry 2 --output $partial $asset.url
        if ($LASTEXITCODE) { throw "$name download failed" }
        if ((Get-FileHash -LiteralPath $partial).Hash -ne $asset.sha256) { throw "$name archive checksum mismatch" }
        Move-Item -LiteralPath $partial -Destination $archive
    }
    if ((Get-FileHash -LiteralPath $archive).Hash -ne $asset.sha256) { throw "$name archive checksum mismatch" }
    $stage = $destination + '.partial'
    if (Test-Path -LiteralPath $stage) { throw "Inspect the incomplete $name extraction before retry" }
    if ($name -eq 'postgres') {
        $zip = [IO.Compression.ZipFile]::OpenRead($archive)
        try {
            foreach ($entry in $zip.Entries) {
                if ($entry.FullName -notmatch '^pgsql/(bin/|lib/|share/|server_license\.txt$|commandlinetools_3rd_party_licenses\.txt$)') { continue }
                $target = Assert-ResearchPath (Join-Path $stage $entry.FullName)
                if (-not $target.StartsWith([IO.Path]::GetFullPath($stage) + [IO.Path]::DirectorySeparatorChar)) { throw 'Archive path escapes extraction root' }
                if ($entry.FullName.EndsWith('/')) {
                    New-Item -ItemType Directory -Path $target -Force | Out-Null
                } else {
                    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
                    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
                }
            }
        } finally { $zip.Dispose() }
    } else {
        Expand-Archive -LiteralPath $archive -DestinationPath $stage
    }
    if ($name -eq 'restic') {
        Move-Item -LiteralPath (Join-Path $stage ('restic_' + $asset.version + '_windows_amd64.exe')) -Destination (Join-Path $stage 'restic.exe')
    }
    Move-Item -LiteralPath $stage -Destination $destination
}

$secretFile = Join-Path $AtlasWorkspace.Config 'secrets.clixml'
if (-not (Test-Path -LiteralPath $secretFile)) {
    $secrets = @{}
    foreach ($name in @('atlas_admin', 'atlas_app', 'atlas_auth', 'atlas_worker', 'auth_secret', 'restic_password')) {
        $random = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
        $secrets[$name] = ConvertTo-SecureString -String $random -AsPlainText -Force
    }
    $secrets | Export-Clixml -LiteralPath $secretFile
}
$values = Get-AtlasSecrets
if (-not (Test-Path -LiteralPath (Join-Path $AtlasWorkspace.Database 'PG_VERSION'))) {
    if (Test-Path -LiteralPath $AtlasWorkspace.Database) { throw 'Existing incomplete database directory requires inspection' }
    $passwordFile = Join-Path $AtlasWorkspace.Config 'init-password.tmp'
    try {
        [IO.File]::WriteAllText($passwordFile, $values.atlas_admin)
        Invoke-AtlasPostgres -Program initdb -Arguments @('-D', $AtlasWorkspace.Database, '-U', 'atlas_admin',
            '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', '--encoding=UTF8', '--locale=C', '--data-checksums', "--pwfile=$passwordFile")
    } finally {
        if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile }
    }
    $configuration = @"
listen_addresses = '127.0.0.1'
port = 5438
max_connections = 30
shared_buffers = '128MB'
work_mem = '4MB'
maintenance_work_mem = '64MB'
fsync = on
synchronous_commit = on
full_page_writes = on
password_encryption = 'scram-sha-256'
log_statement = 'none'
log_min_error_statement = 'panic'
"@
    [IO.File]::WriteAllText((Join-Path $AtlasWorkspace.Database 'postgresql.auto.conf'), $configuration)
}
Invoke-AtlasPostgres -Program postgres -Arguments @('--version')
& $AtlasWorkspace.Restic version
if ($LASTEXITCODE) { throw 'Restic version check failed' }
Write-Output 'Atlas runtime and protected local configuration are ready.'
