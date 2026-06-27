use crate::modules::database::DatabasePool;
use tauri::State;

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
