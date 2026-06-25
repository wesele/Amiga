@echo off
cd /d "%~dp0"

:: ============================================================
::  Amiga - Android dev loop (Tauri android dev)
::
::  What this does
::  --------------
::  1) Sets JDK / SDK / NDK env vars.
::  2) Ensures `src-tauri/gen/android` exists (runs `tauri android
::     init` on first run only).
::  3) Syncs custom Kotlin sources into gen/ via
::     `scripts/android-patch.cjs` (also injects the debug-signing
::     snippet so dev APKs reuse the release keystore).
::  4) Starts `tauri android dev` with:
::        --target x86_64         (emulator only; physical arm64
::                                 device? See comment block below)
::        --exit-on-panic        (Rust panic doesn't hang the watcher)
::
::  Loop semantics (very important for AI-driven dev)
::  -------------------------------------------------
::  - Vite dev server runs **on this PC** at http://localhost:1420.
::    Editing Vue/CSS/JS pushes HMR straight to the emulator's
::    WebView -- **no Rust recompile, no APK reinstall**.
::  - Editing Rust triggers an incremental cargo build (~5-20 s on
::    a warm cache) and an automatic `adb install -r` of the new
::    APK, preserving app data.
::  - Editing Kotlin requires editing the **tracked** source at
::    `src-tauri/android/...` (NOT the gen/ copy). Re-run this
::    script once to re-sync + rebuild. There's no live HMR for
::    Kotlin.
::
::  Physical ARM device
::  --------------------
::  This .bat targets the x86_64 emulator. To dev on a physical
::  arm64 device (aarch64), set the env vars below and replace
::  `--target x86_64` with `--target aarch64`, plus expose the dev
::  server on the LAN. See the commented block further down.
:: ============================================================

set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Android\sdk
set NDK_HOME=C:\Android\sdk\ndk\27.0.12077973
set PATH=C:\msys64\mingw64\bin;%PATH%

:: For a physical device on the LAN, uncomment and set:
::   set TAURI_DEV_HOST=192.168.31.9
::   set VITE_PORT=1430
::   set VITE_HMR_PORT=1431
:: And change the --target below to aarch64.

:: Sanity-check: at least one device / emulator must be visible to
:: adb, otherwise `tauri android dev` will hang waiting for one.
echo [Amiga] Checking for connected devices...
"%ANDROID_HOME%\platform-tools\adb.exe" devices 2>nul | findstr "device$" >nul
if %errorlevel% equ 0 goto :device_ready

:: No device connected -- try to launch the first available AVD.
echo [Amiga] No device connected. Looking for available AVDs...
set "EMULATOR_CMD=%ANDROID_HOME%\emulator\emulator.exe"
if exist "%EMULATOR_CMD%" goto :emulator_found
echo [ERROR] No device connected and emulator.exe not found at:
echo         %EMULATOR_CMD%
echo [Amiga] Create an AVD via Android Studio AVD Manager (API 24+, x86_64)
echo [Amiga] then re-run this script.
pause
exit /b 1
:emulator_found

:: Grab the first AVD name (skip blank lines).
set "FIRST_AVD="
for /f "usebackq delims=" %%a in (`"%EMULATOR_CMD%" -list-avds 2^>nul`) do (
  if not defined FIRST_AVD set "FIRST_AVD=%%a"
)
if defined FIRST_AVD goto :avd_found
echo [ERROR] No AVD found. Create one via Android Studio AVD Manager (API 24+, x86_64).
pause
exit /b 1
:avd_found

:: Launch emulator in the background (no -no-window flag; user needs to
:: see the emulator) with -no-audio to reduce noise.
echo [Amiga] Launching AVD: %FIRST_AVD%
start "" /b "%EMULATOR_CMD%" -avd %FIRST_AVD% -no-audio >nul 2>&1

:: Wait for the device to appear in `adb devices` (boot may still be
:: in progress, but `tauri android dev` can handle that).
echo [Amiga] Waiting for emulator to register with adb...
set _WAIT=0
:_wait_loop
"%ANDROID_HOME%\platform-tools\adb.exe" devices 2>nul | findstr "device$" >nul
if %errorlevel% equ 0 goto :device_ready
set /a _WAIT+=1
if %_WAIT% geq 60 (
  echo [ERROR] Timed out waiting for emulator (60 s).
  echo [Amiga] Check if the emulator window appeared, or try launching it manually.
  pause
  exit /b 1
)
timeout /t 1 >nul
goto :_wait_loop

:device_ready

:: Pick the ABI that matches what's connected: emulator usually
:: reports x86_64; a physical Pixel reports arm64-v8a. The .bat below
:: defaults to x86_64 (emulator) -- change TARGET_ABI to build for
:: a physical device.
set TARGET_ABI=x86_64

:: Kill anything still running on the Vite port so the new dev
:: server can bind cleanly.
echo [Amiga] Checking port 1420...
netstat -aon | findstr :1420 >nul 2>&1
if %errorlevel% equ 0 (
  for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1420') do (
    taskkill /f /pid %%a 2>nul
  )
  timeout /t 2 >nul
)

:: Ensure Android project tree exists (one-time)
if not exist "src-tauri\gen\android" (
  echo [Amiga] Initializing Android project (first run)...
  call npm run tauri android init
  if %errorlevel% neq 0 (
    echo [ERROR] tauri android init failed!
    pause
    exit /b 1
  )
)

:: Sync custom Kotlin sources + inject debug-signing patch.
:: NB: idempotent -- safe to run every dev start. Without this, a
:: fresh `tauri android init` would clobber MainActivity.kt.
echo [Amiga] Applying Android patch (Kotlin sources + debug signing)...
node scripts\android-patch.cjs
if %errorlevel% neq 0 (
  echo [ERROR] Android patch failed!
  echo [Amiga] If gen/ just (re)generated, try `node scripts/android-patch.cjs --force`.
  pause
  exit /b 1
)

:: If the emulator already holds an APK signed by a *different*
:: keystore (e.g. someone manually installed an APK signed by a
:: totally different key), `adb install -r` inside tauri android
:: dev will fail with INSTALL_FAILED_UPDATE_INCOMPATIBLE and dev
:: watch will hang. Our own debug+release builds share
:: `amiga-release.keystore` so they never trip this -- but if you
:: have been installing foreign APKs you may need a one-shot
:: uninstall. Uncomment the line below to force a clean install
:: (WARNING: wipes app data -- DB, wizard state, vocab progress).
::
:: "adb uninstall com.idioma.app" >nul 2>&1

echo [Amiga] Starting Android dev server on %TARGET_ABI%...
echo [Amiga] Frontend:    http://localhost:1420 (HMR to emulator WebView)
echo [Amiga] Rust/Kotlin: incremental cargo build + adb install -r on every edit
echo.

npx tauri android dev --target %TARGET_ABI% --exit-on-panic
set RC=%errorlevel%

echo.
if %RC% neq 0 (
  echo [Amiga] tauri android dev exited with code %RC%.
  echo [Amiga] Common causes:
  echo   - Rust panic (see log above). Fix the source and re-run.
  echo   - INSTALL_FAILED_UPDATE_INCOMPATIBLE -- re-run this script
  echo     (it pre-uninstalls; resigned-by-us APKs won't trigger this).
  echo   - Emulator died -- restart it and re-run.
)
pause