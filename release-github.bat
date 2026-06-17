@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

chcp 65001 >nul

echo ============================================
echo  Amiga - GitHub Release Publisher
echo ============================================
echo.

:: Read version from package.json
for /f "tokens=2 delims=:," %%a in ('findstr "version" package.json') do (
    set raw=%%a
    set raw=!raw:"=!
    set raw=!raw: =!
    set VERSION=!raw!
    goto :got_version
)
:got_version
if "%VERSION%"=="" (
    echo [ERROR] Cannot read version from package.json
    pause
    exit /b 1
)
echo Version: %VERSION%
echo.

:: Tag name
set TAG=v%VERSION%

:: Check gh CLI
gh --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] GitHub CLI (gh) not found. Install from https://cli.github.com/
    pause
    exit /b 1
)

:: Check gh auth
gh auth status >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not logged into GitHub. Run: gh auth login
    pause
    exit /b 1
)

:: Confirm
echo This will build and publish version %VERSION% to GitHub.
echo Tag: %TAG%
echo.
set /p CONFIRM="Continue? (y/N) "
if /i not "!CONFIRM!"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)
echo.

:: ── Step 1: Frontend build ──
echo [1/4] Building frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)
echo.

:: ── Step 2: Windows build ──
echo [2/4] Building Windows release...
call npm run tauri build
if errorlevel 1 (
    echo [ERROR] Windows build failed!
    pause
    exit /b 1
)
echo.

:: ── Step 3: Android APK build ──
echo [3/4] Building Android APK (arm64-v8a)...
call npm run tauri android build -- --target aarch64 --apk
if errorlevel 1 (
    echo [ERROR] Android build failed!
    pause
    exit /b 1
)
echo.

:: ── Step 4: Collect artifacts ──
echo [4/4] Creating GitHub release %TAG% ...

:: Create temp release notes file
set NOTESFILE=%TEMP%\amiga-release-notes-%VERSION%.md

:: Ask for release notes
echo.
echo Enter release notes (press Enter twice to finish):
echo ---
(
    set /p LINE1=
    set /p LINE2=
    set /p LINE3=
    set /p LINE4=
    set /p LINE5=
    set /p LINE6=
    set /p LINE7=
    set /p LINE8=
    set /p LINE9=
    set /p LINE10=
) > "%NOTESFILE%"

echo. >nul

:: Collect artifact paths
set ARTIFACTS=

:: Windows installer (NSIS)
if exist "src-tauri\target\release\bundle\nsis\*.exe" (
    for %%f in ("src-tauri\target\release\bundle\nsis\*.exe") do set ARTIFACTS=!ARTIFACTS! "%%f"
) else if exist "src-tauri\target\release\bundle\msi\*.msi" (
    for %%f in ("src-tauri\target\release\bundle\msi\*.msi") do set ARTIFACTS=!ARTIFACTS! "%%f"
)

:: Standalone EXE
if exist "src-tauri\target\release\idioma.exe" (
    set ARTIFACTS=!ARTIFACTS! "src-tauri\target\release\idioma.exe"
)

:: Android APK
if exist "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk" (
    set ARTIFACTS=!ARTIFACTS! "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
) else if exist "src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk" (
    set ARTIFACTS=!ARTIFACTS! "src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk"
)

if "%ARTIFACTS%"=="" (
    echo [WARNING] No build artifacts found. Creating tag-only release.
)

:: Create GitHub release
gh release create "%TAG%" ^
    --title "v%VERSION%" ^
    --notes-file "%NOTESFILE%" ^
    %ARTIFACTS%

if errorlevel 1 (
    echo [ERROR] GitHub release creation failed!
    pause
    exit /b 1
)

:: Clean up
del "%NOTESFILE%" 2>nul

echo.
echo ============================================
echo  Release v%VERSION% published successfully!
echo ============================================
echo.
pause
