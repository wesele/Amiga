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
::  For a SECOND, FULLY ISOLATED instance (separate DB, logs,
::  build cache, process, etc.) use run-windows-2.bat instead.
::  See AGENTS.md table and the comments inside run-windows-2.bat.
:: ============================================================

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

echo [Amiga] Starting Windows dev session on port 1420...
echo [Amiga] Project directory: %PROJECT_DIR%

call :ensure_port_free 1420
call :ensure_port_free 1421

echo.
npm run tauri dev
pause
goto :eof

:ensure_port_free
set "PORT=%~1"
set "NEEDS_WAIT="

netstat -aon | findstr ":%PORT% " | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
  echo [Amiga] Port %PORT% in use. Cleaning up previous session...
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /f /pid %%a 2>nul
    if errorlevel 1 (
      echo [Amiga] Warning: failed to kill PID %%a for port %PORT%.
    ) else (
      set "NEEDS_WAIT=1"
    )
  )
) else (
  echo [Amiga] Port %PORT% is free.
)

if defined NEEDS_WAIT (
  for /l %%i in (1,1,10) do (
    timeout /t 1 >nul
    netstat -aon | findstr ":%PORT% " | findstr LISTENING >nul 2>&1
    if errorlevel 1 goto :eof
  )
  echo [Amiga] Warning: port %PORT% still appears busy after cleanup.
)
goto :eof
