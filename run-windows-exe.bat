@echo off
cd /d "%~dp0"

echo [Amiga] Tauri exe (expects Vite on http://localhost:1420)...
echo Start run-windows-vite.bat first if not already running.
echo.

taskkill /f /im idioma.exe >nul 2>&1
taskkill /f /im Amiga.exe >nul 2>&1
taskkill /f /im cargo.exe >nul 2>&1

title Amiga Tauri
npm run tauri dev
pause
