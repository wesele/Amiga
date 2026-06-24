@echo off
cd /d "%~dp0"

echo [Amiga] Starting Windows dev session on port 1420...

:: Check if port 1420 is already in use — only kill if something is actually listening
netstat -aon | findstr :1420 >nul 2>&1
if %errorlevel% equ 0 (
  echo [Amiga] Port 1420 in use. Cleaning up previous session...
  taskkill /f /im idioma.exe >nul 2>&1
  taskkill /f /im Amiga.exe >nul 2>&1
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1420') do (
    taskkill /f /pid %%a 2>nul
  )
  timeout /t 2 >nul
) else (
  echo [Amiga] Port 1420 is free.
)

echo.
npm run tauri dev
pause
