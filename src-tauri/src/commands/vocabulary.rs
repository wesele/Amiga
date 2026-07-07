use crate::commands::syncable::after_syncable_write;
use crate::modules::database::DatabasePool;
use crate::modules::vocabulary as vocab_mod;
use tauri::State;

#[tauri::command]
pub async fn import_vocab_bank_cmd(db: State<'_, DatabasePool>) -> Result<i32, String> {
    vocab_mod::import_vocab_bank(&db)
}

#[tauri::command]
pub async fn reimport_vocab_bank_cmd(db: State<'_, DatabasePool>) -> Result<i32, String> {
    vocab_mod::reimport_vocab_bank(&db)
}

#[tauri::command]
pub async fn init_user_vocab_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    cefr_level: String,
) -> Result<(), String> {
    vocab_mod::init_user_vocab(&db, &user_id, &cefr_level)?;
    after_syncable_write(&db);
    Ok(())
}

#[tauri::command]
pub async fn update_word_mastery_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    word_id: i32,
    mastery: i32,
    source: String,
) -> Result<(), String> {
    vocab_mod::update_word_mastery(&db, &user_id, word_id, mastery, &source)?;
    after_syncable_write(&db);
    Ok(())
}

#[tauri::command]
pub async fn get_unknown_words_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    cefr_level: String,
    limit: i32,
    target_lang: String,
) -> Result<Vec<vocab_mod::VocabWord>, String> {
    vocab_mod::get_unknown_words(&db, &user_id, &cefr_level, limit, &target_lang)
}

#[tauri::command]
pub async fn get_user_vocab_stats_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
) -> Result<vocab_mod::VocabStats, String> {
    vocab_mod::get_user_vocab_stats(&db, &user_id, &target_lang)
}

#[tauri::command]
pub async fn get_user_vocab_by_level_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    language: String,
    cefr_level: String,
) -> Result<Vec<vocab_mod::UserVocabWord>, String> {
    vocab_mod::get_user_vocab_by_level(&db, &user_id, &language, &cefr_level)
}

#[tauri::command]
pub async fn get_user_vocab_stats_by_level_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    language: String,
) -> Result<Vec<vocab_mod::LevelStats>, String> {
    vocab_mod::get_user_vocab_stats_by_level(&db, &user_id, &language)
}

#[tauri::command]
pub async fn mark_words_seen_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    word_ids: Vec<i32>,
) -> Result<(), String> {
    vocab_mod::mark_words_seen(&db, &user_id, &word_ids)?;
    after_syncable_write(&db);
    Ok(())
}

#[tauri::command]
pub async fn lookup_word_ids_cmd(
    db: State<'_, DatabasePool>,
    words: Vec<String>,
    language: String,
) -> Result<Vec<i32>, String> {
    vocab_mod::lookup_word_ids(&db, &words, &language)
}

#[tauri::command]
pub async fn ensure_words_seen_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    words: Vec<String>,
    language: String,
) -> Result<(), String> {
    vocab_mod::ensure_words_seen(&db, &user_id, &words, &language)?;
    after_syncable_write(&db);
    Ok(())
}

#[tauri::command]
pub async fn add_discovered_word_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    word: String,
    language: String,
    context: Option<String>,
) -> Result<i32, String> {
    let word_id =
        vocab_mod::add_discovered_word(&db, &user_id, &word, &language, context.as_deref())?;
    after_syncable_write(&db);
    Ok(word_id)
}

#[tauri::command]
pub async fn reset_user_vocab_by_level_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    language: String,
    cefr_level: String,
) -> Result<(), String> {
    vocab_mod::reset_user_vocab_by_level(&db, &user_id, &language, &cefr_level)?;
    after_syncable_write(&db);
    Ok(())
}
