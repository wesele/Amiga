package com.idioma.app

import android.annotation.SuppressLint
import android.graphics.Color
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
    }

    override fun onDestroy() {
        mainWebView = null
        translateCallback = null
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

    companion object {
        private const val TAG = "Amiga/Main"
        private const val TAG_INJECTED = "Amiga/TranslateInjected"
    }
}
