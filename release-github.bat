@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: Read current version from package.json
for /f "usebackq tokens=* delims=" %%a in (`node -p "require('./package.json').version"`) do set "curVer=%%a"

:: Parse major.minor.patch and strip leading zeros for /a arithmetic
for /f "tokens=1-3 delims=." %%a in ("%curVer%") do (
    set "major=%%a"
    set "minor=%%b"
    set "patch=%%c"
)
:: Remove leading zero so set /a doesn't treat as octal
if "%patch:~0,1%"=="0" set "patch=%patch:~1%"
if "%patch%"=="" set "patch=0"
set /a "newPatch=patch+1"
set "newVer=%major%.%minor%.%newPatch%"

echo Bumping version: %curVer% -^> %newVer%

:: Sync version files
node scripts/bump-version.cjs --set-version "%newVer%"
if !errorlevel! neq 0 (
    echo ERROR: bump-version.cjs failed
    exit /b 1
)

:: Commit all local changes + version bump
git add -A
git diff --cached --quiet
if !errorlevel! equ 0 (
    echo Nothing to commit, skipping commit.
) else (
    git commit -m "Bump version to %newVer%"
    if !errorlevel! neq 0 (
        echo ERROR: git commit failed
        exit /b 1
    )
)

:: Delete local tag if it already exists (e.g. stale from previous run)
git tag -d "v%newVer%" 2>nul

:: Tag and push
git tag "v%newVer%"
git push --set-upstream origin HEAD
git push origin "v%newVer%"

echo.
echo Done. Tag v%newVer% created and pushed.
pause
