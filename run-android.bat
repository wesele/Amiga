@echo off
set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Android\sdk
set NDK_HOME=C:\Android\sdk\ndk\27.0.12077973
set TAURI_DEV_HOST=192.168.31.9
set VITE_PORT=1430
set VITE_HMR_PORT=1431
set PATH=C:\msys64\mingw64\bin;%PATH%

echo Checking for existing dev server on port 1430...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1430') do (
  echo Killing process %%a...
  taskkill /f /pid %%a 2>nul
)

cd /d "%~dp0"
echo [Amiga] Starting Android dev server on port 1430...
npx tauri android dev
pause
