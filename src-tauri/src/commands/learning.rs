use crate::commands::llm::LlmState;
use crate::modules::database::DatabasePool;
use crate::modules::learning as learning_mod;
use tauri::State;

#[tauri::command]
pub async fn save_sentence_cmd(
    db: State<'_, DatabasePool>,
    request: learning_mod::SaveSentenceRequest,
) -> Result<learning_mod::SavedSentence, String> {
    learning_mod::save_sentence(&db, &request)
}

#[tauri::command]
pub async fn list_saved_sentences_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    article_id: Option<i32>,
) -> Result<Vec<learning_mod::SavedSentence>, String> {
    learning_mod::list_saved_sentences(&db, &user_id, article_id)
}

#[tauri::command]
pub async fn get_article_quiz_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    article_id: i32,
    target_lang: String,
    native_lang: String,
) -> Result<learning_mod::ArticleQuiz, String> {
    learning_mod::get_or_generate_article_quiz(
        &llm.client,
        &db,
        article_id,
        &target_lang,
        &native_lang,
    )
    .await
}

#[tauri::command]
pub async fn score_expression_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    request: learning_mod::ScoreRequest,
) -> Result<learning_mod::ScoreResult, String> {
    learning_mod::score_expression(&llm.client, &db, &request).await
}

#[tauri::command]
pub async fn get_learning_profile_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
) -> Result<learning_mod::LearningProfile, String> {
    learning_mod::get_learning_profile(&db, &user_id, &target_lang)
}

#[tauri::command]
pub async fn log_ai_call_cmd(
    db: State<'_, DatabasePool>,
    request: learning_mod::AiCallLogRequest,
) -> Result<(), String> {
    learning_mod::log_ai_call(&db, &request)
}

#[tauri::command]
pub async fn clear_ai_call_logs_cmd(
    db: State<'_, DatabasePool>,
    user_id: Option<String>,
) -> Result<(), String> {
    learning_mod::clear_ai_call_logs(&db, user_id.as_deref())
}

#[tauri::command]
pub async fn moderate_content_cmd(
    db: State<'_, DatabasePool>,
    user_id: Option<String>,
    feature_name: String,
    text: String,
    target_type: String,
    target_id: String,
) -> Result<learning_mod::ModerationResult, String> {
    learning_mod::moderate_content(
        &db,
        user_id.as_deref(),
        &feature_name,
        &text,
        &target_type,
        &target_id,
    )
}

#[tauri::command]
pub async fn import_clipboard_article_cmd(
    db: State<'_, DatabasePool>,
    request: learning_mod::ImportedArticleRequest,
) -> Result<i32, String> {
    learning_mod::import_clipboard_article(&db, &request)
}
