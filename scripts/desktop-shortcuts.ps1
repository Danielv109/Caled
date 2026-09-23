param([switch]$VerifyOnly, [string]$Destination)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $workspace 'scripts\launch-desktop.ps1'
$icon = Join-Path $workspace 'media\caled.ico'
$shellExecutable = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
foreach ($required in @($launcher, $icon, $shellExecutable)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw ('Missing launcher file: ' + $required) }
}
$arguments = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '"'
$shell = New-Object -ComObject WScript.Shell
$targets = if ($Destination) {
    # The explicit destination is used by the launcher integration test only.
    $resolved = [IO.Path]::GetFullPath($Destination)
    $testBoundary = [IO.Path]::GetFullPath((Join-Path $workspace '.cache\launcher-tests')).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($testBoundary, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test shortcut destination must stay within .cache/launcher-tests.' }
    @((Join-Path $resolved 'Caled.lnk'))
} else {
    @(
        (Join-Path $workspace 'Abrir-Caled.lnk'),
        (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Caled.lnk'),
        (Join-Path ([Environment]::GetFolderPath('Programs')) 'Caled\Caled.lnk')
    )
}
foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target) {
        $existing = $shell.CreateShortcut($target)
        # Never replace another installation's shortcut merely because its name matches.
        if ($existing.TargetPath -ine $shellExecutable -or $existing.Arguments -cne $arguments) {
            throw ('A different shortcut already exists and was preserved: ' + $target)
        }
    } elseif ($VerifyOnly) { throw ('Missing Caled shortcut: ' + $target) }
    if (-not $VerifyOnly) {
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
        $shortcut = $shell.CreateShortcut($target)
        $shortcut.TargetPath = $shellExecutable
        $shortcut.Arguments = $arguments
        $shortcut.WorkingDirectory = $workspace
        $shortcut.WindowStyle = 7
        $shortcut.IconLocation = $icon + ',0'
        $shortcut.Description = 'Caled - Local AI editor / Editor con IA local'
        $shortcut.Save()
    }
    $saved = $shell.CreateShortcut($target)
    if ($saved.TargetPath -ine $shellExecutable -or $saved.Arguments -cne $arguments -or $saved.IconLocation -ine ($icon + ',0')) {
        throw ('Caled shortcut verification failed: ' + $target)
    }
    Write-Output ('Caled shortcut verified: ' + $target)
}
