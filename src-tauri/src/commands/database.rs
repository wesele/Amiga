use crate::modules::database::DatabasePool;
use serde::Serialize;
use tauri::{AppHandle, State};

/// Returns whether the current database schema is compatible with this
/// app version.
///
/// If the database was written by a *newer* version of the app (e.g. a
/// restored backup from a future release), the schema may contain
/// migration versions the current app doesn't know about. This command
/// lets the frontend detect that situation and prompt the user to reset.
#[tauri::command]
pub fn is_schema_compatible_cmd(db: State<'_, DatabasePool>) -> bool {
    db.is_schema_compatible()
}

/// Detailed status for early startup health check. Used to distinguish
/// hard open failure (corrupt old data) vs soft schema-incompatible.
#[derive(Serialize)]
pub struct DatabaseStatus {
    pub ok: bool,
    pub error: Option<String>,
    pub schema_compatible: bool,
}

#[tauri::command]
pub fn get_database_status_cmd(db: State<'_, DatabasePool>) -> DatabaseStatus {
    let err = db.load_error();
    let compat = db.is_schema_compatible();
    DatabaseStatus {
        ok: err.is_none() && compat,
        error: err,
        schema_compatible: compat,
    }
}

/// Resets the database to a clean state: drops all tables, clears
/// migration history, and re-runs every migration from scratch.
///
/// The user should confirm via a frontend dialog before calling this.
/// After a successful reset, the frontend should reload the app so all
/// in-memory state is re-fetched.
#[tauri::command]
pub fn reset_database_cmd(db: State<'_, DatabasePool>) -> Result<(), String> {
    db.reset_database()
}

/// Physically delete the DB file. Intended only for recovery from
/// unopenable old data. Does not affect the in-memory stand-in.
#[tauri::command]
pub fn delete_database_file_cmd(db: State<'_, DatabasePool>) -> Result<(), String> {
    db.delete_database_file()
}

/// Delete the bad old data file and immediately restart the app process.
/// After restart the app will create a fresh database.
#[tauri::command]
pub fn delete_database_and_restart_cmd(
    app: AppHandle,
    db: State<'_, DatabasePool>,
) -> Result<(), String> {
    let _ = db.delete_database_file();
    app.restart();
    #[allow(unreachable_code)]
    Ok(())
}

/// Exit the application (used from recovery "exit" choice).
#[tauri::command]
pub fn exit_app_cmd(app: AppHandle) {
    app.exit(0);
}
