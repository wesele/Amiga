@echo off
cd /d "%~dp0"

echo [Amiga] Starting Windows dev session on port 1420...

:: Check if port 1420 is already in use -- kill ONLY the process listening on that port
netstat -aon | findstr ":1420 " | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
  echo [Amiga] Port 1420 in use. Cleaning up previous session...
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":1420 " ^| findstr LISTENING') do (
    taskkill /f /pid %%a 2>nul
  )
  timeout /t 2 >nul
) else (
  echo [Amiga] Port 1420 is free.
)

echo.
npm run tauri dev
pause
