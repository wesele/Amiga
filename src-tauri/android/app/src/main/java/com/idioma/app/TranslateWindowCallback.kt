package com.idioma.app

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ActionMode
import android.view.Menu
import android.webkit.WebView
import androidx.core.view.MenuItemCompat

/**
 * Injects a "翻译" (Translate) menu item into the WebView's text-selection
 * floating toolbar.
 *
 * The official Android extension point for customising the WebView's text
 * selection menu is the [ActionMode] that WebView creates. We leave that
 * native ActionMode in place and add our item to its existing menu, so OEM
 * actions (Copy / Share / Select all / system Translate) keep their original
 * callbacks and the toolbar keeps the OEM's positioning behavior.
 *
 * The injected item needs [MenuItemCompat.SHOW_AS_ACTION_ALWAYS] so it is
 * laid out as a button on the floating toolbar (TYPE_FLOATING). Without
 * this the item is treated as overflow and silently dropped because the
 * floating toolbar has no overflow chevron on most Android 12+ devices.
 *
 */
class TranslateWindowCallback(private val webView: WebView) {

    /**
     * Snapshot of the page selection text, taken at the moment
     * onCreateActionMode fires. We hand this to JS when the user taps our
     * injected item, because by then window.getSelection() has typically
     * been cleared by the system.
     */
    @Volatile
    private var lastSelectionText: String = ""

    /** Add Amiga to the existing WebView selection menu without replacing it. */
    fun injectInto(mode: ActionMode) {
        // Take a snapshot before the user can dismiss the native toolbar.
        captureSelectionNow()
        try {
            injectTranslateItem(mode)
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to inject Amiga menu item", t)
        }
    }

    private fun injectTranslateItem(mode: ActionMode) {
        val menu = mode.menu
        if (menu == null) {
            Log.w(TAG, "mode.menu is null; cannot inject 翻译 item (type=${mode.type})")
            return
        }
        if (menu.findItem(MENU_TRANSLATE_ID) != null) {
            Log.d(TAG, "Translate item already present, skipping")
            return
        }
        val sizeBefore = menu.size()
        // Add our "Amiga" item FIRST at the top
        val item = menu.add(0, MENU_TRANSLATE_ID, Menu.FIRST, "Amiga")
        // SHOW_AS_ACTION_ALWAYS is required for TYPE_FLOATING: without it
        // the item is treated as overflow and is never rendered.
        MenuItemCompat.setShowAsAction(item, MenuItemCompat.SHOW_AS_ACTION_ALWAYS)
        item.setOnMenuItemClickListener {
            onTranslateClicked()
            // Let JavaScript dispatch to Vue before the system clears the
            // selection. Other items keep their native callbacks unchanged.
            webView.post { mode.finish() }
            true
        }
        Log.d(TAG, "Injected Amiga item; menu size $sizeBefore -> ${menu.size()}")
        // Force the floating toolbar to re-measure and pick up the new
        // item. invalidate() is deprecated as of API 27 in favour of
        // invalidateContent(), but it is still functional on every API
        // level we support and is the only call the Kotlin compiler can
        // resolve when minSdk < 27.
        @Suppress("DEPRECATION")
        mode.invalidate()
    }

    /**
     * Snapshot the current page selection into the WebView's
     * window.__amigaLastSelection and read it back into the Kotlin field
     * via a brief post. Avoids the "selection cleared before JS can read
     * it" race.
     */
    private fun captureSelectionNow() {
        val js = """
            (function(){
              try {
                var sel = window.getSelection();
                var t = sel ? sel.toString().trim() : '';
                window.__amigaLastSelection = t;
              } catch (e) {}
            })();
        """.trimIndent()
        webView.loadUrl("javascript:$js")
        Handler(Looper.getMainLooper()).postDelayed({
            webView.evaluateJavascript(
                "(function(){ return JSON.stringify(window.__amigaLastSelection || ''); })()",
            ) { raw ->
                val trimmed = raw
                    ?.trim()
                    ?.removeSurrounding("\"")
                    ?.replace("\\\"", "\"")
                    ?.replace("\\\\", "\\")
                    ?.replace("\\n", "\n")
                if (!trimmed.isNullOrEmpty() && trimmed != "null") {
                    lastSelectionText = trimmed
                }
                Log.d(TAG, "snapshot updated: '${lastSelectionText.take(80)}'")
            }
        }, 30)
    }

    private fun onTranslateClicked() {
        Log.d(TAG, "onTranslateClicked: dispatching captured selection='${lastSelectionText.take(80)}'")
        val text = lastSelectionText
        val js = """
            (function(){
              try {
                var t = ${jsString(text)};
                if (!t) {
                  try { t = (window.getSelection() || {toString:function(){return '';}}).toString().trim(); } catch (e) {}
                }
                if (t && t.length > 0 && window.__amigaTranslateSelection) {
                  window.__amigaTranslateSelection(t);
                } else {
                  console.log('[Amiga] translate click: no text to translate (snapshot empty, live selection empty)');
                }
                var sel = window.getSelection();
                if (sel) { try { sel.removeAllRanges(); } catch (e) {} }
              } catch (err) {
                console.log('[Amiga] translate click error: ' + err);
              }
            })();
        """.trimIndent()
        webView.loadUrl("javascript:$js")
    }

    /**
     * JSON-encode a Kotlin string so it can be embedded in a JS string
     * literal without escaping worries (handles quotes, backslashes,
     * newlines, and non-ASCII characters such as Spanish accented
     * letters).
     */
    private fun jsString(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) {
            when (c) {
                '"'  -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                else -> {
                    if (c.code < 0x20) {
                        sb.append(String.format("\\u%04x", c.code))
                    } else {
                        sb.append(c)
                    }
                }
            }
        }
        sb.append("\"")
        return sb.toString()
    }

    companion object {
        private const val TAG = "Amiga/Translate"
        private const val MENU_TRANSLATE_ID = 1001
    }
}
