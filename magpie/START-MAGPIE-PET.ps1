$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskLogs = Join-Path $taskRoot 'logs'
$taskLock = Join-Path $taskRoot 'data\launcher.json'
if (Test-Path -LiteralPath $taskLock) {
    $taskState = Get-Content -LiteralPath $taskLock -Raw | ConvertFrom-Json
    if (Get-Process -Id $taskState.pid -ErrorAction SilentlyContinue) {
        Write-Output 'Magpie pet is already running.'
        return
    }
}
New-Item -ItemType Directory -Path $taskLogs -Force | Out-Null
$taskNode = (Get-Command node -ErrorAction Stop).Source
$taskEntry = Join-Path $taskRoot 'app.mjs'
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @("`"$taskEntry`"") -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogs 'companion.log') -RedirectStandardError (Join-Path $taskLogs 'companion-error.log') -PassThru
$taskRuntime = Join-Path $taskRoot 'data\dsh-pet\standalone-runtime.json'
for ($taskAttempt = 0; $taskAttempt -lt 40; $taskAttempt++) {
    $taskProcess.Refresh()
    if ($taskProcess.HasExited) {
        throw 'Magpie pet could not start. See logs\companion-error.log.'
    }
    if (Test-Path -LiteralPath $taskRuntime) {
        Write-Output 'Magpie pet is starting. The desktop window will appear shortly.'
        return
    }
    Start-Sleep -Milliseconds 250
}
throw 'Magpie pet startup is taking longer than expected. See the logs folder.'
