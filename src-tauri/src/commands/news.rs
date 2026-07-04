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
    target_lang: String,
) -> Result<Vec<news_mod::Article>, String> {
    Ok(news_mod::get_articles(&db, &region, &target_lang).unwrap_or_default())
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
