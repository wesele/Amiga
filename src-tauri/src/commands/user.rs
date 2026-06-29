use crate::modules::database::DatabasePool;
use crate::modules::sync;
use crate::modules::user as user_mod;
use tauri::State;

fn after_syncable_write(db: &DatabasePool) {
    sync::schedule_cloud_sync(db);
}

#[tauri::command]
pub async fn create_user(
    db: State<'_, DatabasePool>,
    request: user_mod::CreateUserRequest,
) -> Result<user_mod::User, String> {
    let user = user_mod::create_user_from_wizard(&db, request)?;
    sync::mark_restore_after_wizard(&db)?;
    after_syncable_write(&db);
    Ok(user)
}

#[tauri::command]
pub async fn get_current_user(db: State<'_, DatabasePool>) -> Result<user_mod::User, String> {
    user_mod::get_or_create_user(&db)
}

#[tauri::command]
pub async fn update_user_cmd(
    db: State<'_, DatabasePool>,
    request: user_mod::UpdateUserRequest,
) -> Result<user_mod::User, String> {
    let user = user_mod::update_user(&db, request)?;
    after_syncable_write(&db);
    Ok(user)
}

#[tauri::command]
pub async fn save_learning_goal_cmd(
    db: State<'_, DatabasePool>,
    goal: user_mod::LearningGoal,
) -> Result<user_mod::LearningGoal, String> {
    let saved = user_mod::save_learning_goal(&db, goal)?;
    after_syncable_write(&db);
    Ok(saved)
}

#[tauri::command]
pub async fn get_learning_goals_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
) -> Result<Vec<user_mod::LearningGoal>, String> {
    user_mod::get_learning_goals(&db, &user_id)
}

#[tauri::command]
pub async fn is_wizard_completed_cmd(db: State<'_, DatabasePool>) -> Result<bool, String> {
    user_mod::is_wizard_completed(&db)
}

#[tauri::command]
pub async fn reset_wizard_cmd(db: State<'_, DatabasePool>) -> Result<(), String> {
    user_mod::reset_wizard(&db)?;
    sync::mark_restore_after_reset(&db)
}

#[tauri::command]
pub async fn set_target_language_cmd(
    db: State<'_, DatabasePool>,
    language: String,
) -> Result<String, String> {
    let lang = user_mod::set_target_language(&db, &language)?;
    after_syncable_write(&db);
    Ok(lang)
}

#[tauri::command]
pub async fn get_target_language_cmd(db: State<'_, DatabasePool>) -> Result<String, String> {
    user_mod::get_target_language(&db)
}