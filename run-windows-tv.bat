@echo off
setlocal EnableDelayedExpansion

:: Amiga TV - Windows development launcher.
:: Uses the same fast-start workflow as run-windows.bat, with an isolated
:: Vite server and Rust target directory for the 16:9 TV presentation.

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

set "ARGS="
:parse_args
if "%~1"=="" goto run
if /i "%~1"=="--full" set "ARGS=%ARGS% -ForceFull"
if /i "%~1"=="/full" set "ARGS=%ARGS% -ForceFull"
shift
goto parse_args
:run

set "PS_EXE=powershell"
where pwsh >nul 2>&1
if %errorlevel% equ 0 set "PS_EXE=pwsh"

set "CARGO_INCREMENTAL=1"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\start-windows-tv-dev.ps1" %ARGS%
set "RC=%ERRORLEVEL%"
if %RC% neq 0 pause
exit /b %RC%
