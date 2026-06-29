@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  Amiga - Windows dev instance #2 (FULLY ISOLATED)
::
::  Purpose
::  -------
::  Start a second, completely independent Amiga dev session
::  while the main `run-windows.bat` is still running.
::
::  Isolation contract (100%):
::    - Separate process (different Vite/Tauri ports)
::    - Separate SQLite database (IDIOMA_DATA_DIR)
::    - Separate Rust build artifacts (CARGO_TARGET_DIR)
::    - Separate logs (IDIOMA_LOG_DIR)
::    - Separate frontend Vite cache (inside windows-2/)
::    - Separate app identity (Amiga-Test + com.idioma.app.test)
::
::  How it works
::  ------------
::  1. Detect whether the current source tree has changed since
::     the last time we mirrored to the "windows-2" shadow copy.
::  2. If changed (or first run), MIRROR the entire project tree
::     into .\windows-2 using robocopy, excluding:
::       - node_modules, dist, src-tauri/target*, src-tauri/gen
::       - screenshots, .git, Android sources (not needed on Win)
::       - *.log and other transient files
::  3. If node_modules is missing inside windows-2, run npm install.
::  4. cd into windows-2 and launch the dev session with all
::     isolation environment variables set.
::
::  Update detection (strategy A: mtime heuristic)
::  ---------------------------------------------
::  We compare mtime of a small set of "important" files between
::  the source tree and the shadow copy. If any source file is
::  newer, we re-mirror. This is fast and good enough.
::
::  Fast start (no code changes, shadow copy up to date):
::    - Reuses a running Vite server on :1422 when possible
::    - Skips Rust rebuild when target-test\debug\idioma.exe is fresh
::    Use --full to force a clean restart of ports + Vite + Rust.
::
::  IMPORTANT:
::  - windows-2/ is permanently ignored by git (see .gitignore).
::  - Never edit files directly inside windows-2/ for long-lived
::    work. Treat it as a throw-away build tree.
::  - You can safely delete the entire windows-2 folder; next run
::    of this script will recreate it.
:: ============================================================

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"
cd /d "%PROJECT_DIR%"

set "SHADOW_DIR=%PROJECT_DIR%\windows-2"
set "NEED_MIRROR=0"

echo [Amiga-Test] Windows isolated dev instance (windows-2)
echo [Amiga-Test] Project root: %PROJECT_DIR%
echo [Amiga-Test] Shadow dir  : %SHADOW_DIR%

:: --- Step 1: decide if we need to (re)mirror -----------------
if not exist "%SHADOW_DIR%" (
  echo [Amiga-Test] Shadow directory does not exist yet.
  set "NEED_MIRROR=1"
  goto :do_mirror
)

:: Key files whose mtime we watch for "source changed"
set "WATCH_FILES=package.json Cargo.toml src-tauri\Cargo.toml src-tauri\tauri.conf.test.json src-tauri\tauri.conf.json vite.config.js"

for %%F in (%WATCH_FILES%) do (
  if exist "%%F" (
    for %%S in ("%%F") do (
      if exist "%SHADOW_DIR%\%%F" (
        for %%D in ("%SHADOW_DIR%\%%F") do (
          if %%~tS GTR %%~tD (
            echo [Amiga-Test] Detected newer source: %%F
            set "NEED_MIRROR=1"
            goto :do_mirror
          )
        )
      ) else (
        :: Shadow copy is missing this file -> treat as changed
        echo [Amiga-Test] Missing in shadow: %%F
        set "NEED_MIRROR=1"
        goto :do_mirror
      )
    )
  )
)

echo [Amiga-Test] Shadow copy is up to date.
goto :after_mirror

:do_mirror
echo [Amiga-Test] Mirroring source tree into windows-2 ...
echo [Amiga-Test] This may take a few seconds on first run or after big changes.

:: /MIR = mirror (delete files in destination that no longer exist in source)
:: /XD  = exclude directories
:: /XF  = exclude files
robocopy "%PROJECT_DIR%" "%SHADOW_DIR%" ^
  /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS ^
  /XD node_modules dist src-tauri\target src-tauri\target-test src-tauri\gen src-tauri\android screenshots .git .opencode pages ^
  /XF *.log *.tmp "vite-*.txt" ".DS_Store" "Thumbs.db" >nul

if %ERRORLEVEL% GEQ 8 (
  echo [Amiga-Test] ERROR: robocopy failed with code %ERRORLEVEL%
  pause
  exit /b 1
)

echo [Amiga-Test] Mirror complete.

:after_mirror

:: --- Step 2: ensure dependencies exist in the shadow copy ----
if not exist "%SHADOW_DIR%\node_modules" (
  echo [Amiga-Test] node_modules missing in shadow copy. Running npm install...
  pushd "%SHADOW_DIR%"
  call npm install
  if not exist "%SHADOW_DIR%\node_modules" (
    echo [Amiga-Test] npm install failed: node_modules still missing.
    popd
    pause
    exit /b 1
  )
  popd
  echo [Amiga-Test] npm install done.
)

:: --- Step 3: launch isolated dev session with fast-start ----
set "FORCE_ARG="
if /i "%~1"=="--full" set "FORCE_ARG=-ForceFull"
if /i "%~1"=="/full" set "FORCE_ARG=-ForceFull"

set "PS_EXE=powershell"
where pwsh >nul 2>&1
if %errorlevel% equ 0 set "PS_EXE=pwsh"

echo.
echo [Amiga-Test] Starting FULLY ISOLATED Windows dev session on port 1422...
echo [Amiga-Test] Working directory : %SHADOW_DIR%
echo [Amiga-Test] Data directory    : %LOCALAPPDATA%\idioma-test
echo [Amiga-Test] Log directory     : %LOCALAPPDATA%\idioma-test\logs
echo [Amiga-Test] Cargo target dir  : %SHADOW_DIR%\src-tauri\target-test
echo [Amiga-Test] App identifier    : com.idioma.app.test (Amiga-Test)
echo.

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\start-windows-2-dev.ps1" %FORCE_ARG%
set RC=%ERRORLEVEL%
echo.
echo [Amiga-Test] tauri dev exited with code %RC%
pause
goto :eof
