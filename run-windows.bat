@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  Amiga - Windows dev instance #1 (PRIMARY / MAIN)
::
::  This is the normal, everyday development entry point.
::  It runs against the real source tree in the current folder.
::
::  Data / logs / build artifacts go to the normal locations:
::    - DB:   %LOCALAPPDATA%\idioma\idioma.db
::    - Logs: %LOCALAPPDATA%\idioma\logs
::    - Rust: src-tauri\target (or CARGO_TARGET_DIR if you set it)
::
::  Fast start (no code changes):
::    - Reuses a running Vite server on :1420 when possible
::    - Skips Rust rebuild when target\debug\idioma.exe is fresh
::    Use --full to force a clean restart of ports + Vite + Rust.
::
::  For a SECOND, FULLY ISOLATED instance (separate DB, logs,
::  build cache, process, etc.) use run-windows-2.bat instead.
::  See AGENTS.md table and the comments inside run-windows-2.bat.
:: ============================================================

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

set "FORCE_ARG="
if /i "%~1"=="--full" set "FORCE_ARG=-ForceFull"
if /i "%~1"=="/full" set "FORCE_ARG=-ForceFull"

set "PS_EXE=powershell"
where pwsh >nul 2>&1
if %errorlevel% equ 0 set "PS_EXE=pwsh"

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\start-windows-dev.ps1" %FORCE_ARG%
set "RC=%ERRORLEVEL%"
pause
exit /b %RC%