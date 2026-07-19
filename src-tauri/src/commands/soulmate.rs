use crate::commands::llm::LlmState;
use crate::commands::syncable::after_syncable_write;
use crate::modules::database::DatabasePool;
use crate::modules::soulmate as soulmate_mod;
use tauri::State;

#[tauri::command]
pub async fn initialize_soulmate_cmd(
    db: State<'_, DatabasePool>,
    request: soulmate_mod::InitializeSoulMateRequest,
) -> Result<soulmate_mod::SoulMateWorld, String> {
    let world = soulmate_mod::initialize(&db, &request)?;
    after_syncable_write(&db);
    Ok(world)
}

#[tauri::command]
pub async fn get_soulmate_world_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
) -> Result<Option<soulmate_mod::SoulMateWorld>, String> {
    soulmate_mod::get_world(&db, &user_id, &target_lang)
}

#[tauri::command]
pub async fn update_soulmate_cmd(
    db: State<'_, DatabasePool>,
    request: soulmate_mod::InitializeSoulMateRequest,
) -> Result<soulmate_mod::SoulMateWorld, String> {
    let world = soulmate_mod::update(&db, &request)?;
    after_syncable_write(&db);
    Ok(world)
}

#[tauri::command]
pub async fn get_soulmate_home_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    user_id: String,
    target_lang: String,
) -> Result<soulmate_mod::SoulMateHome, String> {
    soulmate_mod::get_home(&llm.client, &db, &user_id, &target_lang).await
}

#[tauri::command]
pub async fn generate_soulmate_episode_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    user_id: String,
    target_lang: String,
) -> Result<soulmate_mod::SoulMateEpisode, String> {
    let episode =
        soulmate_mod::generate_today_episode(&llm.client, &db, &user_id, &target_lang).await?;
    after_syncable_write(&db);
    Ok(episode)
}

#[tauri::command]
pub async fn get_soulmate_episode_cmd(
    db: State<'_, DatabasePool>,
    episode_id: String,
) -> Result<soulmate_mod::SoulMateEpisode, String> {
    soulmate_mod::get_episode(&db, &episode_id)
}

#[tauri::command]
pub async fn mark_soulmate_story_read_cmd(
    db: State<'_, DatabasePool>,
    episode_id: String,
) -> Result<soulmate_mod::SoulMateEpisode, String> {
    let episode = soulmate_mod::mark_story_read(&db, &episode_id)?;
    after_syncable_write(&db);
    Ok(episode)
}

#[tauri::command]
pub async fn get_soulmate_chat_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    user_id: String,
    target_lang: String,
    episode_id: String,
) -> Result<Vec<soulmate_mod::SoulMateMessage>, String> {
    soulmate_mod::get_chat(&llm.client, &db, &user_id, &target_lang, &episode_id).await
}

#[tauri::command]
pub async fn submit_soulmate_turn_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    user_id: String,
    target_lang: String,
    episode_id: String,
    message: String,
) -> Result<soulmate_mod::SoulMateMessage, String> {
    let reply = soulmate_mod::submit_turn(
        &llm.client,
        &db,
        &user_id,
        &target_lang,
        &episode_id,
        &message,
    )
    .await?;
    after_syncable_write(&db);
    Ok(reply)
}

#[tauri::command]
pub async fn get_soulmate_reply_options_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    user_id: String,
    target_lang: String,
    episode_id: String,
) -> Result<Vec<String>, String> {
    soulmate_mod::get_reply_options(&llm.client, &db, &user_id, &target_lang, &episode_id).await
}

#[tauri::command]
pub async fn reset_soulmate_cmd(
    db: State<'_, DatabasePool>,
    user_id: String,
    target_lang: String,
) -> Result<bool, String> {
    let deleted = soulmate_mod::reset(&db, &user_id, &target_lang)?;
    after_syncable_write(&db);
    Ok(deleted)
}
