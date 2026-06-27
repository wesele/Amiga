package com.idioma.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
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
 *    custom properties, which the layout (`#app` padding-top and the
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
 * 3. **Dismiss selection ActionMode bridge.** The frontend shows its
 *    own "翻译" FAB below the selection. When the user taps it, the
 *    frontend calls `window.__amigaFinishSelectionMode()` to close
 *    the system selection toolbar so it does not overlap the
 *    translation popup.
 */
class MainActivity : TauriActivity() {
    private var mainWebView: WebView? = null

    // Disable the WryActivity's stock back navigation (which calls
    // mWebView.goBack()). We install our own hierarchical back handler
    // in installBackNavigation() below; running both produces
    // contradictory behavior (the page pushes a parent route AND
    // history.back() runs in parallel, often landing on the wrong
    // screen and sometimes looping).
    override val handleBackNavigation: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
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

        // 3) Long-press text selection: keep the WebView long-press
        //    enabled so the system selection toolbar shows, but we no
        //    longer inject a "翻译" item into it. The frontend shows
        //    its own floating "翻译" button below the selection instead.
        //    When that button is tapped, the frontend calls
        //    __amigaFinishSelectionMode() to dismiss the system toolbar.
        webView.setOnLongClickListener(null)
        webView.isLongClickable = true
        webView.isHapticFeedbackEnabled = true
        installDismissSelectionBridge(webView)

        // 4) Share bridge: expose __amigaShare.shareText() so the
        //    frontend can trigger the native Android share sheet.
        installShareBridge(webView)

        // 5) External link bridge: open http(s) links in the user's
        //    system browser instead of creating another in-app WebView.
        installExternalLinkBridge(webView)
    }

    override fun onDestroy() {
        mainWebView = null
        super.onDestroy()
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
     * Expose `window.__amigaFinishSelectionMode()` so the frontend can
     * dismiss the WebView's text-selection floating toolbar (Copy /
     * Share / etc.) after the user taps the frontend's own "翻译"
     * floating button. The system keeps the toolbar pinned to the
     * live selection; clearing the JS selection alone does not close
     * it on every Android version, so the frontend explicitly asks us
     * to finish the ActionMode.
     *
     * Implementation: hook the Activity-level
     * [onActionModeStarted] pass-through, tracking the most recent
     * floating ActionMode. The `__amigaFinishSelectionMode()` bridge
     * finishes that mode and clears the tracking. The action mode for
     * OAuth-style browser chained (`TYPE_PRIMARY`) ActionModes is
     * untouched — we only intercept the floating selection toolbar.
     */
    private val currentSelectionModes = java.util.concurrent.CopyOnWriteArrayList<android.view.ActionMode>()

    override fun onActionModeStarted(mode: android.view.ActionMode) {
        Log.d(TAG, "onActionModeStarted type=${mode.type} tag=${mode.tag}")
        if (mode.type == android.view.ActionMode.TYPE_FLOATING) {
            currentSelectionModes.add(mode)
        }
        super.onActionModeStarted(mode)
    }

    /**
     * Install the JS bridge. We do not inject a "翻译" item any more —
     * that responsibility moved entirely to the frontend's floating
     * button (the JS-side `translate-fab` in NewsReader.vue). When the
     * user taps that button, the frontend calls
     * `window.__amigaFinishSelectionMode()` which closes any active
     * text-selection ActionMode(s) so the system toolbar disappears.
     */
    private fun installDismissSelectionBridge(webView: WebView) {
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun finishSelectionMode() {
                // addJavascriptInterface methods run on a WebView
                // thread, NOT the main thread. ActionMode mutations
                // (finish) must happen on the main thread.
                mainWebView?.post {
                    val active = currentSelectionModes.toList()
                    active.forEach { mode ->
                        runCatching { mode.finish() }
                            .onFailure { Log.w(TAG, "finishSelectionMode: mode.finish failed", it) }
                    }
                    currentSelectionModes.clear()
                    Log.d(TAG, "finishSelectionMode: closed ${active.size} floating mode(s)")
                }
            }
        }, "__amigaFinishSelectionMode")
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
     * Install a JS bridge that exposes `window.__amigaExternal.openUrl(url)`.
     * The frontend uses this before the Tauri shell fallback on Android so
     * failed shell opens never degrade into `window.open()`, which Chromium
     * WebView handles as an in-app window.
     */
    private fun installExternalLinkBridge(webView: WebView) {
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun openUrl(url: String) {
                val lowerUrl = url.lowercase()
                if (!lowerUrl.startsWith("http://") && !lowerUrl.startsWith("https://")) {
                    Log.w(TAG, "external open refused non-http(s) url: $url")
                    return
                }
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                }
                this@MainActivity.runOnUiThread {
                    try {
                        this@MainActivity.startActivity(intent)
                        Log.d(TAG, "external open launched: $url")
                    } catch (e: ActivityNotFoundException) {
                        Log.w(TAG, "external open failed: $url", e)
                    }
                }
            }
        }, "__amigaExternal")
    }

    companion object {
        private const val TAG = "Amiga/Main"
    }
}
