#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

# Kill any existing dev server on port 1430
if lsof -ti:1430 &>/dev/null; then
  echo "Killing process on port 1430..."
  lsof -ti:1430 | xargs kill -9 2>/dev/null || true
fi

echo "[Amiga] Starting Android dev server on port 1430..."
# Tauri dev host (for Android device to reach the dev server)
export TAURI_DEV_HOST="$(hostname -I | awk '{print $1}')"
echo "[Amiga] Using TAURI_DEV_HOST=$TAURI_DEV_HOST"

# Ensure Android project exists and custom sources are patched
if [ ! -d "src-tauri/gen/android" ]; then
  npx tauri android init
fi
node scripts/android-patch.cjs

npx tauri android dev
