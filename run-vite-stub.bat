@echo off
cd /d "%~dp0"

echo [Amiga] Starting Vite dev server ONLY (no Rust compilation)...
echo [Amiga] Tauri invoke calls will use stub -- REST API / UI development only.
echo.

npm run dev
pause
