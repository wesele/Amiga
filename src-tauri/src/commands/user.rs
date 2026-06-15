use tauri::State;
use crate::modules::database::DatabasePool;
use crate::modules::user as user_mod;

#[tauri::command]
pub async fn create_user(db: State<'_, DatabasePool>, request: user_mod::CreateUserRequest) -> Result<user_mod::User, String> {
    user_mod::create_user_from_wizard(&db, request)
}

#[tauri::command]
pub async fn get_current_user(db: State<'_, DatabasePool>) -> Result<user_mod::User, String> {
    user_mod::get_or_create_user(&db)
}

#[tauri::command]
pub async fn update_user_cmd(db: State<'_, DatabasePool>, request: user_mod::UpdateUserRequest) -> Result<user_mod::User, String> {
    user_mod::update_user(&db, request)
}

#[tauri::command]
pub async fn save_learning_goal_cmd(db: State<'_, DatabasePool>, goal: user_mod::LearningGoal) -> Result<user_mod::LearningGoal, String> {
    user_mod::save_learning_goal(&db, goal)
}

#[tauri::command]
pub async fn get_learning_goals_cmd(db: State<'_, DatabasePool>, user_id: String) -> Result<Vec<user_mod::LearningGoal>, String> {
    user_mod::get_learning_goals(&db, &user_id)
}

#[tauri::command]
pub async fn is_wizard_completed_cmd(db: State<'_, DatabasePool>) -> Result<bool, String> {
    user_mod::is_wizard_completed(&db)
}

#[tauri::command]
pub async fn reset_wizard_cmd(db: State<'_, DatabasePool>) -> Result<(), String> {
    user_mod::reset_wizard(&db)
}
