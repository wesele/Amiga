use tauri::State;
use crate::modules::database::DatabasePool;
use crate::modules::vocabulary as vocab_mod;

#[tauri::command]
pub async fn import_vocab_bank_cmd(db: State<'_, DatabasePool>) -> Result<i32, String> {
    vocab_mod::import_vocab_bank(&db)
}

#[tauri::command]
pub async fn init_user_vocab_cmd(db: State<'_, DatabasePool>, user_id: String, cefr_level: String) -> Result<(), String> {
    vocab_mod::init_user_vocab(&db, &user_id, &cefr_level)
}

#[tauri::command]
pub async fn update_word_mastery_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    word_id: i32,
    mastery: i32,
    source: String,
) -> Result<(), String> {
    vocab_mod::update_word_mastery(&db, &user_id, word_id, mastery, &source)
}

#[tauri::command]
pub async fn get_unknown_words_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    cefr_level: String,
    limit: i32,
) -> Result<Vec<vocab_mod::VocabWord>, String> {
    vocab_mod::get_unknown_words(&db, &user_id, &cefr_level, limit)
}

#[tauri::command]
pub async fn get_user_vocab_stats_cmd(db: State<'_, DatabasePool>, user_id: String) -> Result<vocab_mod::VocabStats, String> {
    vocab_mod::get_user_vocab_stats(&db, &user_id)
}
