param(
    [string]$InstallRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
$taskEntry = Join-Path $taskRoot 'app.mjs'
$taskLauncher = Join-Path $taskRoot 'launch.cjs'
$taskElectron = Join-Path $taskRoot 'data\electron\electron.exe'
$taskSources = @(
    (Join-Path (Split-Path $taskRoot -Parent) 'dsh-pet'),
    (Join-Path $taskRoot 'upstream\dsh-pet')
)
$taskLogo = $null
foreach ($taskSource in $taskSources) {
    $taskCandidate = Join-Path $taskSource 'assets\logo.png'
    if (Test-Path -LiteralPath $taskCandidate) {
        $taskLogo = $taskCandidate
        break
    }
}
if (-not (Test-Path -LiteralPath $taskEntry) -or -not (Test-Path -LiteralPath $taskLauncher) -or -not $taskLogo) {
    throw 'Run this script from the Magpie pet installation with its desktop pet source present.'
}
if (-not (Test-Path -LiteralPath $taskElectron)) {
    throw 'Start the pet once with START-MAGPIE-PET.cmd to download Electron, then retry.'
}
$taskNode = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source

$taskIconDirectory = Join-Path $taskRoot 'data\shortcuts'
New-Item -ItemType Directory -Path $taskIconDirectory -Force | Out-Null
$taskIcon = Join-Path $taskIconDirectory 'magpie-pet.ico'
$taskPng = [IO.File]::ReadAllBytes($taskLogo)
$taskWriter = [IO.BinaryWriter]::new([IO.File]::Create($taskIcon))
try {
    # ICO can embed the bundled 256px PNG without changing its image data.
    $taskWriter.Write([uint16]0)
    $taskWriter.Write([uint16]1)
    $taskWriter.Write([uint16]1)
    $taskWriter.Write([byte]0)
    $taskWriter.Write([byte]0)
    $taskWriter.Write([byte]0)
    $taskWriter.Write([byte]0)
    $taskWriter.Write([uint16]1)
    $taskWriter.Write([uint16]32)
    $taskWriter.Write([uint32]$taskPng.Length)
    $taskWriter.Write([uint32]22)
    $taskWriter.Write($taskPng)
} finally {
    $taskWriter.Dispose()
}

$taskShell = New-Object -ComObject WScript.Shell
$taskPath = Join-Path $taskRoot 'Magpie Pet.lnk'
$taskShortcut = $taskShell.CreateShortcut($taskPath)
$taskShortcut.TargetPath = $taskElectron
$taskShortcut.Arguments = '"' + $taskLauncher + '" --node-path "' + $taskNode + '"'
$taskShortcut.WorkingDirectory = $taskRoot
$taskShortcut.IconLocation = "$taskIcon,0"
$taskShortcut.WindowStyle = 1
$taskShortcut.Description = 'Start the Magpie desktop pet'
$taskShortcut.Save()
Write-Output "Created in the project folder: $taskPath"
