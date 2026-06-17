use tauri::State;
use crate::modules::database::DatabasePool;
use crate::modules::prompts as prompts_mod;

#[tauri::command]
pub async fn get_all_prompts_cmd(db: State<'_, DatabasePool>) -> Result<Vec<prompts_mod::Prompt>, String> {
    prompts_mod::get_all_prompts(&db)
}

#[tauri::command]
pub async fn get_prompt_cmd(db: State<'_, DatabasePool>, key: String) -> Result<prompts_mod::Prompt, String> {
    prompts_mod::get_prompt(&db, &key)
}

#[tauri::command]
pub async fn save_prompt_cmd(
    db: State<'_, DatabasePool>,
    key: String,
    name: String,
    category: String,
    system_prompt: String,
    user_prompt_template: String,
) -> Result<(), String> {
    prompts_mod::save_prompt(&db, &key, &name, &category, &system_prompt, &user_prompt_template)
}

#[tauri::command]
pub async fn reset_prompt_cmd(
    db: State<'_, DatabasePool>,
    key: String,
) -> Result<prompts_mod::Prompt, String> {
    prompts_mod::reset_prompt_to_default(&db, &key)
}

#[tauri::command]
pub async fn reset_all_prompts_cmd(db: State<'_, DatabasePool>) -> Result<usize, String> {
    prompts_mod::reset_all_prompts(&db)
}
