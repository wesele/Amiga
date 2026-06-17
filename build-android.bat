@echo off
cd /d "%~dp0"
echo ============================================
echo  Amiga - Android ARM-v8 Build
echo ============================================
echo.
echo [1/3] Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b 1
)
echo.
echo [2/3] Building Android APK (arm64-v8a)...
echo.
npm run tauri android build -- --target aarch64 --apk
if %errorlevel% neq 0 (
    echo [ERROR] Android build failed!
    pause
    exit /b 1
)
echo.
echo [3/3] Done!
echo.
echo APK output: src-tauri\gen\android\app\build\outputs\apk
echo.
pause
