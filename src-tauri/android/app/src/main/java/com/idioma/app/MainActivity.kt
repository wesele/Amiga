package com.idioma.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONObject

/**
 * Custom activity that bridges native Android system-bar insets into the
 * WebView and installs our long-press "翻译" menu item.
 *
 * Why we do this in code instead of relying on the CSS `safe-area-inset-*`
 * env(): that env() is an iOS WebKit feature. Android WebView returns 0 for
 * it in all current versions, so on Android the only reliable way to keep
 * the bottom nav and chat input above the system navigation bar is to read
 * the real insets from [WindowInsetsCompat] and push them into the page as
 * CSS custom properties (`--amiga-safe-top`, `--amiga-safe-bottom`).
 *
 * The page exposes a global `__amigaSetInsets(top, bottom, left, right)`
 * which we call from here. It writes the values to `:root` and also fires
 * a `resize` so any visualViewport-based layouts re-measure.
 *
 * See: [MainActivityTest.kt] (no JVM unit tests for the WebView bridge;
 * verified end-to-end on device and via the WebView's evaluateJavascript
 * logs in Logcat).
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

        // 1) Insets → JS bridge
        installInsetsBridge(webView)

        // 2) Long-press text selection: inject "翻译" item
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
     * Read the current [WindowInsetsCompat] for the WebView's host and
     * forward it to the page. The bridge is also re-fired on every
     * inset change (e.g. when the user toggles the IME, swipes the
     * gesture bar, or rotates) so the page always reflects the latest
     * layout.
     */
    private fun installInsetsBridge(webView: WebView) {
        val rootView = webView.parent as? View ?: run {
            // Fallback: defer until attached. Tauri attaches the WebView to
            // the activity's decor view, so this branch only fires for
            // unusual hosting setups.
            webView.post { installInsetsBridge(webView) }
            return
        }

        fun push(insets: WindowInsetsCompat) {
            val sysBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            // The IME insets replace the bottom system bar when the
            // keyboard is up; the page only needs the *effective* bottom
            // to keep the chat input visible.
            val bottom = maxOf(sysBars.bottom, ime.bottom)
            val payload = JSONObject().apply {
                put("top", sysBars.top)
                put("bottom", bottom)
                put("left", sysBars.left)
                put("right", sysBars.right)
            }
            val js = "window.__amigaSetInsets && window.__amigaSetInsets(${payload});"
            webView.evaluateJavascript(js, null)
        }

        // Initial push (ViewCompat dispatches with the current insets).
        ViewCompat.setOnApplyWindowInsetsListener(rootView) { _, insets ->
            push(insets)
            insets
        }
        rootView.requestApplyInsets()
    }

    companion object {
        private const val TAG = "Amiga/Main"
    }
}
