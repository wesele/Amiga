@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

chcp 65001 >nul

echo ============================================
echo  Amiga - GitHub Release Publisher
echo ============================================
echo.

:: ── Version bump ──
echo Current version (from package.json):
for /f "tokens=2 delims=:," %%a in ('findstr "version" package.json') do (
    set raw=%%a
    set raw=!raw:"=!
    set raw=!raw: =!
    set CUR_VER=!raw!
    goto :got_curver
)
:got_curver
echo   !CUR_VER!
echo.

echo How to bump the version?
echo   [p] Patch (default) — bump third digit: !CUR_VER! → x.x.(+1)
echo   [m] Minor — bump second digit: x.(+1).0
echo   [M] Major — bump first digit: (+1).0.0
echo   [n] None — keep current version
set /p BUMP_CHOICE="Choice (p/m/M/n): "

if /i "!BUMP_CHOICE!"=="m" (
    for /f "tokens=1,2,3 delims=." %%a in ("!CUR_VER!") do (
        set /a MAJOR=%%a
        set /a MINOR=%%b + 1
        set PATCH=0
    )
    set NEW_VER=!MAJOR!.!MINOR!.!PATCH!
) else if /i "!BUMP_CHOICE!"=="M" (
    for /f "tokens=1,2,3 delims=." %%a in ("!CUR_VER!") do (
        set /a MAJOR=%%a + 1
        set MINOR=0
        set PATCH=0
    )
    set NEW_VER=!MAJOR!.!MINOR!.!PATCH!
) else if /i "!BUMP_CHOICE!"=="n" (
    set NEW_VER=!CUR_VER!
) else (
    :: Default: patch bump
    for /f "tokens=1,2,3 delims=." %%a in ("!CUR_VER!") do (
        set MAJOR=%%a
        set MINOR=%%b
        set /a PATCH=%%c + 1
    )
    set NEW_VER=!MAJOR!.!MINOR!.!PATCH!
)

echo.
echo New version: !NEW_VER!
echo.

:: Write new version to all config files using Node.js (UTF-8, no BOM)
call node scripts\bump-version.cjs "%CUR_VER%" "%NEW_VER%" ^
    package.json ^
    src-tauri\Cargo.toml ^
    src-tauri\tauri.conf.json
if errorlevel 1 (
    echo [ERROR] Failed to update version files
    pause
    exit /b 1
)

:: Sync Cargo.lock if it has the version string
findstr /C:"version = \"%CUR_VER%\"" src-tauri\Cargo.lock >nul 2>&1
if not errorlevel 1 (
    call node scripts\bump-version.cjs "%CUR_VER%" "%NEW_VER%" src-tauri\Cargo.lock
)

:: Sync tauri.properties
if exist "src-tauri\gen\android\tauri.properties" (
    call node scripts\bump-version.cjs "%CUR_VER%" "%NEW_VER%" src-tauri\gen\android\tauri.properties
)

:: Sync module index.js files
for /r "src\modules" %%f in (index.js) do (
    call node scripts\bump-version.cjs "%CUR_VER%" "%NEW_VER%" "%%f"
)

set VERSION=!NEW_VER!

:: Git commit the version bump
echo.
echo Committing version !VERSION! ...
git add -A >nul 2>&1
git commit -m "Bump version to !VERSION!" >nul 2>&1
git push >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Git commit/push failed. Continuing anyway...
)
echo.


:: Tag name
set TAG=v!VERSION!

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

:: Check release keystore
if not exist "src-tauri\amiga-release.keystore" (
    echo [ERROR] Release keystore not found at src-tauri\amiga-release.keystore
    pause
    exit /b 1
)

:: Check keystore properties
if not exist "src-tauri\gen\android\app\keystore.properties" (
    echo [ERROR] keystore.properties not found at src-tauri\gen\android\app\keystore.properties
    pause
    exit /b 1
)

:: Confirm
echo This will build and publish version !VERSION! to GitHub.
echo Tag: !TAG!
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

:: ── Step 3: Android APK build (release-signed) ──
echo [3/4] Building Android APK (arm64-v8a, release-signed)...
call npx tauri android build --target aarch64 --apk
if errorlevel 1 (
    echo [ERROR] Android build failed!
    pause
    exit /b 1
)
echo.

:: ── Step 4: Create GitHub release ──
echo [4/4] Creating GitHub release !TAG! ...

:: Create temp release notes file
set NOTESFILE=%TEMP%\amiga-release-notes-!VERSION!.md

:: Bilingual release notes prompt
echo.
echo ============================================
echo  Enter release notes in Chinese + English
echo  (separate with "---ENGLISH---" on its own line)
echo  Press Enter on empty line to finish.
echo ============================================
echo.
echo Example:
echo   ## v%VERSION%
echo.
echo   新功能：
echo   - ...
echo.
echo   ---ENGLISH---
echo.
echo   ## v%VERSION%
echo.
echo   New features:
echo   - ...
echo.
echo ============================================
echo.

setlocal enabledelayedexpansion
set "line="
(
    for /l %%i in (1,1,100) do (
        set /p "input="
        if "!input!"=="" goto :notes_done
        echo(!input!
    )
) > "%NOTESFILE%"
:notes_done
endlocal

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

:: Android release APK — find any APK in build output
for /r "src-tauri\gen\android\app\build\outputs\apk" %%f in (*-release.apk) do (
    if not "%%f"=="" set ARTIFACTS=!ARTIFACTS! "%%f"
)

if "%ARTIFACTS%"=="" (
    echo [WARNING] No build artifacts found. Creating tag-only release.
)

:: Create GitHub release
gh release create "!TAG!" ^
    --title "v!VERSION!" ^
    --notes-file "!NOTESFILE!" ^
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
echo  Release v!VERSION! published successfully!
echo ============================================
echo.
pause
