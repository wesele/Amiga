@echo off
cd /d "%~dp0"

:: ============================================================
::  Amiga - Android x86_64 release build + emulator install
::
::  What this does
::  --------------
::  1) Sets JDK / SDK / NDK env vars.
::  2) Ensures `src-tauri/gen/android` exists (runs `tauri android
::     init` on first run only).
::  3) Syncs custom Kotlin sources into gen/ via
::     `scripts/android-patch.cjs`.
::  4) Builds a signed, minified x86_64 release APK only, then installs it
::     on the connected emulator with `adb install -r`.
::
::  Build semantics
::  ---------------
::  - This is intentionally a release build: there is no Vite HMR or file
::    watcher. Re-run it after frontend, Rust, or Kotlin changes.
::  - Limiting the build to x86_64 avoids compiling ARM libraries that an
::    x86_64 Android emulator cannot use.
::
:: ============================================================

set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Android\sdk
set NDK_HOME=C:\Android\sdk\ndk\27.0.12077973
set PATH=C:\msys64\mingw64\bin;%PATH%

:: A connected emulator is required because the release APK is installed at
:: the end of this script. For another ABI, use the release build script.
echo [Amiga] Checking for connected devices...
"%ANDROID_HOME%\platform-tools\adb.exe" devices 2>nul | findstr "device$" >nul
if %errorlevel% equ 0 goto :device_ready
echo [ERROR] No Android emulator or device is connected.
echo         Start the x86_64 emulator, then re-run this script.
pause
exit /b 1

:device_ready

:: Ensure Android project tree exists (one-time)
if not exist "src-tauri\gen\android" (
  echo [Amiga] Initializing Android project ^(first run^)...
  call npm run tauri android init
  if %errorlevel% neq 0 (
    echo [ERROR] tauri android init failed!
    pause
    exit /b 1
  )
)

:: Sync custom Kotlin sources and release rules. NB: idempotent -- safe on
:: every build. Without this, a fresh `tauri android init` would clobber
:: MainActivity.kt.
echo [Amiga] Applying Android patch...
node scripts\android-patch.cjs
if %errorlevel% neq 0 (
  echo [ERROR] Android patch failed!
  echo [Amiga] If gen/ just ^(re^)generated, try `node scripts/android-patch.cjs --force`.
  pause
  exit /b 1
)

:: If the emulator holds an APK signed by a different keystore, the install
:: below will fail with INSTALL_FAILED_UPDATE_INCOMPATIBLE. In that case do
:: a one-shot uninstall (this wipes app data):
::
:: "adb uninstall com.idioma.app" >nul 2>&1

echo [Amiga] Building signed x86_64 release APK...
npx tauri android build --target x86_64 --apk
set RC=%errorlevel%

echo.
if %RC% neq 0 (
  echo [Amiga] Android release build exited with code %RC%.
  pause
  exit /b %RC%
)

set "APK=src-tauri\gen\android\app\build\outputs\apk\x86_64\release\app-x86_64-release.apk"
if not exist "%APK%" (
  echo [ERROR] Expected x86_64 release APK was not found:
  echo         %APK%
  pause
  exit /b 1
)

echo [Amiga] Installing x86_64 release APK on the connected emulator...
"%ANDROID_HOME%\platform-tools\adb.exe" install -r "%APK%"
if %errorlevel% neq 0 (
  echo [ERROR] APK install failed. If the installed app has another signing key,
  echo         uninstall it once with: adb uninstall com.idioma.app
  pause
  exit /b 1
)

echo [Amiga] Done: %APK%
pause
