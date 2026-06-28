@echo off
set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

set VITE_PORT=1422
set VITE_HMR_PORT=1423
set IDIOMA_DATA_DIR=%LOCALAPPDATA%\idioma-test
set CARGO_TARGET_DIR=%PROJECT_DIR%\src-tauri\target-test

echo [Amiga-Test] Starting TEST Windows dev session on port 1422...
echo [Amiga-Test] Project directory: %PROJECT_DIR%
echo [Amiga-Test] Test data directory: %IDIOMA_DATA_DIR%
echo [Amiga-Test] Separate cargo target: %CARGO_TARGET_DIR%

call :ensure_port_free 1422
call :ensure_port_free 1423

echo.
call npm exec tauri dev -- --config "%PROJECT_DIR%\src-tauri\tauri.conf.test.json"
pause
goto :eof

:ensure_port_free
set "PORT=%~1"
set "NEEDS_WAIT="

netstat -aon | findstr ":%PORT% " | findstr LISTENING >nul 2>&1
if %errorlevel% equ 0 (
  echo [Amiga-Test] Port %PORT% in use. Cleaning up previous session...
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /f /pid %%a 2>nul
    if errorlevel 1 (
      echo [Amiga-Test] Warning: failed to kill PID %%a for port %PORT%.
    ) else (
      set "NEEDS_WAIT=1"
    )
  )
) else (
  echo [Amiga-Test] Port %PORT% is free.
)

if defined NEEDS_WAIT (
  for /l %%i in (1,1,10) do (
    timeout /t 1 >nul
    netstat -aon | findstr ":%PORT% " | findstr LISTENING >nul 2>&1
    if errorlevel 1 goto :eof
  )
  echo [Amiga-Test] Warning: port %PORT% still appears busy after cleanup.
)
goto :eof
