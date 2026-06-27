@echo off
cd /d "%~dp0"

:: Read current version from package.json
for /f "usebackq tokens=* delims=" %%a in (`node -p "require('./package.json').version"`) do set "curVer=%%a"

:: Bump patch version
for /f "tokens=1-3 delims=." %%a in ("%curVer%") do set "major=%%a" & set "minor=%%b" & set "patch=%%c"
set /a "newPatch=patch+1"
set "newVer=%major%.%minor%.%newPatch%"

echo Bumping version: %curVer% -^> %newVer%

:: Sync version files
node scripts/bump-version.cjs --set-version "%newVer%"
if %errorlevel% neq 0 exit /b %errorlevel%

:: Commit all local changes + version bump
git add -A
git commit -m "Bump version to %newVer%"

:: Tag and push
git tag "v%newVer%"
git push
git push origin "v%newVer%"

echo.
echo Done. Tag v%newVer% created and pushed.
pause
