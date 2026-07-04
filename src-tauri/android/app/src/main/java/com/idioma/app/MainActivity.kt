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
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
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
 * 3. **Long-press "翻译" menu item in the WebView text-selection
 *    floating toolbar.** [TranslateWindowCallback] hooks
 *    `setCustomSelectionActionModeCallback` to inject our item. The
 *    page registers `window.__amigaTranslateSelection(text)` and we
 *    dispatch to it when the user taps the item.
 */
class MainActivity : TauriActivity() {
    private var mainWebView: WebView? = null
    private var translateCallback: TranslateWindowCallback? = null
    private var apkDownloadReceiver: BroadcastReceiver? = null
    private val pendingApkDownloads = mutableMapOf<Long, File>()
    private var textToSpeech: TextToSpeech? = null
    private var textToSpeechReady = false

    // Disable the WryActivity's stock back navigation (which calls
    // mWebView.goBack()). We install our own hierarchical back handler
    // in installBackNavigation() below; running both produces
    // contradictory behavior (the page pushes a parent route AND
    // history.back() runs in parallel, often landing on the wrong
    // screen and sometimes looping).
    override val handleBackNavigation: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        // Try to restore from MediaStore backup (survives uninstall) before
        // Rust starts. This is the new retention mechanism that does not
        // require MANAGE_EXTERNAL_STORAGE.
        tryRestoreFromMediaStoreBackup()
        // Prepare (legacy) dir; public path is now only for optional backup.
        ensurePersistentDataDir()
        // Publish a fresh backup copy via MediaStore (no broad storage perm needed).
        exportBackupToMediaStore()
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.navigationBarColor = Color.TRANSPARENT
    }

    @SuppressLint("NewApi")
    override fun onWebViewCreate(webView: WebView) {
        mainWebView = webView

        // 1) Safe-area bridge: pass the real systemBars + IME inset
        //    values to the frontend via __amigaSetInsets, so CSS
        //    custom properties --safe-* keep content out of the
        //    system bar / keyboard area.
        installSafeAreaPadding(webView)

        // 2) Hierarchical back navigation: the system back press goes
        //    through __amigaGoBack() and finishes the activity when
        //    the current route has no parent.
        installBackNavigation(webView)

        // 3) Long-press text selection: inject "翻译" item.
        webView.setOnLongClickListener(null)
        webView.isLongClickable = true
        webView.isHapticFeedbackEnabled = true
        val cb = TranslateWindowCallback(webView)
        translateCallback = cb
        // The method is public in AOSP but AndroidX's WebViewCompat
        // shim doesn't always expose it on every API level. The
        // signature on AOSP is `setCustomSelectionActionModeCallback(
        // android.view.ActionMode.Callback)` where Callback is the
        // inner abstract class (NOT the $Callback interface some
        // older docs reference). Using the wrong class descriptor
        // throws NoSuchMethodException. Try the concrete class first,
        // then the dotted-name form (which is what newer SDKs accept
        // for inner classes) as a fallback.
        installSelectionCallback(webView, cb)

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
        apkDownloadReceiver?.let { unregisterReceiver(it) }
        apkDownloadReceiver = null
        pendingApkDownloads.clear()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        textToSpeechReady = false
        super.onDestroy()
    }

    /**
     * Activity-level ActionMode hook. Newer Chromium WebView builds
     * (API 34+) removed `setCustomSelectionActionModeCallback`, so
     * we wrap here instead.
     *
     * Strategy: when the WebView starts a text-selection ActionMode,
     * we (1) snapshot the menu items the original callback added,
     * (2) finish the original mode, (3) start a new mode using our
     * TranslateWindowCallback as the callback, which re-adds the
     * system items (Copy / Share / etc.) plus our "翻译" item. The
     * mode appears seamless to the user — the original menu items
     * are still there, plus our extra.
     *
     * The recursion guard uses a thread-local flag (rather than
     * mode.callback, which ActionMode does not expose) because
     * calling webView.startActionMode below dispatches another
     * onActionModeStarted for the *new* mode, and we must not
     * process it as if it were the original.
     */
    override fun onActionModeStarted(mode: android.view.ActionMode) {
        Log.d(TAG, "onActionModeStarted type=${mode.type} tag=${mode.tag}")
        val webView = mainWebView ?: return super.onActionModeStarted(mode)
        // Re-entrancy guard: while we're inside our own replacement
        // startActionMode, the system dispatches onActionModeStarted
        // for the new mode. Skip it (the new mode's translator will
        // populate its menu via its own onCreateActionMode).
        if (reentrancyGuard.get()) return
        // Only intercept floating (selection) modes. TYPE_FLOATING
        // is what text-selection uses on modern Android.
        if (mode.type != android.view.ActionMode.TYPE_FLOATING) {
            return super.onActionModeStarted(mode)
        }
        // Snapshot the original menu items.
        val originalItems = (0 until mode.menu.size()).map { mode.menu.getItem(it) }
        // Finish the original mode and replace it with ours.
        mode.finish()
        val translator = TranslateWindowCallback(webView, originalItems)
        translateCallback = translator
        reentrancyGuard.set(true)
        try {
            val newMode = webView.startActionMode(
                translator,
                android.view.ActionMode.TYPE_FLOATING,
            )
            if (newMode != null) {
                newMode.tag = TAG_INJECTED
            }
        } finally {
            reentrancyGuard.set(false)
        }
        // Note: we intentionally do NOT call super.onActionModeStarted
        // because we've replaced the mode. Calling super would just
        // notify the (now finished) original mode.
    }

    private val reentrancyGuard = ThreadLocal.withInitial { false }

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
     * Hook the WebView's text-selection ActionMode so we can inject
     * a custom "翻译" menu item. The Chromium WebView (API 34+ on
     * this build) removed `setCustomSelectionActionModeCallback` —
     * we verified at runtime that the method no longer exists on
     * the device. The replacement path is to intercept the
     * Activity-level `onActionModeStarted` and `onActionModeFinished`
     * callbacks. TYPE_FLOATING ActionModes (which is what the
     * selection toolbar is) DO route through these in practice on
     * every OEM we test on; the original assumption that
     * Window.Callback is bypassed turned out to be wrong for
     * current chromium WebView.
     *
     * We keep the old `setCustomSelectionActionModeCallback` fallback
     * because some older AndroidX WebView builds still ship it.
     */
    private fun installSelectionCallback(webView: WebView, cb: android.view.ActionMode.Callback) {
        // Modern path: hook the Activity. This is set up by overriding
        // onActionModeStarted on the activity; see the override
        // further down in this file. Nothing to do here — the override
        // wraps every ActionMode the WebView creates via the Window.
        //
        // We still try the legacy setCustomSelectionActionModeCallback
        // below because it would let us wrap *only* selection modes
        // (not, say, a future WebView-internal floating menu). When
        // the method exists we get a more precise hook; when it
        // doesn't, we fall back to the activity-level wrap.
        val candidates = listOf(
            "android.view.ActionMode\$Callback",
            "android.view.ActionMode.Callback",
        )
        for (descriptor in candidates) {
            try {
                val cls = Class.forName(descriptor)
                val m = WebView::class.java.getMethod("setCustomSelectionActionModeCallback", cls)
                m.invoke(webView, cb)
                Log.d(TAG, "Installed selection callback via setCustomSelectionActionModeCallback($descriptor)")
                // The activity-level override is also installed as a
                // belt-and-braces backstop, but in this branch the
                // WebView is the source of truth.
                return
            } catch (t: Throwable) {
                Log.d(TAG, "selection callback via $descriptor failed: ${t.javaClass.simpleName}: ${t.message}")
            }
        }
        // No WebView-level hook available. The activity-level override
        // (onActionModeStarted below) will wrap every ActionMode the
        // WebView creates. We log so it's clear in logcat that the
        // modern API path is what's being used.
        Log.w(TAG, "WebView has no setCustomSelectionActionModeCallback — using activity-level onActionModeStarted hook instead")
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
                val latch = CountDownLatch(1)
                var result = "failed"
                this@MainActivity.runOnUiThread {
                    result = speakNativeText(webView, text, langTag)
                    latch.countDown()
                }
                return if (latch.await(3, TimeUnit.SECONDS)) result else "timeout"
            }

            @JavascriptInterface
            fun stop() {
                this@MainActivity.runOnUiThread {
                    textToSpeech?.stop()
                    webView.evaluateJavascript("window.__amigaTtsDone&&window.__amigaTtsDone()", null)
                }
            }
        }, "__amigaTts")
    }

    private fun speakNativeText(webView: WebView, text: String, langTag: String): String {
        val engine = textToSpeech
        if (engine == null || !textToSpeechReady) {
            textToSpeech = TextToSpeech(this) { status ->
                textToSpeechReady = status == TextToSpeech.SUCCESS
                if (textToSpeechReady) {
                    val speakResult = speakNativeText(webView, text, langTag)
                    if (speakResult != "ok") {
                        webView.evaluateJavascript("window.__amigaTtsDone&&window.__amigaTtsDone()", null)
                    }
                } else {
                    webView.evaluateJavascript("window.__amigaTtsDone&&window.__amigaTtsDone()", null)
                }
            }
            return "initializing"
        }

        val locale = Locale.forLanguageTag(langTag.ifBlank { "en-US" })
        val availability = engine.isLanguageAvailable(locale)
        if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(TAG, "TTS language not available: $langTag")
            return "missing-language"
        }
        val setResult = engine.setLanguage(locale)
        if (setResult == TextToSpeech.LANG_MISSING_DATA || setResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(TAG, "TTS refused language: $langTag")
            return "missing-language"
        }

        val utteranceId = "amiga-news-reader-${System.currentTimeMillis()}"
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {
                webView.post {
                    webView.evaluateJavascript("window.__amigaTtsDone&&window.__amigaTtsDone()", null)
                }
            }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                webView.post {
                    webView.evaluateJavascript("window.__amigaTtsDone&&window.__amigaTtsDone()", null)
                }
            }
        })
        engine.stop()
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        return "ok"
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
        val selection = "${MediaStore.Downloads.DISPLAY_NAME} = ?"
        val selectionArgs = arrayOf("amiga_backup.db")
        contentResolver.query(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID))
                val uri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id)
                try {
                    contentResolver.openInputStream(uri)?.use { input ->
                        privateDbDir.mkdirs()
                        FileOutputStream(privateDb).use { output ->
                            input.copyTo(output)
                        }
                        Log.i(TAG, "Restored DB from MediaStore backup to private storage")
                    }
                } catch (e: IOException) {
                    Log.w(TAG, "Failed to restore from MediaStore backup: ${e.message}")
                    // leave corrupt backup for user to handle via dialog if needed
                }
            }
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

        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, "amiga_backup.db")
            put(MediaStore.Downloads.MIME_TYPE, "application/x-sqlite3")
            put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Amiga")
        }

        val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        uri?.let {
            try {
                contentResolver.openOutputStream(it)?.use { output ->
                    FileInputStream(privateDb).use { input ->
                        input.copyTo(output)
                    }
                }
                Log.i(TAG, "Exported DB backup to MediaStore Downloads/Amiga")
            } catch (e: IOException) {
                Log.w(TAG, "Failed to export backup to MediaStore: ${e.message}")
            }
        }
    }

    companion object {
        private const val TAG = "Amiga/Main"
        private const val TAG_INJECTED = "Amiga/TranslateInjected"
        private const val REQUEST_STORAGE = 1001
    }
}
