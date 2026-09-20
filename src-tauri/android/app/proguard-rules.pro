# Keep MainActivity and all @JavascriptInterface bridge methods in release
# builds. Anonymous bridge objects (e.g. __amigaExternal.openUrl) can be
# stripped by R8 when only referenced from addJavascriptInterface.
-keep class com.idioma.app.MainActivity { *; }
-keep class com.idioma.app.KokoroTtsEngine { *; }
-keep class dev.ffmpegkit.kokoro.** { *; }
-keep class ai.onnxruntime.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface