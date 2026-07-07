use crate::modules::database::DatabasePool;
use crate::modules::llm::{get_setting, save_setting};
use crate::modules::sync::types::CloudSyncStatus;
use crate::modules::user::get_or_create_user;
use chrono::Utc;
use rusqlite::params;

pub(crate) const SETTING_ENABLED: &str = "cloud_sync_enabled";
const SETTING_DEVICE_ID: &str = "cloud_sync_device_id";
pub(crate) const SETTING_LAST_SYNCED: &str = "cloud_sync_last_synced_at";
pub(crate) const SETTING_LAST_PUSHED: &str = "cloud_sync_last_pushed_at";
pub(crate) const SETTING_LAST_ERROR: &str = "cloud_sync_last_error";
/// "" | "wizard" (fresh/re-run wizard) | "reset" (settings restart 鈫?wizard)
const SETTING_RESTORE_MODE: &str = "cloud_sync_restore_mode";

const SENSITIVE_SETTING_KEYS: &[&str] = &[
    "primary_api_key",
    "backup_api_key",
    "primary_base_url",
    "primary_model",
    "backup_base_url",
    "backup_api_key",
    "backup_model",
    "llm_mode",
];

const LOCAL_ONLY_SETTING_KEYS: &[&str] = &[
    SETTING_ENABLED,
    SETTING_DEVICE_ID,
    SETTING_LAST_SYNCED,
    SETTING_LAST_PUSHED,
    SETTING_LAST_ERROR,
    SETTING_RESTORE_MODE,
];

pub(crate) fn is_sensitive_setting(key: &str) -> bool {
    SENSITIVE_SETTING_KEYS.contains(&key) || LOCAL_ONLY_SETTING_KEYS.contains(&key)
}

pub fn is_syncable_setting(key: &str) -> bool {
    !is_sensitive_setting(key)
}

pub(crate) fn is_sync_conflict_error(message: &str) -> bool {
    message.contains("409") || message.contains("conflict")
}

pub(crate) fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

pub fn get_device_id(db: &DatabasePool) -> Result<String, String> {
    if let Some(existing) = get_setting(db, SETTING_DEVICE_ID)? {
        if !existing.is_empty() {
            return Ok(existing);
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    save_setting(db, SETTING_DEVICE_ID, &id)?;
    Ok(id)
}

pub fn is_cloud_sync_enabled(db: &DatabasePool) -> Result<bool, String> {
    Ok(matches!(
        get_setting(db, SETTING_ENABLED)?.as_deref(),
        Some("true")
    ))
}

pub(crate) fn restore_mode(db: &DatabasePool) -> Result<Option<String>, String> {
    Ok(get_setting(db, SETTING_RESTORE_MODE)?.filter(|value| !value.is_empty()))
}

fn has_learning_activity(db: &DatabasePool, user_id: &str) -> Result<bool, String> {
    let conn = db.conn()?;
    let vocab_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let chat_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM chat_sessions WHERE user_id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let read_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM news_reading_log WHERE user_id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(vocab_count > 0 || chat_count > 0 || read_count > 0)
}

pub fn should_allow_restore_pull(db: &DatabasePool) -> Result<bool, String> {
    let user = get_or_create_user(db)?;
    match restore_mode(db)?.as_deref() {
        Some("reset") => Ok(true),
        Some("wizard") => Ok(!has_learning_activity(db, &user.id)?),
        _ => Ok(false),
    }
}

pub fn mark_restore_after_wizard(db: &DatabasePool) -> Result<(), String> {
    if restore_mode(db)?.as_deref() == Some("reset") {
        return Ok(());
    }
    save_setting(db, SETTING_RESTORE_MODE, "wizard")
}

pub fn mark_restore_after_reset(db: &DatabasePool) -> Result<(), String> {
    save_setting(db, SETTING_RESTORE_MODE, "reset")
}

pub(crate) fn clear_restore_mode(db: &DatabasePool) -> Result<(), String> {
    save_setting(db, SETTING_RESTORE_MODE, "")
}

pub fn get_cloud_sync_status(db: &DatabasePool) -> Result<CloudSyncStatus, String> {
    let user = get_or_create_user(db)?;
    Ok(CloudSyncStatus {
        enabled: is_cloud_sync_enabled(db)?,
        last_synced_at: get_setting(db, SETTING_LAST_SYNCED)?,
        last_error: get_setting(db, SETTING_LAST_ERROR)?,
        device_id: get_device_id(db)?,
        nickname: user.nickname,
        restore_available: should_allow_restore_pull(db)?,
    })
}
