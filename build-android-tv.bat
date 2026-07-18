@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  Amiga TV - Android TV ARM64 Build
echo ============================================
echo.

set "VITE_AMIGA_TV=1"
set "AMIGA_TV=1"

echo [1/4] Building TV frontend...
call npm.cmd run build
if %errorlevel% neq 0 goto error
echo.

echo [2/4] Ensuring Android project...
if not exist "src-tauri\gen\android" (
  call npm.cmd run tauri android init
  if %errorlevel% neq 0 goto error
)
echo.

echo [3/4] Applying Android TV manifest and package settings...
node scripts\android-patch.cjs --force
if %errorlevel% neq 0 goto error
echo.

echo [4/4] Building Android TV APK (arm64-v8a)...
call npm.cmd run tauri android build -- --target aarch64 --apk
if %errorlevel% neq 0 goto error

:: Leave the generated Android project in normal phone mode. The APK above
:: is already finalized and keeps its TV manifest and application id.
set "AMIGA_TV="
node scripts\android-patch.cjs >nul

echo.
echo Android TV APK built successfully.
echo Output: src-tauri\gen\android\app\build\outputs\apk
exit /b 0

:error
echo.
echo [ERROR] Android TV build failed.
exit /b 1
