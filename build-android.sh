#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
echo "============================================"
echo " Amiga - Android ARM-v8 Build"
echo "============================================"

export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo ""
echo "[1/4] Building frontend..."
npm run build
echo ""

echo "[2/4] Ensuring Android project (tauri android init)..."
if [ ! -d "src-tauri/gen/android" ]; then
  npx tauri android init
fi
echo ""

echo "[3/4] Patching custom Android sources (insets bridge + translate)..."
node scripts/android-patch.cjs
echo ""

echo "[4/4] Building Android APK (arm64-v8a)..."
echo ""
npx tauri android build --target aarch64 --apk
echo ""

echo "Done!"
echo ""
echo "APK output: src-tauri/gen/android/app/build/outputs/apk"
