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

#[tauri::command]
pub async fn get_review_summary_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
) -> Result<learning_mod::ReviewSummary, String> {
    learning_mod::get_review_summary(&db, &user_id, &target_lang)
}

#[tauri::command]
pub async fn list_review_queue_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
    limit: i32,
) -> Result<Vec<learning_mod::ReviewItem>, String> {
    learning_mod::list_review_queue(&db, &user_id, &target_lang, limit)
}

#[tauri::command]
pub async fn complete_review_item_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    item_id: String,
    remembered: bool,
) -> Result<(), String> {
    learning_mod::complete_review_item(&db, &user_id, &item_id, remembered)
}

#[tauri::command]
pub async fn record_lesson_mistake_cmd(
    db: State<'_, DatabasePool>,
    request: learning_mod::LessonMistakeRequest,
) -> Result<(), String> {
    learning_mod::record_lesson_mistake(&db, &request)
}

#[tauri::command]
pub async fn should_prompt_assessment_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
) -> Result<bool, String> {
    learning_mod::should_prompt_assessment(&db, &user_id, &target_lang)
}

#[tauri::command]
pub async fn record_assessment_event_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
    dismissed: bool,
) -> Result<(), String> {
    learning_mod::record_assessment_event(&db, &user_id, &target_lang, dismissed)
}

#[tauri::command]
pub async fn save_social_profile_cmd(
    db: State<'_, DatabasePool>,
    profile: learning_mod::SocialProfile,
) -> Result<learning_mod::SocialProfile, String> {
    learning_mod::save_social_profile(&db, &profile)
}

#[tauri::command]
pub async fn get_social_profile_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
) -> Result<learning_mod::SocialProfile, String> {
    learning_mod::get_social_profile(&db, &user_id)
}

#[tauri::command]
pub async fn get_social_recommendations_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
) -> Result<Vec<learning_mod::SocialCandidate>, String> {
    learning_mod::get_social_recommendations(&db, &user_id)
}

#[tauri::command]
pub async fn set_social_block_cmd(
    db: State<'_, DatabasePool>,
    blocker_id: String,
    blocked_id: String,
    blocked: bool,
) -> Result<(), String> {
    learning_mod::set_social_block(&db, &blocker_id, &blocked_id, blocked)
}

#[tauri::command]
pub async fn report_social_user_cmd(
    db: State<'_, DatabasePool>,
    reporter_id: String,
    target_id: String,
    reason: String,
    detail: String,
) -> Result<learning_mod::SocialReport, String> {
    learning_mod::report_social_user(&db, &reporter_id, &target_id, &reason, &detail)
}

#[tauri::command]
pub async fn list_social_reports_cmd(
    db: State<'_, DatabasePool>,
    reporter_id: String,
) -> Result<Vec<learning_mod::SocialReport>, String> {
    learning_mod::list_social_reports(&db, &reporter_id)
}

#[tauri::command]
pub async fn submit_sentence_rewrite_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
    text: String,
) -> Result<learning_mod::SentenceRewrite, String> {
    learning_mod::submit_sentence_rewrite(&db, &user_id, &target_lang, &text)
}

#[tauri::command]
pub async fn adopt_sentence_rewrite_cmd(
    db: State<'_, DatabasePool>,
    rewrite_id: i32,
    user_id: String,
    target_lang: String,
) -> Result<learning_mod::SavedSentence, String> {
    learning_mod::adopt_sentence_rewrite(&db, rewrite_id, &user_id, &target_lang)
}

#[tauri::command]
pub async fn ask_culture_question_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
    question: String,
) -> Result<learning_mod::CultureQuestion, String> {
    learning_mod::ask_culture_question(&db, &user_id, &target_lang, &question)
}

#[tauri::command]
pub async fn save_culture_question_card_cmd(
    db: State<'_, DatabasePool>,
    question_id: i32,
    user_id: String,
    target_lang: String,
) -> Result<learning_mod::SavedSentence, String> {
    learning_mod::save_culture_question_card(&db, question_id, &user_id, &target_lang)
}

#[tauri::command]
pub async fn get_article_version_cmd(
    db: State<'_, DatabasePool>,
    article_id: i32,
    cefr_level: String,
) -> Result<learning_mod::ArticleVersion, String> {
    learning_mod::get_article_version(&db, article_id, &cefr_level)
}
