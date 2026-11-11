use crate::commands::llm::LlmState;
use crate::modules::{classroom, database::DatabasePool};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

fn report_progress(
    app: AppHandle,
    request_id: Option<String>,
) -> impl Fn(classroom::PlanStage, classroom::TokenProgress) {
    move |stage, token_count| {
        if let Some(id) = &request_id {
            let _ = app.emit(
                "classroom-plan-progress",
                serde_json::json!({"id": id, "stage": stage, "tokenCount": token_count}),
            );
        }
    }
}

#[tauri::command]
pub async fn get_chapter_classroom_cmd(
    db: State<'_, DatabasePool>,
    chapter_id: i64,
) -> Result<Value, String> {
    classroom::get_classroom(&db, chapter_id)
}

#[tauri::command]
pub async fn generate_chapter_teaching_plan_cmd(
    app: AppHandle,
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    chapter_id: i64,
    regenerate: Option<bool>,
    request_id: Option<String>,
) -> Result<Value, String> {
    classroom::generate_plan(
        &db,
        &llm.client,
        chapter_id,
        regenerate.unwrap_or(false),
        report_progress(app, request_id),
    )
    .await
}

#[tauri::command]
pub async fn generate_topic_teaching_plan_cmd(
    app: AppHandle,
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    goal: String,
    locale: String,
    request_id: Option<String>,
) -> Result<Value, String> {
    classroom::generate_topic_plan(
        &db,
        &llm.client,
        &goal,
        &locale,
        report_progress(app, request_id),
    )
    .await
}

#[tauri::command]
pub async fn save_chapter_classroom_cmd(
    db: State<'_, DatabasePool>,
    chapter_id: i64,
    session: Value,
) -> Result<Value, String> {
    classroom::save_session(&db, chapter_id, session)
}

#[tauri::command]
pub async fn get_classroom_live_config_cmd(db: State<'_, DatabasePool>) -> Result<Value, String> {
    let config = crate::modules::llm::get_multimodal_config(&db)?;
    let active = config.active().unwrap_or(&config.builtin);
    Ok(
        serde_json::json!({"api_key":active.api_key,"base_url":active.base_url,"model":active.model}),
    )
}
