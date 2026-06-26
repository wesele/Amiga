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
::        --exit-on-panic        (Rust panic doesn't hang the watcher)
::
::     By default, Tauri chooses the connected Android device. Set
::     AMIGA_ANDROID_DEVICE=<device-or-avd-name> if you need to force one.
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
::  For a physical arm64 device, set the env vars below, set
::  AMIGA_ANDROID_DEVICE if Tauri does not pick it automatically,
::  and expose the dev server on the LAN. See the commented block
::  further down.
:: ============================================================

set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Android\sdk
set NDK_HOME=C:\Android\sdk\ndk\27.0.12077973
set PATH=C:\msys64\mingw64\bin;%PATH%

:: For a physical device on the LAN, uncomment and set:
::   set TAURI_DEV_HOST=192.168.31.9
::   set VITE_PORT=1430
::   set VITE_HMR_PORT=1431
::   set AMIGA_ANDROID_DEVICE=<adb-device-name>

set "DEVICE_ARG="
if defined AMIGA_ANDROID_DEVICE set "DEVICE_ARG=%AMIGA_ANDROID_DEVICE%"

:: Sanity-check: at least one device / emulator must be visible to
:: adb. If none is found, check whether local AVDs exist, then let Tauri
:: handle device selection. Set AMIGA_ANDROID_DEVICE to skip Tauri's
:: device picker when you know exactly which device or AVD to use.
echo [Amiga] Checking for connected devices...
"%ANDROID_HOME%\platform-tools\adb.exe" devices 2>nul | findstr "device$" >nul
if %errorlevel% equ 0 goto :device_probe_done

:: No device connected -- check whether at least one local AVD exists.
echo [Amiga] No device connected. Looking for available AVDs...
set "EMULATOR_CMD=%ANDROID_HOME%\emulator\emulator.exe"
if exist "%EMULATOR_CMD%" goto :emulator_found
echo [WARN] No device connected and emulator.exe not found at:
echo         %EMULATOR_CMD%
echo [Amiga] Continuing anyway; Tauri may wait for a device.
goto :device_probe_done
:emulator_found

:: Grab the first AVD name (skip blank lines).
set "FIRST_AVD="
for /f "usebackq delims=" %%a in (`"%EMULATOR_CMD%" -list-avds 2^>nul`) do (
  if not defined FIRST_AVD set "FIRST_AVD=%%a"
)
if defined FIRST_AVD goto :avd_found
for %%a in ("%USERPROFILE%\.android\avd\*.ini") do (
  if not defined FIRST_AVD set "FIRST_AVD=%%~na"
)
if defined FIRST_AVD goto :avd_found
echo [WARN] No AVD found. Continuing anyway; Tauri may wait for a device.
echo [Amiga] To enable auto-launch, create an AVD via Android Studio AVD Manager.
goto :device_probe_done
:avd_found

echo [Amiga] Found AVD: %FIRST_AVD%
if not defined DEVICE_ARG echo [Amiga] Tauri will prompt for a device. Set AMIGA_ANDROID_DEVICE=%FIRST_AVD% to skip the prompt.
goto :device_probe_done

:device_probe_done

:: Kill anything still running on the Vite port so the new dev
:: server can bind cleanly.
echo [Amiga] Checking port 1420...
set "KILLED_PORT_1420="
for /f "tokens=5" %%a in ('netstat -aon -p tcp ^| findstr /r /c:":1420 .*LISTENING"') do (
  taskkill /f /pid %%a 2>nul
  set "KILLED_PORT_1420=1"
)
if defined KILLED_PORT_1420 (
  timeout /t 2 >nul
)

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

:: Sync custom Kotlin sources + inject debug-signing patch.
:: NB: idempotent -- safe to run every dev start. Without this, a
:: fresh `tauri android init` would clobber MainActivity.kt.
echo [Amiga] Applying Android patch ^(Kotlin sources + debug signing^)...
node scripts\android-patch.cjs
if %errorlevel% neq 0 (
  echo [ERROR] Android patch failed!
  echo [Amiga] If gen/ just ^(re^)generated, try `node scripts/android-patch.cjs --force`.
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

if defined DEVICE_ARG (
  echo [Amiga] Starting Android dev server on %DEVICE_ARG%...
) else (
  echo [Amiga] Starting Android dev server with Tauri device auto-detection...
)
echo [Amiga] Frontend:    http://localhost:1420 ^(HMR to emulator WebView^)
echo [Amiga] Rust/Kotlin: incremental cargo build + adb install -r on every edit
echo.

npx tauri android dev %DEVICE_ARG% --exit-on-panic
set RC=%errorlevel%

echo.
if %RC% neq 0 (
  echo [Amiga] tauri android dev exited with code %RC%.
  echo [Amiga] Common causes:
  echo   - Rust panic ^(see log above^). Fix the source and re-run.
  echo   - INSTALL_FAILED_UPDATE_INCOMPATIBLE -- re-run this script
  echo     ^(it pre-uninstalls; resigned-by-us APKs won't trigger this^).
  echo   - Emulator died -- restart it and re-run.
)
pause
