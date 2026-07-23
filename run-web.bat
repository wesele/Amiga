@echo off
setlocal

:: Amiga Web TV Demo - local development launcher.
set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo [Amiga] Starting the local Web TV Demo at http://127.0.0.1:1420/
echo.

npm.cmd run dev:web -- --host 127.0.0.1 --open
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" pause
exit /b %RC%
