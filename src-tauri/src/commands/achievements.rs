use crate::commands::syncable::after_syncable_write;
use crate::modules::achievements as achievements_mod;
use crate::modules::database::DatabasePool;
use tauri::State;

#[tauri::command]
pub async fn get_achievement_days_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    start_date: String,
    end_date: String,
) -> Result<Vec<achievements_mod::AchievementDay>, String> {
    achievements_mod::get_achievement_days(&db, &user_id, &start_date, &end_date)
}

#[tauri::command]
pub async fn record_app_open_cmd(db: State<'_, DatabasePool>) -> Result<bool, String> {
    let inserted = achievements_mod::record_app_open(&db)?;
    if inserted {
        after_syncable_write(&db);
    }
    Ok(inserted)
}

#[tauri::command]
pub async fn get_achievement_progress_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
) -> Result<achievements_mod::AchievementProgress, String> {
    achievements_mod::get_achievement_progress(&db, &user_id)
}
