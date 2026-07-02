use crate::commands::llm::LlmState;
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
pub async fn get_lesson_milestone_progress_cmd(
    db: State<'_, DatabasePool>,
    native_lang: String,
    target_lang: String,
) -> Result<path_mod::LessonMilestoneProgress, String> {
    let user = user_mod::get_or_create_user(&db)?;
    path_mod::get_lesson_milestone_progress(&db, &user.id, &native_lang, &target_lang)
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
pub async fn get_focus_practice_cmd(
    db: State<'_, DatabasePool>,
    native_lang: String,
    target_lang: String,
    cefr: String,
    question_type: String,
    limit: Option<usize>,
) -> Result<path_mod::FocusPracticeSession, String> {
    let user = user_mod::get_or_create_user(&db)?;
    path_mod::get_focus_practice(
        &db,
        &user.id,
        &native_lang,
        &target_lang,
        &cefr,
        &question_type,
        limit.unwrap_or(path_mod::FOCUS_PRACTICE_SESSION_LIMIT),
    )
}

#[tauri::command]
pub fn get_grammar_explanation_cached_cmd(
    db: State<'_, DatabasePool>,
    cefr: String,
    unit_id: String,
    point_text: String,
) -> Result<Option<String>, String> {
    path_mod::get_grammar_explanation_cache(
        &db,
        path_mod::PRIMARY_PAIR_KEY,
        &cefr,
        &unit_id,
        &point_text,
    )
}

#[tauri::command]
pub async fn explain_grammar_point_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    cefr: String,
    target_lang: String,
    unit_id: String,
    point_text: String,
    unit_title: String,
    unit_goal: String,
) -> Result<crate::modules::llm::GrammarExplainResult, String> {
    path_mod::explain_grammar_point(
        &llm.client,
        &db,
        &cefr,
        &target_lang,
        &unit_id,
        &point_text,
        &unit_title,
        &unit_goal,
    )
    .await
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
    path_mod::get_teaching_content(&db, &user.id, &native_lang, &target_lang, &cefr, &node_id)
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
pub async fn get_perfect_lesson_streak_cmd(
    db: State<'_, DatabasePool>,
) -> Result<path_mod::PerfectLessonStreak, String> {
    let user = user_mod::get_or_create_user(&db)?;
    path_mod::load_perfect_lesson_streak(&db, &user.id)
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
    #[allow(non_snake_case)] isPerfect: bool,
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
        isPerfect,
    )?;
    after_syncable_write(&db);
    Ok(result)
}
