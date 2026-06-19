@echo off
cd /d "%~dp0"

echo [Amiga] Cleaning up previous Windows dev session...
taskkill /f /im idioma.exe >nul 2>&1
taskkill /f /im Amiga.exe >nul 2>&1
taskkill /f /im cargo.exe >nul 2>&1

echo Checking for existing dev server on port 1420...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1420') do (
  echo Killing process %%a...
  taskkill /f /pid %%a 2>nul
)

echo [Amiga] Starting Windows dev server on port 1420...
echo.
npm run tauri dev
pause
