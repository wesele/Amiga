@echo off
setlocal
cd /d "%~dp0"

set "ARGS=-Platform arm"
if /i "%~1"=="--full" set "ARGS=%ARGS% -ForceFull"
if /i "%~1"=="/full" set "ARGS=%ARGS% -ForceFull"

set "PS_EXE=powershell"
where pwsh >nul 2>&1
if %errorlevel% equ 0 set "PS_EXE=pwsh"

set "CARGO_INCREMENTAL=1"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-android-release.ps1" %ARGS%
set "RC=%ERRORLEVEL%"
if %RC% neq 0 pause
exit /b %RC%
