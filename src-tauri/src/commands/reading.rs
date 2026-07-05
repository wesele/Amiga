use crate::commands::llm::LlmState;
use crate::modules::database::DatabasePool;
use crate::modules::reading as reading_mod;
use tauri::State;

#[tauri::command]
pub async fn get_reading_articles_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_language: String,
) -> Result<Vec<reading_mod::ReadingArticle>, String> {
    reading_mod::get_reading_articles(&db, &user_id, &target_language)
}

#[tauri::command]
pub async fn ensure_reading_article_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    user_id: String,
    target_language: String,
    cefr_level: String,
    native_lang: String,
) -> Result<reading_mod::ReadingArticle, String> {
    reading_mod::ensure_reading_article(
        &llm.client,
        &db,
        &user_id,
        &target_language,
        &cefr_level,
        &native_lang,
    )
    .await
}

#[tauri::command]
pub async fn get_reading_article_cmd(
    db: State<'_, DatabasePool>,
    article_id: i64,
) -> Result<reading_mod::ReadingArticle, String> {
    reading_mod::get_reading_article(&db, article_id)
}

#[tauri::command]
pub async fn mark_reading_article_read_cmd(
    db: State<'_, DatabasePool>,
    article_id: i64,
) -> Result<(), String> {
    reading_mod::mark_article_read(&db, article_id)
}

#[tauri::command]
pub async fn get_or_generate_reading_test_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    article_id: i64,
    target_language: String,
    cefr_level: String,
) -> Result<Vec<reading_mod::ReadingQuestion>, String> {
    reading_mod::get_or_generate_reading_test(
        &llm.client,
        &db,
        article_id,
        &target_language,
        &cefr_level,
    )
    .await
}

#[tauri::command]
pub async fn explain_reading_answer_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    article_id: i64,
    question_index: usize,
    question_json: String,
    user_answer: String,
    correct_answer: String,
    target_language: String,
    native_lang: String,
) -> Result<String, String> {
    reading_mod::explain_reading_answer(
        &llm.client,
        &db,
        article_id,
        question_index,
        &question_json,
        &user_answer,
        &correct_answer,
        &target_language,
        &native_lang,
    )
    .await
}

#[tauri::command]
pub async fn submit_reading_test_cmd(
    db: State<'_, DatabasePool>,
    article_id: i64,
    user_id: String,
    answers_json: String,
    correct_count: i32,
    total_count: i32,
) -> Result<(), String> {
    reading_mod::submit_reading_test(
        &db,
        article_id,
        &user_id,
        &answers_json,
        correct_count,
        total_count,
    )
}

#[tauri::command]
pub async fn get_reading_test_explanations_cmd(
    db: State<'_, DatabasePool>,
    article_id: i64,
) -> Result<Vec<String>, String> {
    reading_mod::get_reading_test_explanations(&db, article_id)
}
