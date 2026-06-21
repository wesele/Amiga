@echo off
cd /d "%~dp0"
echo ============================================
echo  Amiga - Android ARM-v8 Build
echo ============================================
echo.

echo [1/4] Building frontend...
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Frontend build failed!
  pause
  exit /b 1
)
echo.

echo [2/4] Ensuring Android project (tauri android init)...
if not exist "src-tauri\gen\android" (
  npm run tauri android init
  if %errorlevel% neq 0 (
    echo [ERROR] tauri android init failed!
    pause
    exit /b 1
  )
)
echo.

echo [3/4] Patching custom Android sources (insets bridge + translate)...
node scripts\android-patch.cjs
if %errorlevel% neq 0 (
  echo [ERROR] Android patch failed!
  pause
  exit /b 1
)
echo.

echo [4/4] Building Android APK (arm64-v8a)...
echo.
npm run tauri android build -- --target aarch64 --apk
if %errorlevel% neq 0 (
  echo [ERROR] Android build failed!
  pause
  exit /b 1
)
echo.
echo Done!
echo.
echo APK output: src-tauri\gen\android\app\build\outputs\apk
echo.
pause
