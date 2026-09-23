param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logFile = $null

# ProcessStartInfo uses the Windows argv parser, never a shell. Preserve spaces,
# Unicode, parentheses and trailing backslashes in portable installation paths.
function Quote-WindowsArgument([string]$Value) {
    $quoted = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $quoted = [regex]::Replace($quoted, '(\\+)$', '$1$1')
    return '"' + $quoted + '"'
}

try {
    $lockFile = Join-Path $workspace 'product\upstream.lock.json'
    $release = Get-Content -LiteralPath $lockFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($release.executable -notin @('VSCodium.exe', 'Codium.exe')) { throw 'Invalid desktop release manifest.' }
    $runtime = Join-Path $workspace '.runtime\Caled'
    $executable = Join-Path $runtime $release.executable
    $desktopScript = Join-Path $workspace 'scripts\desktop.mjs'
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw 'Caled is not prepared. Run npm run desktop:prepare once from the project folder.'
    }
    if (-not (Test-Path -LiteralPath $desktopScript -PathType Leaf)) { throw 'The Caled desktop launcher is missing.' }
    $logDirectory = Join-Path $workspace '.runtime\logs'
    [IO.Directory]::CreateDirectory($logDirectory) | Out-Null
    $logFile = Join-Path $logDirectory ('desktop-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff') + '-' + $PID + '.log')

    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $executable
    $launchArguments = if ($VerifyOnly) { @($desktopScript, 'verify') } else { @($desktopScript, 'start', '--reuse-window') }
    $info.Arguments = ($launchArguments | ForEach-Object { Quote-WindowsArgument $_ }) -join ' '
    $info.WorkingDirectory = $workspace
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    # Electron supplies the Node runtime. No separately installed Node is needed.
    $info.EnvironmentVariables['ELECTRON_RUN_AS_NODE'] = '1'
    $info.EnvironmentVariables.Remove('VSCODE_DEV')
    $info.EnvironmentVariables.Remove('NODE_OPTIONS')
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    if (-not $process.Start()) { throw 'The Caled desktop launcher could not start.' }
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $output = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
    $code = $process.ExitCode
    $process.Dispose()
    [IO.File]::WriteAllText($logFile, $output, (New-Object Text.UTF8Encoding($false)))
    if ($code -ne 0) { throw ('Caled could not start. Diagnostic log: ' + $logFile) }
    exit 0
} catch {
    $message = $_.Exception.Message
    if ($logFile -and -not (Test-Path -LiteralPath $logFile)) {
        [IO.File]::WriteAllText($logFile, $message, (New-Object Text.UTF8Encoding($false)))
    }
    if ($VerifyOnly) { [Console]::Error.WriteLine($message) }
    else {
        $dialog = New-Object -ComObject WScript.Shell
        $dialog.Popup("No se pudo abrir Caled / Caled could not open.`n`n" + $message, 0, 'Caled', 16) | Out-Null
    }
    exit 1
}
