use tauri::AppHandle;

#[tauri::command]
pub fn share_text_cmd(_app: AppHandle, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Share text is empty".to_string());
    }
    // On Android, trigger the native share sheet via the Kotlin bridge.
    // On other platforms, return an error so the frontend falls back.
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let js = format!(
                "(function(){{if(window.__amigaShare&&window.__amigaShare.shareText){{window.__amigaShare.shareText({});return true;}}return false;}})()",
                serde_json::to_string(&text).map_err(|e| e.to_string())?
            );
            window
                .eval(&js)
                .map_err(|e| format!("Failed to trigger native share: {}", e))?;
            Ok(())
        } else {
            Err("No main window found".to_string())
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = text;
        Err("Native share is only available on Android".to_string())
    }
}
