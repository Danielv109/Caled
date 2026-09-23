@echo off
setlocal
if not exist "%~dp0.runtime\Caled\VSCodium.exe" (
  echo Primero ejecuta npm install y npm run desktop:prepare en esta carpeta.
  pause
  exit /b 1
)
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\launch-desktop.ps1"
endlocal
