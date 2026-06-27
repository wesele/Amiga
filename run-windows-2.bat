@echo off
cd /d "%~dp0"

set VITE_PORT=1422
set VITE_HMR_PORT=1423
set IDIOMA_DATA_DIR=%LOCALAPPDATA%\idioma-test
set CARGO_TARGET_DIR=%~dp0src-tauri\target-test

echo [Amiga-Test] Starting TEST Windows dev session on port 1422...
echo [Amiga-Test] Test data directory: %IDIOMA_DATA_DIR%
echo [Amiga-Test] Separate cargo target: %CARGO_TARGET_DIR%

:: Check if port 1422 is already in use -- kill ONLY the process listening on that port
netstat -aon | findstr ":1422 " | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
  echo [Amiga-Test] Port 1422 in use. Cleaning up previous session...
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":1422 " ^| findstr LISTENING') do (
    taskkill /f /pid %%a 2>nul
  )
  timeout /t 2 >nul
) else (
  echo [Amiga-Test] Port 1422 is free.
)

echo.
npx tauri dev --config src-tauri/tauri.conf.test.json
pause
