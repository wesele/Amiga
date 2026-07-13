use crate::commands::llm::LlmState;
use crate::commands::syncable::after_syncable_write;
use crate::modules::database::DatabasePool;
use crate::modules::llm as llm_mod;
use crate::modules::speaking as speaking_mod;
use tauri::State;

#[tauri::command]
pub fn speaking_list_topics_cmd() -> Vec<speaking_mod::SpeakingTopic> {
    speaking_mod::list_topics()
}

#[tauri::command]
pub fn get_completed_speaking_count_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
) -> Result<i32, String> {
    speaking_mod::get_completed_speaking_count(&db, &user_id)
}

#[tauri::command]
pub async fn speaking_start_session_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    user_id: String,
    topic_id: String,
    target_lang: String,
    native_lang: String,
    cefr_level: String,
) -> Result<speaking_mod::SpeakingSessionView, String> {
    let session = speaking_mod::start_session(
        &llm.client,
        &db,
        &user_id,
        &topic_id,
        &target_lang,
        &native_lang,
        &cefr_level,
    )
    .await?;
    after_syncable_write(&db);
    Ok(session)
}

#[tauri::command]
pub async fn speaking_score_turn_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    session_id: String,
    audio_base64: String,
    audio_format: String,
    used_hint: bool,
) -> Result<speaking_mod::SpeakingScoreResult, String> {
    let score = speaking_mod::score_turn(
        &llm.client,
        &db,
        &session_id,
        &audio_base64,
        &audio_format,
        used_hint,
    )
    .await?;
    after_syncable_write(&db);
    Ok(score)
}

#[tauri::command]
pub async fn speaking_hint_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    session_id: String,
) -> Result<String, String> {
    speaking_mod::get_hint(&llm.client, &db, &session_id).await
}

#[tauri::command]
pub async fn speaking_translate_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    session_id: String,
) -> Result<String, String> {
    speaking_mod::translate_ai_line(&llm.client, &db, &session_id).await
}

#[tauri::command]
pub async fn speaking_finish_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    session_id: String,
) -> Result<String, String> {
    let result = speaking_mod::finish_session(&llm.client, &db, &session_id).await?;
    after_syncable_write(&db);
    Ok(result)
}

#[tauri::command]
pub async fn get_multimodal_config_cmd(
    db: State<'_, DatabasePool>,
) -> Result<llm_mod::MultimodalConfig, String> {
    llm_mod::get_multimodal_config(&db)
}

#[tauri::command]
pub async fn save_multimodal_config_cmd(
    db: State<'_, DatabasePool>,
    config: llm_mod::ModelConfig,
) -> Result<(), String> {
    llm_mod::save_multimodal_config(&db, &config)
}

#[tauri::command]
pub async fn test_multimodal_connection_cmd(
    llm: State<'_, LlmState>,
    config: llm_mod::ModelConfig,
) -> Result<llm_mod::TestResult, String> {
    Ok(llm.client.test_connection(&config).await)
}
