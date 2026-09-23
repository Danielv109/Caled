@echo off
setlocal
if not exist "%~dp0.runtime\Caled\Caled.cmd" (
  echo Primero ejecuta npm install y npm run desktop:prepare en esta carpeta.
  pause
  exit /b 1
)
node "%~dp0scripts\desktop.mjs" start "%~dp0."
endlocal
