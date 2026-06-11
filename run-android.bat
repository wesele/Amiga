@echo off
set JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
set ANDROID_HOME=C:\Android\sdk
set NDK_HOME=C:\Android\sdk\ndk\27.0.12077973
set PATH=C:\msys64\mingw64\bin;%PATH%

cd /d "%~dp0"
npx tauri android dev
pause
