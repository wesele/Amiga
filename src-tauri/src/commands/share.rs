use tauri::{plugin::TauriPlugin, AppHandle, Runtime};

#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
#[cfg(target_os = "android")]
use tauri::Manager;
#[cfg(target_os = "android")]
use serde::Serialize;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.idioma.app";

#[cfg(target_os = "android")]
pub struct Share<R: Runtime> {
    mobile_plugin_handle: PluginHandle<R>,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::<R>::new("amiga-share")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "SharePlugin")?;
                _app.manage(Share {
                    mobile_plugin_handle: handle,
                });
            }
            Ok(())
        })
        .build()
}

#[tauri::command]
pub fn share_text_cmd<R: Runtime>(app: AppHandle<R>, text: String) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Share text is empty".to_string());
    }
    // On Android, trigger the native share sheet through a Tauri mobile
    // plugin. This avoids relying on WebView-global JS bridge visibility.
    // On other platforms, return an error so the frontend falls back.
    #[cfg(target_os = "android")]
    {
        let share = app.state::<Share<R>>();
        share
            .mobile_plugin_handle
            .run_mobile_plugin::<()>("shareText", SharePayload { text })
            .map_err(|e| format!("Failed to trigger native share: {}", e))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = text;
        let _ = app;
        Err("Native share is only available on Android".to_string())
    }
}

#[cfg(target_os = "android")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SharePayload {
    text: String,
}
