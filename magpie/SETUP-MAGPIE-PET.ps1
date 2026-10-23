$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskRepoSource = Join-Path (Split-Path $taskRoot -Parent) 'dsh-pet'
$taskSource = if (Test-Path -LiteralPath (Join-Path $taskRepoSource 'package.json')) {
    $taskRepoSource
} else {
    Join-Path $taskRoot 'upstream\dsh-pet'
}
if (-not (Test-Path -LiteralPath (Join-Path $taskSource 'package.json'))) {
    throw 'Pet source is missing. Clone the complete lele183/dsh-pet repository, then run magpie\SETUP-MAGPIE-PET.ps1.'
}
Push-Location $taskSource
try {
    npm install --legacy-peer-deps --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    npm run bundle
    if ($LASTEXITCODE -ne 0) { throw 'Standalone runtime build failed.' }
    npm run build:desktop-core
    if ($LASTEXITCODE -ne 0) { throw 'Desktop shared-core build failed.' }
} finally {
    Pop-Location
}
Write-Output 'Ready. Run START-MAGPIE-PET.cmd.'
