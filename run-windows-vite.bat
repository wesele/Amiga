@echo off
cd /d "%~dp0"

echo [Amiga] Vite dev server (port 1420)...
echo Keep this window open. Start run-windows-exe.bat in another window.
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1420') do (
  echo Killing existing process on :1420 (pid %%a)...
  taskkill /f /pid %%a 2>nul
)

title Amiga Vite
npm run dev
pause
