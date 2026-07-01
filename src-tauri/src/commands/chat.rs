use crate::commands::llm::LlmState;
use crate::modules::chat as chat_mod;
use crate::modules::database::DatabasePool;
use crate::modules::llm as llm_mod;
use crate::modules::sync;
use tauri::State;

fn after_syncable_write(db: &DatabasePool) {
    sync::schedule_cloud_sync(db);
}

#[tauri::command]
pub async fn chat_completion_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    messages: Vec<llm_mod::ChatMessage>,
    native_lang: String,
    target_lang: String,
) -> Result<String, String> {
    chat_mod::chat_completion(&llm.client, &db, messages, &native_lang, &target_lang).await
}

#[tauri::command]
pub async fn chat_completion_with_session_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    session_id: String,
    message: String,
    native_lang: String,
    target_lang: String,
) -> Result<String, String> {
    let reply = chat_mod::chat_completion_with_session(
        &llm.client,
        &db,
        &session_id,
        &message,
        &native_lang,
        &target_lang,
    )
    .await?;
    after_syncable_write(&db);
    Ok(reply)
}

#[tauri::command]
pub async fn create_chat_session_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    title: String,
    contact_type: String,
    target_lang: String,
) -> Result<String, String> {
    let session_id = chat_mod::create_session(&db, &user_id, &title, &contact_type, &target_lang)?;
    after_syncable_write(&db);
    Ok(session_id)
}

#[tauri::command]
pub async fn get_chat_sessions_cmd(
    db: State<'_, DatabasePool>,
    target_lang: String,
) -> Result<Vec<chat_mod::ChatSession>, String> {
    chat_mod::get_sessions(&db, &target_lang)
}

#[tauri::command]
pub async fn delete_chat_session_cmd(
    db: State<'_, DatabasePool>,
    session_id: String,
) -> Result<(), String> {
    chat_mod::delete_session(&db, &session_id)?;
    after_syncable_write(&db);
    Ok(())
}

#[tauri::command]
pub async fn get_chat_messages_cmd(
    db: State<'_, DatabasePool>,
    session_id: String,
    limit: usize,
) -> Result<Vec<chat_mod::ChatMessageItem>, String> {
    chat_mod::get_messages(&db, &session_id, limit)
}

#[tauri::command]
pub async fn update_chat_session_title_cmd(
    db: State<'_, DatabasePool>,
    session_id: String,
    title: String,
) -> Result<(), String> {
    chat_mod::update_session_title(&db, &session_id, &title)?;
    after_syncable_write(&db);
    Ok(())
}

#[tauri::command]
pub async fn get_amiga_profile_cmd(target_lang: String) -> Result<serde_json::Value, String> {
    let lang_label = match target_lang.as_str() {
        "es" => "Spanish",
        "en" => "English",
        "zh" => "Chinese",
        _ => "your target language",
    };
    Ok(serde_json::json!({
        "id": "amiga",
        "nickname": "Amiga",
        "avatar": "🤖",
        "bio": format!("Your AI language buddy for {}", lang_label)
    }))
}
