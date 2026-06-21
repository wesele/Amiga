package com.idioma.app

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

/**
 * Custom activity for Amiga.
 *
 * Three things happen here that the stock [TauriActivity] does not do:
 *
 * 1. **Safe area at the app layer, not the HTML layer.** We read the
 *    real [WindowInsetsCompat] for `systemBars()` and `ime()` and apply
 *    them as the WebView's own padding, so the WebView's drawing area
 *    is *exactly* the safe area. The HTML inside the WebView does not
 *    need to know about Android system bars at all — `100vh` / `100vw`
 *    just work. The previous CSS-only approach (`env(safe-area-inset-*)`
 *    + a JS bridge from Kotlin) was unreliable because Android WebView
 *    returns 0 for that env() and the JS bridge has timing issues.
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

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }

    @SuppressLint("NewApi")
    override fun onWebViewCreate(webView: WebView) {
        mainWebView = webView

        // 1) Safe-area at the app layer: WebView's own padding equals
        //    the systemBars + IME insets, so the WebView never draws
        //    under the status bar / nav bar / keyboard.
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
        try {
            WebView::class.java
                .getMethod("setCustomSelectionActionModeCallback", android.view.ActionMode.Callback::class.java)
                .invoke(webView, cb)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to install custom selection callback", t)
        }
    }

    override fun onDestroy() {
        mainWebView = null
        translateCallback = null
        super.onDestroy()
    }

    /**
     * Sets the WebView's own padding to the live `systemBars()` and
     * `ime()` insets. The WebView is shrunk inward; its inner
     * coordinate system starts at the safe area's top-left and
     * ends at the safe area's bottom-right. The HTML inside
     * does `100vh` / `100vw` and never overlaps any system UI.
     *
     * IME wins over the system nav bar at the bottom (whichever is
     * taller is what we pad by), so the chat input stays above the
     * keyboard when it's up and above the nav bar when it isn't.
     */
    private fun installSafeAreaPadding(webView: WebView) {
        // The WebView may not be attached to a parent at this exact
        // moment. Defer the listener install until it is.
        fun attach() {
            val host = webView.parent as? View
            if (host == null) {
                webView.post { attach() }
                return
            }
            ViewCompat.setOnApplyWindowInsetsListener(host) { _, insets ->
                val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
                val bottom = maxOf(bars.bottom, ime.bottom)
                webView.setPadding(bars.left, bars.top, bars.right, bottom)
                insets
            }
            // Force the first dispatch so the WebView is sized correctly
            // even before any UI change fires.
            host.requestApplyInsets()
        }
        attach()
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

    companion object {
        private const val TAG = "Amiga/Main"
    }
}
