use crate::commands::syncable::after_syncable_write;
use crate::modules::database::DatabasePool;
use crate::modules::youtube as yt_mod;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn fetch_youtube_metadata_cmd(
    url: String,
    target_lang: String,
) -> Result<yt_mod::YoutubeMetadata, String> {
    yt_mod::fetch_youtube_metadata(&url, &target_lang).await
}

#[tauri::command]
pub async fn start_youtube_import_cmd(
    app: AppHandle,
    db: State<'_, DatabasePool>,
    task_id: String,
    url: String,
    target_lang: String,
    user_id: String,
    cefr_level: Option<String>,
    meta: Option<yt_mod::YoutubeMetadata>,
) -> Result<(), String> {
    yt_mod::run_import_pipeline(
        app,
        (*db).clone(),
        task_id,
        url,
        target_lang,
        user_id,
        cefr_level,
        meta,
    );
    after_syncable_write(&db);
    Ok(())
}

#[tauri::command]
pub async fn get_youtube_import_progress_cmd(
    task_id: String,
) -> Result<Option<yt_mod::ImportProgressEvent>, String> {
    Ok(yt_mod::get_import_progress(&task_id))
}

#[tauri::command]
pub async fn cancel_youtube_import_cmd(task_id: String) -> Result<(), String> {
    yt_mod::cancel_import(&task_id);
    Ok(())
}

#[tauri::command]
pub async fn update_ytdlp_cmd() -> Result<String, String> {
    yt_mod::update_ytdlp()
}
