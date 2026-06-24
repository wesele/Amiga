@echo off
cd /d "%~dp0"
echo ============================================
echo  Amiga - Android ARM-v8 Build
echo ============================================
echo.

:: Quick check: skip frontend build if dist/ is newer than src/
echo [1/4] Building frontend (if needed)...
if not exist "dist\index.html" goto build_fe
forfiles /p src /s /m *.js /d +01/01/2023 2>nul | findstr . >nul
if %errorlevel% equ 0 goto build_fe
forfiles /p src /s /m *.vue /d +01/01/2023 2>nul | findstr . >nul
if %errorlevel% equ 0 goto build_fe
echo Frontend unchanged since last build, skipping.
goto skip_fe

:build_fe
call npm run build
if %errorlevel% neq 0 (
  echo [ERROR] Frontend build failed!
  pause
  exit /b 1
)
:skip_fe
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
