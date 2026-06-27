package com.idioma.app

import android.app.Activity
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class ShareTextArgs {
    lateinit var text: String
}

@TauriPlugin
class SharePlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun shareText(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ShareTextArgs::class.java)
            if (args.text.isBlank()) {
                invoke.reject("Share text is empty")
                return
            }

            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, args.text)
            }
            val chooser = Intent.createChooser(intent, null)
            activity.runOnUiThread {
                activity.startActivity(chooser)
                invoke.resolve()
            }
        } catch (ex: Exception) {
            invoke.reject(ex.message)
        }
    }
}
