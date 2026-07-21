@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  Amiga TV - Android TV release APK
echo ============================================
setlocal EnableDelayedExpansion

:: --- FORCE TV MODE ENVIRONMENT ---
set "VITE_AMIGA_TV=1"
set "AMIGA_TV=1"

echo [1/4] Building TV frontend...
:: Clean dist to ensure no caching
if exist "dist" rmdir /s /q "dist"
call npm.cmd run build
if %errorlevel% neq 0 goto error
echo.

echo [2/4] Ensuring Android project...
if not exist "src-tauri\gen\android" (
  call npm.cmd run tauri android init
  if %errorlevel% neq 0 goto error
)
echo.

echo [3/4] Patching Android project for TV...
node scripts\android-patch.cjs --force
if %errorlevel% neq 0 goto error
echo.

echo [4/4] Building Android TV APK (armeabi-v7a)...
:: Let Gradle clean its own outputs so its incremental task state stays consistent.
call "src-tauri\gen\android\gradlew.bat" -p "src-tauri\gen\android" :app:clean
if %errorlevel% neq 0 goto error

call npm.cmd run tauri android build -- --target armv7 --apk
if %errorlevel% neq 0 goto error

:: Restore phone mode for future phone builds
set "AMIGA_TV="
node scripts\android-patch.cjs >nul

echo.
echo ========================================================
echo Android TV APK built successfully.
echo Please install using:
echo adb install -r -g src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk
echo ========================================================
exit /b 0

:error
echo.
echo [ERROR] Android TV build failed.
exit /b 1
