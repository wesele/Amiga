use crate::modules::database::DatabasePool;
use crate::modules::sync::{
    self, CloudSyncStatus, CloudSyncTestResult, RunCloudSyncResult, SetCloudSyncEnabledResult,
};
use tauri::State;

#[tauri::command]
pub async fn test_cloud_sync_cmd() -> Result<CloudSyncTestResult, String> {
    sync::test_cloud_sync().await
}

#[tauri::command]
pub fn get_cloud_sync_status_cmd(db: State<'_, DatabasePool>) -> Result<CloudSyncStatus, String> {
    sync::get_cloud_sync_status(&db)
}

#[tauri::command]
pub async fn set_cloud_sync_enabled_cmd(
    db: State<'_, DatabasePool>,
    enabled: bool,
    force_enable: Option<bool>,
) -> Result<SetCloudSyncEnabledResult, String> {
    sync::set_cloud_sync_enabled(&db, enabled, force_enable.unwrap_or(false)).await
}

#[tauri::command]
pub async fn run_cloud_sync_cmd(db: State<'_, DatabasePool>) -> Result<RunCloudSyncResult, String> {
    sync::run_cloud_sync(&db).await
}