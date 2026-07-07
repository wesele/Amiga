use crate::modules::sync::types::{CloudSyncTestResult, RemoteSnapshot};
use crate::modules::sync_config::sync_api_base_url;

pub async fn test_cloud_sync() -> Result<CloudSyncTestResult, String> {
    let url = format!("{}/api/sync/ping", sync_api_base_url());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => Ok(CloudSyncTestResult {
            success: true,
            message: "ok".to_string(),
        }),
        Ok(resp) => Ok(CloudSyncTestResult {
            success: false,
            message: format!("HTTP {}", resp.status()),
        }),
        Err(e) => Ok(CloudSyncTestResult {
            success: false,
            message: e.to_string(),
        }),
    }
}

pub(crate) async fn pull_remote_snapshot(user_id: &str) -> Result<Option<RemoteSnapshot>, String> {
    let base_url = sync_api_base_url();
    let url = format!(
        "{}/api/sync/pull?userId={}",
        base_url,
        urlencoding_encode(user_id)
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Sync pull failed: {}", e))?;

    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!("Sync pull HTTP {}", resp.status()));
    }

    resp.json::<RemoteSnapshot>()
        .await
        .map(Some)
        .map_err(|e| format!("Sync pull parse error: {}", e))
}

pub(crate) async fn push_remote_snapshot(
    user_id: &str,
    payload_json: &str,
    updated_at: &str,
    device_id: &str,
    base_updated_at: Option<&str>,
) -> Result<(), String> {
    let url = format!("{}/api/sync/push", sync_api_base_url());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let body = serde_json::json!({
        "userId": user_id,
        "payload": payload_json,
        "updatedAt": updated_at,
        "deviceId": device_id,
        "baseUpdatedAt": base_updated_at,
    });

    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Sync push failed: {}", e))?;

    if resp.status() == reqwest::StatusCode::CONFLICT {
        return Err("Sync push conflict: remote changed".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("Sync push HTTP {}", resp.status()));
    }
    Ok(())
}

pub(crate) fn urlencoding_encode(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => ch.to_string(),
            _ => format!("%{:02X}", ch as u32),
        })
        .collect()
}
