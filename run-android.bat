@echo off
cd /d "%~dp0"

:: For physical Android device (not emulator), uncomment and set your LAN IP:
:: set TAURI_DEV_HOST=192.168.31.9
:: set VITE_PORT=1430
:: set VITE_HMR_PORT=1431

set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Android\sdk
set NDK_HOME=C:\Android\sdk\ndk\27.0.12077973
set PATH=C:\msys64\mingw64\bin;%PATH%

:: Check if port 1420 is already in use
echo [Amiga] Checking port 1420...
netstat -aon | findstr :1420 >nul 2>&1
if %errorlevel% equ 0 (
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1420') do (
    taskkill /f /pid %%a 2>nul
  )
  timeout /t 2 >nul
)

:: Ensure Android project exists
if not exist "src-tauri\gen\android" (
  echo [Amiga] Initializing Android project...
  call npm run tauri android init
  if %errorlevel% neq 0 (
    echo [ERROR] tauri android init failed!
    pause
    exit /b 1
  )
)

:: Sync custom Android sources (insets bridge + translate)
node scripts\android-patch.cjs
if %errorlevel% neq 0 (
  echo [ERROR] Android patch failed!
  pause
  exit /b 1
)

echo [Amiga] Starting Android dev server...
npx tauri android dev
pause
