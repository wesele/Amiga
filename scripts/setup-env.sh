# Source this file to set up Android dev environment:
#   source scripts/setup-env.sh
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "[env] JAVA_HOME=$JAVA_HOME"
echo "[env] ANDROID_HOME=$ANDROID_HOME"
echo "[env] NDK_HOME=$NDK_HOME"
