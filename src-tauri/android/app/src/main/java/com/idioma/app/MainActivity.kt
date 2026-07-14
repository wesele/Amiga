package com.idioma.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.media.AudioAttributes
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.view.ActionMode
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.json.JSONObject

/**
 * Custom activity for Amiga.
 *
 * Three things happen here that the stock [TauriActivity] does not do:
 *
 * 1. **Safe area via JS bridge, not WebView padding.** We read the
 *    real [WindowInsetsCompat] for `systemBars()` and `ime()` and
 *    pass the values to the frontend via `window.__amigaSetInsets(top,
 *    bottom, left, right)`. The frontend updates its `--safe-*` CSS
* custom properties, which the layout (`#app` padding-top and the
     *    `.bottom-nav-safe` strip) already uses. The inset listener
     *    fires before the WebView has loaded the page, so the initial
     *    values are stashed on `window.__amigaPendingInsets` and the
     *    JS side picks them up once it has registered
     *    `__amigaSetInsets`. This is the same mechanism that works on
     *    iOS via `env(safe-area-inset-*)`, so both platforms share
     *    one code path.
 *
 * 2. **Hierarchical back navigation.** Android's back button defaults
 *    to `history.back()`, which goes to the *previous URL* — that is
 *    why "返回" sometimes loops or lands on the wrong screen. We
 *    intercept the back press, ask the page to compute the *parent*
 *    route from the current Vue Router entry, and push that. If the
 *    current route has no parent, we finish() the activity. The page
 *    publishes `window.__amigaGoBack()` which returns either
 *    `"navigated"` or `"at-root"`.
 *
 * 3. **Long-press "Amiga" menu item in the WebView text-selection
 *    floating toolbar.** We add it to the existing native selection menu,
 *    preserving the OEM system menu and its layout. The page registers
 *    `window.__amigaTranslateSelection(text)` and we dispatch to it when the
 *    user taps the item.
 */
class MainActivity : TauriActivity() {
    private var mainWebView: WebView? = null
    private var translateCallback: TranslateWindowCallback? = null
    private var activeSelectionActionMode: ActionMode? = null
    private var apkDownloadReceiver: BroadcastReceiver? = null
    private val pendingApkDownloads = mutableMapOf<Long, File>()
    private var textToSpeech: TextToSpeech? = null
    private var textToSpeechReady = false
    private var ttsPendingChunks: MutableList<String> = mutableListOf()
    private var ttsSessionWebView: WebView? = null
    private val ttsHandler = Handler(Looper.getMainLooper())
    private var ttsWatchdog: Runnable? = null
    private var ttsInitPending: Triple<WebView, String, String>? = null
    private var ttsInitGeneration = 0

    // Disable the WryActivity's stock back navigation (which calls
    // mWebView.goBack()). We install our own hierarchical back handler
    // in installBackNavigation() below; running both produces
    // contradictory behavior (the page pushes a parent route AND
    // history.back() runs in parallel, often landing on the wrong
    // screen and sometimes looping).
    override val handleBackNavigation: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        // Public-storage backup is optional. OEM MediaStore implementations
        // can throw while resolving duplicate names or stale URIs, and no
        // backup failure may prevent the Activity from reaching onCreate.
        runOptionalStartupTask("restore MediaStore backup") {
            tryRestoreFromMediaStoreBackup()
        }
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.navigationBarColor = Color.TRANSPARENT
    }

    private fun runOptionalStartupTask(name: String, task: () -> Unit) {
        try {
            task()
        } catch (t: Throwable) {
            Log.w(TAG, "Optional startup task failed: $name", t)
        }
    }

    @SuppressLint("NewApi")
    override fun onWebViewCreate(webView: WebView) {
        mainWebView = webView

        // Neither legacy-directory preparation nor backup export is required
        // to render the Activity. Keep OEM storage providers off the launch
        // thread; by this point Rust has opened/created the private database.
        Thread({
            runOptionalStartupTask("prepare legacy backup directory") {
                ensurePersistentDataDir()
            }
            runOptionalStartupTask("export MediaStore backup") {
                exportBackupToMediaStore()
            }
        }, "amiga-backup").start()

        // 1) Safe-area bridge: pass the real systemBars + IME inset
        //    values to the frontend via __amigaSetInsets, so CSS
        //    custom properties --safe-* keep content out of the
        //    system bar / keyboard area.
        installSafeAreaPadding(webView)

        // 2) Hierarchical back navigation: the system back press goes
        //    through __amigaGoBack() and finishes the activity when
        //    the current route has no parent.
        installBackNavigation(webView)

        // 3) Long-press text selection: add Amiga to the native menu.
        webView.setOnLongClickListener(null)
        webView.isLongClickable = true
        webView.isHapticFeedbackEnabled = true
        translateCallback = TranslateWindowCallback(webView)
        // 4) Share bridge: expose __amigaShare.shareText() so the
        //    frontend can trigger the native Android share sheet.
        installShareBridge(webView)

        // 5) External link bridge: open http(s) links in the user's
        //    system browser instead of creating another in-app WebView.
        installExternalLinkBridge(webView)

        // 6) TTS bridge: use Android's native language-aware engine
        //    instead of WebView speechSynthesis, which may ignore lang.
        installTtsBridge(webView)

        // 7) Update bridge: download a new APK and hand it to the
        //    package installer so Android users can upgrade in-place.
        installUpdaterBridge(webView)
    }

    override fun onDestroy() {
        mainWebView = null
        translateCallback = null
        activeSelectionActionMode = null
        apkDownloadReceiver?.let { unregisterReceiver(it) }
        apkDownloadReceiver = null
        pendingApkDownloads.clear()
        cancelTtsWatchdog()
        ttsPendingChunks.clear()
        ttsSessionWebView = null
        ttsInitPending = null
        shutdownTtsEngine()
        super.onDestroy()
    }

    /** Add Amiga to the OEM-created menu and retain the mode for cleanup. */
    override fun onActionModeStarted(mode: ActionMode) {
        Log.d(TAG, "onActionModeStarted type=${mode.type} tag=${mode.tag}")
        super.onActionModeStarted(mode)
        if (mode.type == ActionMode.TYPE_FLOATING) {
            activeSelectionActionMode = mode
            translateCallback?.injectInto(mode)
        }
    }

    override fun onActionModeFinished(mode: ActionMode) {
        if (activeSelectionActionMode === mode) {
            activeSelectionActionMode = null
        }
        super.onActionModeFinished(mode)
    }

    override fun onStop() {
        // Floating selection toolbars are tied to the current Activity window.
        // Never let an OEM restore one after that window has entered the
        // background; a fresh selection will create a fresh wrapped callback.
        try {
            activeSelectionActionMode?.finish()
        } catch (t: Throwable) {
            // OEM floating toolbars may already have detached their window.
            // Cleanup must never prevent the Activity itself from stopping.
            Log.w(TAG, "Failed to finish selection ActionMode during onStop", t)
        }
        activeSelectionActionMode = null
        super.onStop()
    }

    /**
     * Passes the system bar insets to the WebView's HTML layer by
     * calling `window.__amigaSetInsets(top, bottom, left, right)` so
     * the frontend can update its `--safe-*` CSS custom properties.
     *
     * Previously we used WebView.setPadding() to shrink the viewport,
     * but that approach is unreliable across Tauri WebView setups.
     * Instead we now give the real inset values to the CSS layer
     * (which already handles safe areas via `env()` on iOS).
     *
     * The inset listener fires before the page JS has loaded (the
     * first `requestApplyInsets()` call happens in `onWebViewCreate`,
     * before any page URL has been loaded). To bridge this race, we
     * stash the values on `window.__amigaPendingInsets` and the JS
     * side replays them once it has registered `__amigaSetInsets`.
     * Subsequent calls (keyboard show/hide) go straight to
     * `__amigaSetInsets`.
     *
     * IME wins over the system nav bar at the bottom (whichever is
     * taller is what we send), so the chat input stays above the
     * keyboard when it's up and above the nav bar when it isn't.
     */
    private fun installSafeAreaPadding(webView: WebView) {
        val content = window.decorView.findViewById<View>(android.R.id.content) ?: return
        ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val bottom = maxOf(bars.bottom, ime.bottom)
            // Store the values on window.__amigaPendingInsets so the
            // frontend JS can pick them up once it's ready. Also call
            // __amigaSetInsets if it's already defined (subsequent
            // insets after the page has loaded).
            val js = "window.__amigaPendingInsets=[${bars.top},${bottom},${bars.left},${bars.right}];if(window.__amigaSetInsets)window.__amigaSetInsets(${bars.top},${bottom},${bars.left},${bars.right})"
            Log.d(TAG, "safe-area: $js")
            webView.evaluateJavascript(js, null)
            insets
        }
        content.requestApplyInsets()

        // Expose a JS bridge so the frontend can explicitly request
        // a re-dispatch of insets once its JS has loaded. This avoids
        // the race where the inset listener fires during about:blank
        // and the values are lost on page navigation.
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun requestInsets() {
                // addJavascriptInterface methods run on a WebView
                // thread, NOT the main thread. requestApplyInsets()
                // must happen on the main thread.
                content.post { content.requestApplyInsets() }
            }
        }, "__amigaInsets")
    }

    /**
     * Wire the system back press to the page's `__amigaGoBack()`.
     * The page returns `"navigated"` (we leave the page to do the
     * navigation) or `"at-root"` (we finish the activity).
     *
     * On Android 13+ (API 33+) we use the modern
     * [OnBackPressedCallback] path so the OS "predictive back" gesture
     * still works. On older API levels, the same callback is delivered
     * via the deprecated `onBackPressed()` shim, which still works.
     */
    private fun installBackNavigation(webView: WebView) {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(function(){try{return window.__amigaGoBack ? window.__amigaGoBack() : 'at-root';}catch(e){return 'at-root';}})()",
                ) { raw ->
                    val result = raw?.trim()?.removeSurrounding("\"")
                    Log.d(TAG, "back: __amigaGoBack -> $result")
                    if (result == "at-root") {
                        // At a top-level route: let the activity finish.
                        // Using finish() (rather than moveTaskToBack) so
                        // the user gets the standard Android exit feel.
                        this@MainActivity.finish()
                    }
                    // For "navigated" the page has already pushed the
                    // parent route; we don't need to do anything.
                }
            }
        })
    }

    /**
     * Install a JS bridge that exposes `window.__amigaShare.shareText(text)`.
     * When the frontend calls it, we create an ACTION_SEND intent so the
     * user can pick any app (WeChat, ChatGPT, etc.) to receive the text.
     */
    private fun installShareBridge(webView: WebView) {
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun shareText(text: String) {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                val chooser = Intent.createChooser(intent, null).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                this@MainActivity.runOnUiThread {
                    this@MainActivity.startActivity(chooser)
                }
            }
        }, "__amigaShare")
    }

    /**
     * Install a native Android TTS bridge. The WebView implementation of
     * speechSynthesis can ignore the requested voice and fall back to the
     * system default (often English). Android TextToSpeech lets us set and
     * validate the exact Locale before speaking, so Spanish news uses the
     * Spanish engine when it is installed.
     */
    private fun installTtsBridge(webView: WebView) {
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun speak(text: String, langTag: String): String {
                if (text.isBlank()) return "empty"
                return runOnUiThreadAndWait(8) {
                    speakNativeText(webView, text, langTag)
                }
            }

            @JavascriptInterface
            fun stop() {
                this@MainActivity.runOnUiThread {
                    clearTtsSession()
                    textToSpeech?.stop()
                }
            }
        }, "__amigaTts")
    }

    private fun runOnUiThreadAndWait(timeoutSeconds: Long, block: () -> String): String {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            return block()
        }
        val latch = CountDownLatch(1)
        var result = "failed"
        this@MainActivity.runOnUiThread {
            try {
                result = block()
            } finally {
                latch.countDown()
            }
        }
        return if (latch.await(timeoutSeconds, TimeUnit.SECONDS)) result else "timeout"
    }

    private fun configureTtsEngine(engine: TextToSpeech) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            engine.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
        }
    }

    private fun cancelTtsWatchdog() {
        ttsWatchdog?.let { ttsHandler.removeCallbacks(it) }
        ttsWatchdog = null
    }

    private fun scheduleTtsWatchdog(webView: WebView) {
        cancelTtsWatchdog()
        val watchdog = Runnable {
            if (ttsSessionWebView == null) return@Runnable
            Log.w(TAG, "TTS watchdog: playback did not start within 4s")
            clearTtsSession()
            notifyTtsError(webView, "playback-timeout")
        }
        ttsWatchdog = watchdog
        ttsHandler.postDelayed(watchdog, 4000)
    }

    private fun preferredTtsEngines(): List<String?> {
        // ColorOS/Oppo often defaults to com.yuemeng.speechsuite. Prefer Google
        // when installed, then explicit ColorOS engines, then system default.
        return listOf(
            "com.google.android.tts",
            "com.yuemeng.speechsuite",
            "com.oplus.ttsaccessibilityengine",
            null,
        )
    }

    private fun shutdownTtsEngine() {
        cancelTtsWatchdog()
        val engine = textToSpeech ?: return
        try {
            engine.stop()
        } catch (_: Throwable) {
        }
        try {
            engine.shutdown()
        } catch (_: Throwable) {
        }
        textToSpeech = null
        textToSpeechReady = false
    }

    private fun beginTtsInit(webView: WebView, text: String, langTag: String, engineIndex: Int) {
        val engines = preferredTtsEngines()
        if (engineIndex >= engines.size) {
            Log.w(TAG, "TTS init failed: no engine available")
            ttsInitPending = null
            notifyTtsError(webView, "init-failed")
            return
        }

        val enginePackage = engines[engineIndex]
        val generation = ++ttsInitGeneration
        val onInit = TextToSpeech.OnInitListener { status ->
            if (generation != ttsInitGeneration) {
                Log.d(TAG, "Ignoring stale TTS init callback for engine=${enginePackage ?: "default"}")
                return@OnInitListener
            }
            if (status != TextToSpeech.SUCCESS) {
                Log.w(TAG, "TTS init failed for engine=${enginePackage ?: "default"} status=$status")
                shutdownTtsEngine()
                beginTtsInit(webView, text, langTag, engineIndex + 1)
                return@OnInitListener
            }

            val engine = textToSpeech ?: return@OnInitListener
            textToSpeechReady = true
            configureTtsEngine(engine)
            installTtsProgressListener(engine, webView)
            Log.d(TAG, "TTS ready via engine=${enginePackage ?: "default"}")
            val speakResult = speakNativeText(webView, text, langTag)
            if (speakResult != "ok" && speakResult != "initializing") {
                notifyTtsError(webView, speakResult)
            }
            ttsInitPending = null
        }

        textToSpeech = if (enginePackage != null) {
            TextToSpeech(applicationContext, onInit, enginePackage)
        } else {
            TextToSpeech(applicationContext, onInit)
        }
    }

    private fun ensureTtsEngine(webView: WebView, text: String, langTag: String): String {
        if (textToSpeech != null && textToSpeechReady) {
            return "ready"
        }
        if (ttsInitPending != null) {
            return "initializing"
        }
        ttsInitPending = Triple(webView, text, langTag)
        beginTtsInit(webView, text, langTag, 0)
        return "initializing"
    }

    private fun localeCandidates(langTag: String): List<String> {
        val tag = langTag.ifBlank { "en-US" }
        val family = tag.substringBefore('-').lowercase(Locale.ROOT)
        return when (family) {
            "es" -> listOf(tag, "es-ES", "es-MX", "es-US", "es")
            "en" -> listOf(tag, "en-US", "en-GB", "en-AU", "en")
            "zh" -> listOf(tag, "zh-CN", "zh-TW", "zh-HK", "zh")
            else -> listOf(tag, family)
        }.distinct()
    }

    private fun applyBestLocale(engine: TextToSpeech, langTag: String): Locale? {
        for (candidate in localeCandidates(langTag)) {
            val locale = Locale.forLanguageTag(candidate)
            val availability = engine.isLanguageAvailable(locale)
            if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) {
                continue
            }
            when (engine.setLanguage(locale)) {
                TextToSpeech.LANG_MISSING_DATA, TextToSpeech.LANG_NOT_SUPPORTED -> continue
                else -> return locale
            }
        }
        return null
    }

    private fun splitTextForTts(text: String, maxChunkSize: Int = 3500): List<String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()
        if (trimmed.length <= maxChunkSize) return listOf(trimmed)

        val chunks = mutableListOf<String>()
        var index = 0
        while (index < trimmed.length) {
            var end = (index + maxChunkSize).coerceAtMost(trimmed.length)
            if (end < trimmed.length) {
                val slice = trimmed.substring(index, end)
                val lastSpace = slice.lastIndexOf(' ')
                if (lastSpace > 0) {
                    end = index + lastSpace
                }
            }
            val chunk = trimmed.substring(index, end).trim()
            if (chunk.isNotEmpty()) {
                chunks.add(chunk)
            }
            index = if (end <= index) index + 1 else end
            while (index < trimmed.length && trimmed[index].isWhitespace()) {
                index++
            }
        }
        return chunks
    }

    private fun clearTtsSession() {
        cancelTtsWatchdog()
        ttsPendingChunks.clear()
        ttsSessionWebView = null
    }

    private fun notifyTtsError(webView: WebView, reason: String) {
        val safeReason = reason.replace("\\", "\\\\").replace("'", "\\'")
        webView.post {
            webView.evaluateJavascript(
                "window.__amigaTtsError&&window.__amigaTtsError('$safeReason')",
                null,
            )
        }
    }

    private fun finishTtsSession(webView: WebView) {
        clearTtsSession()
        webView.post {
            webView.evaluateJavascript("window.__amigaTtsDone&&window.__amigaTtsDone()", null)
        }
    }

    private fun installTtsProgressListener(engine: TextToSpeech, webView: WebView) {
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                cancelTtsWatchdog()
            }

            override fun onDone(utteranceId: String?) {
                val activeWebView = ttsSessionWebView ?: return
                if (ttsPendingChunks.isEmpty()) {
                    finishTtsSession(activeWebView)
                } else {
                    speakNextChunk(engine, activeWebView, TextToSpeech.QUEUE_ADD)
                }
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                // ERROR_STOPPED (-2): utterance cancelled by engine.stop(), not a user failure.
                if (errorCode == -2) return
                Log.w(TAG, "TTS error code=$errorCode utterance=$utteranceId")
                val activeWebView = ttsSessionWebView ?: return
                clearTtsSession()
                notifyTtsError(activeWebView, "error-$errorCode")
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                Log.w(TAG, "TTS error utterance=$utteranceId")
            }
        })
    }

    private fun speakNextChunk(engine: TextToSpeech, webView: WebView, queueMode: Int): String {
        if (ttsPendingChunks.isEmpty()) {
            finishTtsSession(webView)
            return "ok"
        }
        val chunk = ttsPendingChunks.removeAt(0)
        val utteranceId = "amiga-tts-${System.currentTimeMillis()}"
        val params = Bundle().apply {
            putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
        }
        val code = engine.speak(chunk, queueMode, params, utteranceId)
        if (code == TextToSpeech.ERROR) {
            Log.w(TAG, "TTS speak returned ERROR for chunk length=${chunk.length}")
            clearTtsSession()
            notifyTtsError(webView, "speak-failed")
            return "speak-failed"
        }
        scheduleTtsWatchdog(webView)
        return "ok"
    }

    private fun speakNativeText(webView: WebView, text: String, langTag: String): String {
        val engine = textToSpeech
        if (engine == null || !textToSpeechReady) {
            return ensureTtsEngine(webView, text, langTag)
        }

        val locale = applyBestLocale(engine, langTag)
        if (locale == null) {
            Log.w(TAG, "TTS language not available: $langTag")
            return "missing-language"
        }

        val chunks = splitTextForTts(text)
        if (chunks.isEmpty()) {
            return "empty"
        }

        clearTtsSession()
        ttsPendingChunks = chunks.toMutableList()
        ttsSessionWebView = webView
        return speakNextChunk(engine, webView, TextToSpeech.QUEUE_FLUSH)
    }

    /**
     * Install a JS bridge that exposes `window.__amigaExternal.openUrl(url)`.
     * The frontend uses this before the Tauri shell fallback on Android so
     * failed shell opens never degrade into `window.open()`, which Chromium
     * WebView handles as an in-app window.
     */
    private fun installExternalLinkBridge(webView: WebView) {
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun openUrl(url: String): String {
                val lowerUrl = url.lowercase()
                if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) {
                    val msg = "refused: URL must use http or https scheme"
                    Log.w(TAG, "external open refused non-http(s) url: $url")
                    return msg
                }
                val latch = CountDownLatch(1)
                var result = OpenResult(false, "failed to open link")
                this@MainActivity.runOnUiThread {
                    try {
                        result = openExternalUrlInBrowser(url)
                    } finally {
                        latch.countDown()
                    }
                }
                return try {
                    if (!latch.await(3, TimeUnit.SECONDS)) {
                        val msg = "timed out waiting for browser launch (3s)"
                        Log.w(TAG, "external open timed out waiting for UI thread: $url")
                        msg
                    } else if (result.ok) {
                        "ok"
                    } else {
                        result.error ?: "failed to open link"
                    }
                } catch (e: InterruptedException) {
                    val msg = "interrupted while opening link: ${e.message ?: e.javaClass.simpleName}"
                    Log.w(TAG, "external open interrupted: $url", e)
                    msg
                }
            }
        }, "__amigaExternal")
    }

    private data class OpenResult(val ok: Boolean, val error: String? = null)

    private fun formatOpenError(prefix: String, error: Throwable): String {
        val detail = error.message?.takeIf { it.isNotBlank() } ?: error.javaClass.simpleName
        return "$prefix: $detail"
    }

    private fun openExternalUrlInBrowser(url: String): OpenResult {
        val uri = Uri.parse(url)
        val baseIntent = Intent(Intent.ACTION_VIEW, uri).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
        }
        val pm = packageManager
        // MATCH_ALL — not MATCH_DEFAULT_ONLY. On ColorOS/Oppo many users never
        // set a default browser (Settings.Secure.default_browser is null), so
        // MATCH_DEFAULT_ONLY returns an empty list and we falsely report "no app".
        val handlers = pm.queryIntentActivities(baseIntent, PackageManager.MATCH_ALL)
            .mapNotNull { it.activityInfo?.packageName }
            .filter { it != packageName }
            .distinct()

        try {
            val resolved = pm.resolveActivity(baseIntent, PackageManager.MATCH_DEFAULT_ONLY)
            val defaultPkg = resolved?.activityInfo?.packageName
            if (!defaultPkg.isNullOrBlank() && defaultPkg != packageName && handlers.contains(defaultPkg)) {
                startActivity(Intent(baseIntent).apply { `package` = defaultPkg })
                Log.d(TAG, "external open launched via default browser package=$defaultPkg url=$url")
                return OpenResult(true)
            }
        } catch (e: Throwable) {
            Log.w(TAG, "external open failed resolving default browser: $url", e)
        }

        val fallbackPkg = handlers.firstOrNull()
        if (fallbackPkg != null) {
            try {
                startActivity(Intent(baseIntent).apply { `package` = fallbackPkg })
                Log.d(TAG, "external open launched via handler package=$fallbackPkg url=$url")
                return OpenResult(true)
            } catch (e: ActivityNotFoundException) {
                Log.w(TAG, "external open explicit handler failed package=$fallbackPkg url=$url", e)
            }
        }

        return openExternalUrlViaChooserOrGeneric(baseIntent, url)
    }

    private fun openExternalUrlViaChooserOrGeneric(intent: Intent, url: String): OpenResult {
        return try {
            startActivity(Intent.createChooser(intent, null))
            Log.d(TAG, "external open launched via chooser: $url")
            OpenResult(true)
        } catch (e: ActivityNotFoundException) {
            try {
                startActivity(intent)
                Log.d(TAG, "external open launched via generic VIEW intent: $url")
                OpenResult(true)
            } catch (e2: ActivityNotFoundException) {
                val msg = formatOpenError("no app can handle VIEW intent", e2)
                Log.w(TAG, "external open failed: $url", e2)
                OpenResult(false, msg)
            }
        }
    }

    private fun installUpdaterBridge(webView: WebView) {
        ensureApkDownloadReceiver()
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun installApk(url: String, suggestedName: String) {
                val lowerUrl = url.lowercase()
                if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) {
                    Log.w(TAG, "update install refused non-http(s) url: $url")
                    return
                }
                this@MainActivity.runOnUiThread {
                    enqueueApkDownload(url, suggestedName)
                }
            }
        }, "__amigaUpdater")
    }

    private fun ensureApkDownloadReceiver() {
        if (apkDownloadReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: android.content.Context?, intent: Intent?) {
                if (intent?.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
                val downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                if (downloadId == -1L) return
                val file = pendingApkDownloads.remove(downloadId) ?: return
                val manager = getSystemService(DOWNLOAD_SERVICE) as? DownloadManager ?: return
                val query = DownloadManager.Query().setFilterById(downloadId)
                manager.query(query)?.use { cursor ->
                    if (!cursor.moveToFirst()) return
                    val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        Log.d(TAG, "update install download finished: ${file.absolutePath}")
                        launchDownloadedApk(file)
                        return
                    }
                    val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                    Log.w(TAG, "update install download failed: id=$downloadId status=$status reason=$reason")
                }
            }
        }
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(receiver, filter)
        }
        apkDownloadReceiver = receiver
    }

    private fun enqueueApkDownload(url: String, suggestedName: String) {
        val manager = getSystemService(DOWNLOAD_SERVICE) as? DownloadManager ?: run {
            Log.w(TAG, "update install unavailable: DownloadManager missing")
            return
        }
        val fileName = sanitizeApkFileName(url, suggestedName)
        val destDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: filesDir
        val outFile = File(destDir, fileName)
        if (outFile.exists()) outFile.delete()
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setTitle(fileName)
            setDescription("Amiga update")
            setMimeType("application/vnd.android.package-archive")
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalFilesDir(
                this@MainActivity,
                Environment.DIRECTORY_DOWNLOADS,
                fileName,
            )
        }
        val downloadId = manager.enqueue(request)
        pendingApkDownloads[downloadId] = outFile
        Log.d(TAG, "update install download queued: id=$downloadId url=$url file=$fileName")
    }

    private fun sanitizeApkFileName(url: String, suggestedName: String): String {
        val base = suggestedName
            .ifBlank {
                Uri.parse(url).lastPathSegment ?: "amiga-update.apk"
            }
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
        return if (base.lowercase().endsWith(".apk")) base else "$base.apk"
    }

    private fun launchDownloadedApk(file: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !packageManager.canRequestPackageInstalls()
        ) {
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:$packageName"),
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(settingsIntent)
            Log.w(TAG, "update install requires unknown-app-sources permission")
            return
        }

        val uri = FileProvider.getUriForFile(
            this,
            "$packageName.fileprovider",
            file,
        )
        val installIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            startActivity(installIntent)
            Log.d(TAG, "update install launched package installer: ${file.absolutePath}")
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "update install failed to launch package installer", e)
        }
    }

    /**
     * Create the legacy Documents/Amiga dir (for old backups or devices that
     * still allow direct access). The live DB is now always in private
     * internal storage. A user-visible backup is exported via MediaStore to
     * Downloads/Amiga so it survives uninstall without needing
     * MANAGE_EXTERNAL_STORAGE.
     */
    private fun ensurePersistentDataDir() {
        val documents = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        val dir = File(documents, "Amiga")
        if (!dir.exists() && !dir.mkdirs()) {
            Log.w(TAG, "Failed to create legacy Documents/Amiga dir: ${dir.absolutePath}")
        }

        // Optional legacy WRITE for very old devices
        val writePerm = Manifest.permission.WRITE_EXTERNAL_STORAGE
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P &&
            ContextCompat.checkSelfPermission(this, writePerm) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(writePerm), REQUEST_STORAGE)
        }
    }

    /**
     * Restore DB from a MediaStore backup (in Downloads/Amiga/amiga_backup.db)
     * if the private DB does not exist. This provides uninstall-surviving
     * retention without relying on direct public storage permissions.
     */
    private fun tryRestoreFromMediaStoreBackup() {
        val privateDbDir = File(filesDir, "idioma")
        val privateDb = File(privateDbDir, "idioma.db")
        if (privateDb.exists()) return

        val projection = arrayOf(MediaStore.Downloads._ID, MediaStore.Downloads.DISPLAY_NAME)
        val selection =
            "${MediaStore.Downloads.DISPLAY_NAME} = ? OR ${MediaStore.Downloads.DISPLAY_NAME} LIKE ?"
        val selectionArgs = arrayOf(BACKUP_DISPLAY_NAME, "$BACKUP_DISPLAY_NAME (%)")
        val sortOrder = "${MediaStore.Downloads.DATE_MODIFIED} DESC, ${MediaStore.Downloads._ID} DESC"
        contentResolver.query(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            sortOrder,
        )?.use { cursor ->
            while (cursor.moveToNext()) {
                val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID))
                val uri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id)
                val restoreFile = File(privateDbDir, "idioma.db.restore")
                try {
                    contentResolver.openInputStream(uri)?.use { input ->
                        privateDbDir.mkdirs()
                        FileOutputStream(restoreFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                    if (!isSqliteDatabase(restoreFile)) {
                        Log.w(TAG, "Skipping invalid MediaStore backup: $uri")
                        continue
                    }
                    if (!restoreFile.renameTo(privateDb)) {
                        restoreFile.copyTo(privateDb, overwrite = true)
                        restoreFile.delete()
                    }
                    Log.i(TAG, "Restored latest DB from MediaStore backup: $uri")
                    return
                } catch (t: Throwable) {
                    Log.w(TAG, "Failed to restore MediaStore backup: $uri", t)
                } finally {
                    restoreFile.delete()
                }
            }
        }
    }

    private fun isSqliteDatabase(file: File): Boolean {
        if (!file.isFile || file.length() < SQLITE_HEADER.size) return false
        val header = ByteArray(SQLITE_HEADER.size)
        return try {
            FileInputStream(file).use { input ->
                input.read(header) == header.size && header.contentEquals(SQLITE_HEADER)
            }
        } catch (_: IOException) {
            false
        }
    }

    /**
     * Export a copy of the private DB to MediaStore Downloads/Amiga/amiga_backup.db .
     * This file survives uninstall and can be re-imported on reinstall.
     * Called on startup; in a real app you might call it on significant data changes.
     */
    private fun exportBackupToMediaStore() {
        val privateDb = File(filesDir, "idioma/idioma.db")
        if (!privateDb.exists()) return

        val preferences = getSharedPreferences(BACKUP_PREFERENCES, MODE_PRIVATE)
        val storedUri = preferences.getString(BACKUP_URI_KEY, null)?.let { value ->
            try {
                Uri.parse(value)
            } catch (_: Throwable) {
                null
            }
        }
        if (storedUri != null && writeBackupToUri(privateDb, storedUri)) {
            Log.i(TAG, "Updated DB backup in MediaStore: $storedUri")
            return
        }
        preferences.edit().remove(BACKUP_URI_KEY).commit()

        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, BACKUP_DISPLAY_NAME)
            put(MediaStore.Downloads.MIME_TYPE, "application/x-sqlite3")
            put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Amiga")
        }

        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        if (uri == null) {
            Log.w(TAG, "MediaStore did not create a backup URI")
            return
        }
        if (writeBackupToUri(privateDb, uri)) {
            preferences.edit().putString(BACKUP_URI_KEY, uri.toString()).commit()
            Log.i(TAG, "Created DB backup in MediaStore: $uri")
        } else {
            try {
                contentResolver.delete(uri, null, null)
            } catch (_: Throwable) {
            }
        }
    }

    private fun writeBackupToUri(privateDb: File, uri: Uri): Boolean {
        return try {
            val output = contentResolver.openOutputStream(uri, "wt") ?: return false
            output.use {
                FileInputStream(privateDb).use { input ->
                    input.copyTo(it)
                }
            }
            true
        } catch (t: Throwable) {
            Log.w(TAG, "Failed to write MediaStore backup: $uri", t)
            false
        }
    }

    companion object {
        private const val TAG = "Amiga/Main"
        private const val REQUEST_STORAGE = 1001
        private const val BACKUP_DISPLAY_NAME = "amiga_backup.db"
        private const val BACKUP_PREFERENCES = "amiga_media_store_backup"
        private const val BACKUP_URI_KEY = "media_store_uri"
        private val SQLITE_HEADER = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)
    }
}
