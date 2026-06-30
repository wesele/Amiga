use crate::modules::database::DatabasePool;
use crate::modules::path as path_mod;
use crate::modules::sync;
use crate::modules::user as user_mod;
use tauri::State;

fn after_syncable_write(db: &DatabasePool) {
    sync::schedule_cloud_sync(db);
}

#[tauri::command]
pub async fn get_path_curriculum_cmd(
    db: State<'_, DatabasePool>,
    native_lang: String,
    target_lang: String,
    cefr: String,
) -> Result<path_mod::PathCurriculum, String> {
    let user = user_mod::get_or_create_user(&db)?;
    path_mod::get_path_curriculum(&db, &user.id, &native_lang, &target_lang, &cefr)
}

#[tauri::command]
pub async fn get_section_lesson_cmd(
    db: State<'_, DatabasePool>,
    native_lang: String,
    target_lang: String,
    cefr: String,
    section_id: String,
) -> Result<path_mod::PathLesson, String> {
    let user = user_mod::get_or_create_user(&db)?;
    path_mod::get_section_lesson(
        &db,
        &user.id,
        &native_lang,
        &target_lang,
        &cefr,
        &section_id,
    )
}

#[tauri::command]
pub async fn get_teaching_content_cmd(
    db: State<'_, DatabasePool>,
    native_lang: String,
    target_lang: String,
    cefr: String,
    node_id: String,
) -> Result<path_mod::PathTeaching, String> {
    let user = user_mod::get_or_create_user(&db)?;
    path_mod::get_teaching_content(
        &db,
        &user.id,
        &native_lang,
        &target_lang,
        &cefr,
        &node_id,
    )
}

#[tauri::command]
pub async fn complete_teaching_node_cmd(
    db: State<'_, DatabasePool>,
    native_lang: String,
    target_lang: String,
    cefr: String,
    node_id: String,
) -> Result<path_mod::CompleteSectionResult, String> {
    let user = user_mod::get_or_create_user(&db)?;
    let result = path_mod::complete_teaching_node(
        &db,
        &user.id,
        &native_lang,
        &target_lang,
        &cefr,
        &node_id,
    )?;
    after_syncable_write(&db);
    Ok(result)
}

#[tauri::command]
pub async fn complete_section_cmd(
    db: State<'_, DatabasePool>,
    native_lang: String,
    target_lang: String,
    cefr: String,
    section_id: String,
    correct_count: i32,
    total_count: i32,
) -> Result<path_mod::CompleteSectionResult, String> {
    let user = user_mod::get_or_create_user(&db)?;
    let result = path_mod::complete_section(
        &db,
        &user.id,
        &native_lang,
        &target_lang,
        &cefr,
        &section_id,
        correct_count,
        total_count,
    )?;
    after_syncable_write(&db);
    Ok(result)
}