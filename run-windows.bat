@echo off
cd /d "%~dp0"
taskkill /f /im idioma.exe >nul 2>&1
taskkill /f /im Amiga.exe >nul 2>&1
taskkill /f /im cargo.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
echo [Amiga] Starting dev server...
echo.
npm run tauri dev
pause