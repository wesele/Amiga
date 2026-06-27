@echo off
cd /d "%~dp0"

set VITE_PORT=1422
set VITE_HMR_PORT=1423
set IDIOMA_DATA_DIR=%LOCALAPPDATA%\idioma-test

echo [Amiga-Test] Starting TEST Windows dev session on port 1422...
echo [Amiga-Test] Test data directory: %IDIOMA_DATA_DIR%

:: Check if port 1422 is already in use -- only kill if something is actually listening
netstat -aon | findstr :1422 >nul 2>&1
if %errorlevel% equ 0 (
  echo [Amiga-Test] Port 1422 in use. Cleaning up previous session...
  taskkill /f /im idioma.exe >nul 2>&1
  taskkill /f /im Amiga.exe >nul 2>&1
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1422') do (
    taskkill /f /pid %%a 2>nul
  )
  timeout /t 2 >nul
) else (
  echo [Amiga-Test] Port 1422 is free.
)

echo.
npm run tauri dev -- --config src-tauri/tauri.conf.test.json
pause
