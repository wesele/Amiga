use crate::commands::llm::LlmState;
use crate::modules::database::DatabasePool;
use crate::modules::news as news_mod;
use crate::modules::sync;
use tauri::State;

#[tauri::command]
pub async fn fetch_news_cmd(
    db: State<'_, DatabasePool>,
    region: String,
    target_lang: String,
) -> Result<Vec<news_mod::Article>, String> {
    Ok(news_mod::fetch_news(&db, &region, &target_lang).await)
}

#[tauri::command]
pub async fn get_articles_cmd(
    db: State<'_, DatabasePool>,
    region: String,
) -> Result<Vec<news_mod::Article>, String> {
    Ok(news_mod::get_articles(&db, &region).unwrap_or_default())
}

#[tauri::command]
pub async fn get_article_cmd(
    db: State<'_, DatabasePool>,
    article_id: i32,
) -> Result<news_mod::Article, String> {
    news_mod::get_article(&db, article_id)
}

#[tauri::command]
pub async fn save_reading_log_cmd(
    db: State<'_, DatabasePool>,
    log_entry: news_mod::ReadingLog,
) -> Result<(), String> {
    news_mod::save_reading_log(&db, &log_entry)?;
    sync::schedule_cloud_sync(&db);
    Ok(())
}

#[tauri::command]
pub async fn get_read_article_count_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
) -> Result<i32, String> {
    news_mod::get_read_article_count(&db, &user_id)
}

#[tauri::command]
pub async fn get_articles_reading_status_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    article_ids: Vec<i32>,
) -> Result<Vec<news_mod::ArticleReadingStatus>, String> {
    news_mod::get_articles_reading_status(&db, &user_id, &article_ids)
}

#[tauri::command]
pub async fn get_comprehension_quiz_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    article_id: i32,
    cefr_level: String,
    native_lang: String,
    target_lang: String,
) -> Result<Option<news_mod::ComprehensionQuiz>, String> {
    news_mod::get_or_generate_comprehension_quiz(
        &llm.client,
        &db,
        article_id,
        &cefr_level,
        &native_lang,
        &target_lang,
    )
    .await
}
