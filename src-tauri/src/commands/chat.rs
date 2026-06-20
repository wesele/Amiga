use crate::commands::llm::LlmState;
use crate::modules::database::DatabasePool;
use crate::modules::llm as llm_mod;
use tauri::State;

#[tauri::command]
pub async fn chat_completion_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    messages: Vec<llm_mod::ChatMessage>,
    native_lang: String,
    target_lang: String,
) -> Result<String, String> {
    crate::modules::chat::chat_completion(&llm.client, &db, messages, &native_lang, &target_lang)
        .await
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
    crate::modules::chat::chat_completion_with_session(
        &llm.client,
        &db,
        &session_id,
        &message,
        &native_lang,
        &target_lang,
    )
    .await
}

#[tauri::command]
pub async fn create_chat_session_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    title: String,
    contact_type: String,
) -> Result<String, String> {
    crate::modules::chat::create_session(&db, &user_id, &title, &contact_type)
}

#[tauri::command]
pub async fn get_chat_sessions_cmd(
    db: State<'_, DatabasePool>,
) -> Result<Vec<crate::modules::chat::ChatSession>, String> {
    crate::modules::chat::get_sessions(&db)
}

#[tauri::command]
pub async fn delete_chat_session_cmd(
    db: State<'_, DatabasePool>,
    session_id: String,
) -> Result<(), String> {
    crate::modules::chat::delete_session(&db, &session_id)
}

#[tauri::command]
pub async fn get_chat_messages_cmd(
    db: State<'_, DatabasePool>,
    session_id: String,
    limit: usize,
) -> Result<Vec<crate::modules::chat::ChatMessageItem>, String> {
    crate::modules::chat::get_messages(&db, &session_id, limit)
}

#[tauri::command]
pub async fn update_chat_session_title_cmd(
    db: State<'_, DatabasePool>,
    session_id: String,
    title: String,
) -> Result<(), String> {
    crate::modules::chat::update_session_title(&db, &session_id, &title)
}

#[tauri::command]
pub async fn get_amiga_profile_cmd() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "id": "amiga",
        "nickname": "Amiga",
        "avatar": "🤖",
        "bio": "你的 AI 语言学习伙伴"
    }))
}
