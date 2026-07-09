mod payload;
mod remote;
mod settings;
mod types;

use crate::modules::database::DatabasePool;
use crate::modules::llm::save_setting;
use crate::modules::sync::remote::{pull_remote_snapshot, push_remote_snapshot};
use crate::modules::sync::settings::{
    clear_restore_mode, get_device_id, is_sync_conflict_error, now_iso, SETTING_ENABLED,
    SETTING_LAST_ERROR, SETTING_LAST_PUSHED, SETTING_LAST_SYNCED,
};
use crate::modules::sync::types::{RemoteSnapshot, SyncPayload};
use crate::modules::user::{
    create_user_from_wizard, get_learning_goals, get_or_create_user, CreateUserRequest,
};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use tokio::sync::Mutex as AsyncMutex;

pub use payload::{export_sync_payload, import_sync_payload};
pub use remote::test_cloud_sync;
pub use settings::{
    get_cloud_sync_status, is_cloud_sync_enabled, is_syncable_setting, mark_restore_after_reset,
    mark_restore_after_wizard, should_allow_restore_pull,
};
pub use types::{
    CloudRestoreResult, CloudSyncStatus, CloudSyncTestResult, RunCloudSyncResult,
    SetCloudSyncEnabledResult,
};

const SYNC_DEBOUNCE_MS: u64 = 3000;
const SYNC_MAX_ATTEMPTS: u32 = 2;

static SYNC_DEBOUNCE_GEN: AtomicU64 = AtomicU64::new(0);

fn sync_mutex() -> &'static AsyncMutex<()> {
    static MUTEX: OnceLock<AsyncMutex<()>> = OnceLock::new();
    MUTEX.get_or_init(|| AsyncMutex::new(()))
}

pub fn schedule_cloud_sync(db: &DatabasePool) {
    if !is_cloud_sync_enabled(db).unwrap_or(false) {
        return;
    }

    let db = db.clone();
    let generation = SYNC_DEBOUNCE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(SYNC_DEBOUNCE_MS)).await;
        if SYNC_DEBOUNCE_GEN.load(Ordering::SeqCst) != generation {
            return;
        }
        if let Err(e) = run_cloud_sync(&db).await {
            log::warn!("Background cloud sync failed: {}", e);
        }
    });
}

async fn pull_remote_into_local(
    db: &DatabasePool,
    remote: RemoteSnapshot,
) -> Result<RunCloudSyncResult, String> {
    let payload: SyncPayload = serde_json::from_str(&remote.payload)
        .map_err(|e| format!("Invalid remote sync payload: {}", e))?;
    import_sync_payload(db, &payload)?;
    save_setting(db, SETTING_LAST_PUSHED, &remote.updated_at)?;
    save_setting(db, SETTING_LAST_SYNCED, &remote.updated_at)?;
    save_setting(db, SETTING_LAST_ERROR, "")?;
    clear_restore_mode(db)?;
    log::info!("Cloud sync completed via pull (restore)");
    Ok(RunCloudSyncResult {
        direction: "pull".to_string(),
        updated_at: remote.updated_at,
    })
}

async fn push_local_snapshot(
    db: &DatabasePool,
    nickname: &str,
    device_id: &str,
) -> Result<RunCloudSyncResult, String> {
    let remote = pull_remote_snapshot(nickname).await?;
    let payload = export_sync_payload(db)?;
    let payload_json = serde_json::to_string(&payload)
        .map_err(|e| format!("Failed to serialize sync payload: {}", e))?;
    let stamp = now_iso();
    let base = remote.as_ref().map(|row| row.updated_at.as_str());

    if let Err(err) = push_remote_snapshot(nickname, &payload_json, &stamp, device_id, base).await {
        if is_sync_conflict_error(&err) {
            let remote = pull_remote_snapshot(nickname)
                .await?
                .ok_or_else(|| "Sync push conflict but remote disappeared".to_string())?;
            push_remote_snapshot(
                nickname,
                &payload_json,
                &stamp,
                device_id,
                Some(&remote.updated_at),
            )
            .await?;
        } else {
            return Err(err);
        }
    }

    save_setting(db, SETTING_LAST_PUSHED, &stamp)?;
    save_setting(db, SETTING_LAST_SYNCED, &stamp)?;
    save_setting(db, SETTING_LAST_ERROR, "")?;
    clear_restore_mode(db)?;
    log::info!("Cloud sync completed via push");
    Ok(RunCloudSyncResult {
        direction: "push".to_string(),
        updated_at: stamp,
    })
}

async fn run_cloud_sync_attempt(db: &DatabasePool) -> Result<RunCloudSyncResult, String> {
    let user = get_or_create_user(db)?;
    let nickname = user.nickname.trim().to_string();
    if nickname.is_empty() {
        return Err("Nickname is required for cloud sync".to_string());
    }

    let device_id = get_device_id(db)?;

    if should_allow_restore_pull(db)? {
        if let Some(remote) = pull_remote_snapshot(&nickname).await? {
            return pull_remote_into_local(db, remote).await;
        }
    }

    push_local_snapshot(db, &nickname, &device_id).await
}

pub async fn run_cloud_sync(db: &DatabasePool) -> Result<RunCloudSyncResult, String> {
    if !is_cloud_sync_enabled(db)? {
        return Err("Cloud sync is disabled".to_string());
    }

    let _guard = sync_mutex().lock().await;

    for attempt in 0..SYNC_MAX_ATTEMPTS {
        match run_cloud_sync_attempt(db).await {
            Ok(result) => return Ok(result),
            Err(err) if is_sync_conflict_error(&err) && attempt + 1 < SYNC_MAX_ATTEMPTS => {
                log::info!(
                    "Cloud sync push conflict, retrying (attempt {})",
                    attempt + 2
                );
            }
            Err(err) if err.contains("disabled") => return Err(err),
            Err(err) => {
                let _ = save_setting(db, SETTING_LAST_ERROR, &err);
                return Err(err);
            }
        }
    }

    let err = "Cloud sync failed after conflict retries".to_string();
    let _ = save_setting(db, SETTING_LAST_ERROR, &err);
    Err(err)
}

/// Returns whether a restorable cloud snapshot exists for the given nickname.
/// Used by the first wizard step to decide whether to offer cloud restore.
/// Network/parse errors are surfaced so the caller can fall back to the
/// regular wizard instead of blocking onboarding.
pub async fn check_cloud_restore_available(nickname: &str) -> Result<bool, String> {
    let nickname = nickname.trim();
    if nickname.is_empty() {
        return Ok(false);
    }
    let remote = pull_remote_snapshot(nickname).await?;
    Ok(remote.is_some())
}

/// Restores a user's data from the cloud during the first wizard step.
///
/// Flow: pull the remote snapshot for `nickname`; if none exists, return
/// `restored: false` so the regular wizard proceeds. Otherwise create a
/// placeholder local user (wizard NOT completed yet), import the remote
/// payload on top of it, mark the wizard completed, and record sync
/// timestamps. On import failure the placeholder user is left with an
/// uncompleted wizard so the caller can continue the regular wizard.
pub async fn restore_from_cloud_during_wizard(
    db: &DatabasePool,
    nickname: &str,
) -> Result<CloudRestoreResult, String> {
    let nickname = nickname.trim().to_string();
    if nickname.is_empty() {
        return Err("Nickname is required to restore from cloud".to_string());
    }

    let remote = match pull_remote_snapshot(&nickname).await? {
        Some(remote) => remote,
        None => {
            return Ok(CloudRestoreResult {
                restored: false,
                nickname,
                target_language: None,
                cefr_level: None,
                message: "no_remote_data".to_string(),
            });
        }
    };

    // Create a placeholder local user (NOT completed) so import_sync_payload
    // has a target user to reconcile against.
    let request = CreateUserRequest {
        nickname: nickname.clone(),
        avatar: "😊".to_string(),
        native_language: "zh".to_string(),
        country: "CN".to_string(),
        gender: None,
        birth_year: None,
        age_range: None,
        wizard_completed: Some(false),
    };
    let user = create_user_from_wizard(db, request)?;

    let import_result: Result<(), String> = (|| {
        let payload: SyncPayload = serde_json::from_str(&remote.payload)
            .map_err(|e| format!("Invalid remote sync payload: {}", e))?;
        import_sync_payload(db, &payload)
    })();

    if let Err(e) = import_result {
        // Roll back the placeholder to an uncompleted wizard so the user is not
        // dropped into the app with a half-restored profile.
        if let Ok(conn) = db.conn() {
            let _ = conn.execute(
                "UPDATE users SET wizard_completed = 0 WHERE id = (SELECT id FROM users LIMIT 1)",
                [],
            );
        }
        return Err(e);
    }

    // The remote payload carries its own wizard_completed flag; force it on so
    // onboarding is considered done once data is restored.
    {
        let conn = db.conn()?;
        conn.execute(
            "UPDATE users SET wizard_completed = 1 WHERE id = (SELECT id FROM users LIMIT 1)",
            [],
        )
        .map_err(|e| format!("Failed to mark wizard completed: {}", e))?;
    }

    save_setting(db, SETTING_LAST_SYNCED, &remote.updated_at)?;
    save_setting(db, SETTING_LAST_PUSHED, &remote.updated_at)?;
    save_setting(db, SETTING_LAST_ERROR, "")?;
    clear_restore_mode(db)?;

    let goal = get_learning_goals(db, &user.id)
        .ok()
        .and_then(|goals| goals.into_iter().next());

    Ok(CloudRestoreResult {
        restored: true,
        nickname: user.nickname,
        target_language: goal.as_ref().map(|g| g.target_language.clone()),
        cefr_level: goal.as_ref().map(|g| g.cefr_level.clone()),
        message: "restored".to_string(),
    })
}

pub async fn set_cloud_sync_enabled(
    db: &DatabasePool,
    enabled: bool,
    force_enable: bool,
) -> Result<SetCloudSyncEnabledResult, String> {
    if !enabled {
        save_setting(db, SETTING_ENABLED, "false")?;
        return Ok(SetCloudSyncEnabledResult {
            enabled: false,
            remote_conflict: false,
            remote_device_id: None,
            remote_updated_at: None,
        });
    }

    let test = test_cloud_sync().await?;
    if !test.success {
        return Err(format!(
            "Cloud sync connectivity test failed: {}",
            test.message
        ));
    }

    let nickname = get_or_create_user(db)?.nickname.trim().to_string();
    if nickname.is_empty() {
        return Err("Nickname is required before enabling cloud sync".to_string());
    }

    let device_id = get_device_id(db)?;
    let allow_restore = should_allow_restore_pull(db)?;
    let remote = pull_remote_snapshot(&nickname).await?;
    let mut remote_conflict = false;
    let mut remote_device_id = None;
    let mut remote_updated_at = None;

    if let Some(remote) = remote {
        remote_device_id = Some(remote.device_id.clone());
        remote_updated_at = Some(remote.updated_at.clone());
        if allow_restore && remote.device_id != device_id && !force_enable {
            remote_conflict = true;
            return Ok(SetCloudSyncEnabledResult {
                enabled: false,
                remote_conflict,
                remote_device_id,
                remote_updated_at,
            });
        }
    }

    save_setting(db, SETTING_ENABLED, "true")?;
    match run_cloud_sync(db).await {
        Ok(_) => Ok(SetCloudSyncEnabledResult {
            enabled: true,
            remote_conflict,
            remote_device_id,
            remote_updated_at,
        }),
        Err(err) => {
            save_setting(db, SETTING_ENABLED, "false")?;
            save_setting(db, SETTING_LAST_ERROR, &err)?;
            Err(err)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::llm::get_setting;
    use crate::modules::sync::settings::restore_mode;
    use crate::modules::sync::types::SyncReadingLogRow;
    use crate::modules::sync_config::{normalize_api_base_url, SYNC_API_BASE_URL};
    use crate::modules::user::{create_user_from_wizard, CreateUserRequest};
    use rusqlite::params;
    use std::collections::HashSet;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    fn seed_user(pool: &DatabasePool) -> String {
        let user = create_user_from_wizard(
            pool,
            CreateUserRequest {
                nickname: "SyncUser".to_string(),
                avatar: "avatar-a".to_string(),
                native_language: "zh".to_string(),
                country: "CN".to_string(),
                gender: None,
                birth_year: None,
                age_range: None,
                wizard_completed: None,
            },
        )
        .unwrap();
        user.id
    }

    #[test]
    fn export_filters_sensitive_settings() {
        let pool = test_pool();
        seed_user(&pool);
        save_setting(&pool, "ui_language", "en").unwrap();
        save_setting(&pool, "primary_api_key", "secret").unwrap();
        save_setting(&pool, "cloud_sync_enabled", "true").unwrap();

        let payload = export_sync_payload(&pool).unwrap();
        let keys: HashSet<String> = payload
            .app_settings
            .iter()
            .map(|row| row.key.clone())
            .collect();

        assert!(keys.contains("ui_language"));
        assert!(!keys.contains("primary_api_key"));
        assert!(!keys.contains("cloud_sync_enabled"));
    }

    #[test]
    fn import_updates_profile_without_changing_local_user_id() {
        let pool = test_pool();
        let local_id = seed_user(&pool);

        let mut payload = export_sync_payload(&pool).unwrap();
        payload.users[0].nickname = "Renamed".to_string();
        payload.users[0].avatar = "avatar-b".to_string();
        import_sync_payload(&pool, &payload).unwrap();

        let user = get_or_create_user(&pool).unwrap();
        assert_eq!(user.id, local_id);
        assert_eq!(user.nickname, "Renamed");
        assert_eq!(user.avatar, "avatar-b");
    }

    #[test]
    fn cloud_sync_disabled_by_default() {
        let pool = test_pool();
        seed_user(&pool);
        assert!(!is_cloud_sync_enabled(&pool).unwrap());
    }

    #[test]
    fn is_syncable_setting_filters_sensitive_and_local_keys() {
        assert!(is_syncable_setting("ui_language"));
        assert!(!is_syncable_setting("primary_api_key"));
        assert!(!is_syncable_setting("cloud_sync_enabled"));
        assert!(!is_syncable_setting("cloud_sync_restore_mode"));
    }

    #[test]
    fn normalize_api_base_url_uses_trimmed_override_without_trailing_slash() {
        assert_eq!(
            normalize_api_base_url(Some(" https://local.test/ "), SYNC_API_BASE_URL),
            "https://local.test"
        );
        assert_eq!(
            normalize_api_base_url(Some(""), SYNC_API_BASE_URL),
            SYNC_API_BASE_URL
        );
        assert_eq!(
            normalize_api_base_url(None, SYNC_API_BASE_URL),
            SYNC_API_BASE_URL
        );
    }

    #[test]
    fn restore_pull_allowed_after_wizard_before_learning_activity() {
        let pool = test_pool();
        seed_user(&pool);
        mark_restore_after_wizard(&pool).unwrap();
        assert!(should_allow_restore_pull(&pool).unwrap());
    }

    fn insert_test_chat_session(pool: &DatabasePool, user_id: &str) {
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO chat_sessions (id, user_id, title, target_language, created_at, updated_at)
             VALUES ('sess-test', ?1, 'Test', 'es', datetime('now'), datetime('now'))",
            params![user_id],
        )
        .unwrap();
    }

    #[test]
    fn restore_pull_blocked_after_learning_activity() {
        let pool = test_pool();
        let user_id = seed_user(&pool);
        mark_restore_after_wizard(&pool).unwrap();
        insert_test_chat_session(&pool, &user_id);
        assert!(!should_allow_restore_pull(&pool).unwrap());
    }

    #[test]
    fn restore_pull_allowed_after_reset_even_with_activity() {
        let pool = test_pool();
        let user_id = seed_user(&pool);
        mark_restore_after_reset(&pool).unwrap();
        insert_test_chat_session(&pool, &user_id);
        assert!(should_allow_restore_pull(&pool).unwrap());
    }

    #[test]
    fn wizard_after_reset_keeps_reset_restore_mode() {
        let pool = test_pool();
        seed_user(&pool);
        mark_restore_after_reset(&pool).unwrap();
        mark_restore_after_wizard(&pool).unwrap();
        assert_eq!(restore_mode(&pool).unwrap().as_deref(), Some("reset"));
    }

    #[test]
    fn export_import_path_section_progress() {
        let pool = test_pool();
        let user_id = seed_user(&pool);
        {
            let conn = pool.conn().unwrap();
            conn.execute(
                "INSERT INTO path_section_progress
                    (user_id, pair_key, section_id, stars, best_score, attempts, updated_at)
                 VALUES (?1, 'zh-es', 'zh-es/U01-S01', 3, 100, 1, '2026-06-30 10:00:00')",
                params![user_id],
            )
            .unwrap();
        }

        let payload = export_sync_payload(&pool).unwrap();
        assert_eq!(payload.path_section_progress.len(), 1);
        assert_eq!(payload.path_section_progress[0].section_id, "zh-es/U01-S01");

        {
            let conn = pool.conn().unwrap();
            conn.execute("DELETE FROM path_section_progress", [])
                .unwrap();
        }

        import_sync_payload(&pool, &payload).unwrap();
        let conn = pool.conn().unwrap();
        let stars: i32 = conn
            .query_row(
                "SELECT stars FROM path_section_progress WHERE user_id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stars, 3);
    }

    #[test]
    fn import_user_vocab_resolves_word_identity_across_different_local_ids() {
        let pool_a = test_pool();
        let user_a = seed_user(&pool_a);
        let pool_b = test_pool();
        let user_b = seed_user(&pool_b);

        let word_a: i32 = {
            let conn = pool_a.conn().unwrap();
            conn.execute(
                "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
                 VALUES ('hola', 'hola', 'interj', 'A1', 'es', 100)",
                [],
            )
            .unwrap();
            conn.query_row(
                "SELECT id FROM vocab_bank WHERE word = 'hola' AND cefr_level = 'A1' AND language = 'es'",
                [],
                |row| row.get(0),
            )
            .unwrap()
        };
        let word_b: i32 = {
            let conn = pool_b.conn().unwrap();
            conn.execute(
                "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
                 VALUES ('dummy', 'dummy', 'noun', 'A1', 'es', 1)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
                 VALUES ('hola', 'hola', 'interj', 'A1', 'es', 100)",
                [],
            )
            .unwrap();
            conn.query_row(
                "SELECT id FROM vocab_bank WHERE word = 'hola' AND cefr_level = 'A1' AND language = 'es'",
                [],
                |row| row.get(0),
            )
            .unwrap()
        };
        assert_ne!(word_a, word_b);

        {
            let conn = pool_a.conn().unwrap();
            conn.execute(
                "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
                 VALUES (?1, ?2, 2, 'news', '2026-07-01 10:00:00')",
                params![user_a, word_a],
            )
            .unwrap();
        }

        let payload = export_sync_payload(&pool_a).unwrap();
        assert_eq!(payload.user_vocab.len(), 1);
        assert_eq!(payload.user_vocab[0].word.as_deref(), Some("hola"));

        import_sync_payload(&pool_b, &payload).unwrap();

        let conn = pool_b.conn().unwrap();
        let (imported_word_id, mastery): (i32, i32) = conn
            .query_row(
                "SELECT word_id, mastery FROM user_vocab WHERE user_id = ?1",
                params![user_b],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(imported_word_id, word_b);
        assert_eq!(mastery, 2);
    }

    #[test]
    fn import_user_vocab_creates_discovered_words_from_cloud() {
        let pool_a = test_pool();
        let user_a = seed_user(&pool_a);
        let pool_b = test_pool();
        let user_b = seed_user(&pool_b);

        let word_a: i32 = {
            let conn = pool_a.conn().unwrap();
            conn.execute(
                "INSERT INTO vocab_bank (word, lemma, cefr_level, language, frequency)
                 VALUES ('mariposa', 'mariposa', 'D', 'es', 0)",
                [],
            )
            .unwrap();
            conn.last_insert_rowid() as i32
        };
        {
            let conn = pool_a.conn().unwrap();
            conn.execute(
                "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
                 VALUES (?1, ?2, 1, 'news_reading', '2026-07-01 10:00:00')",
                params![user_a, word_a],
            )
            .unwrap();
        }

        import_sync_payload(&pool_b, &export_sync_payload(&pool_a).unwrap()).unwrap();

        let conn = pool_b.conn().unwrap();
        let mastery: i32 = conn
            .query_row(
                "SELECT uv.mastery FROM user_vocab uv
                 JOIN vocab_bank vb ON vb.id = uv.word_id
                 WHERE uv.user_id = ?1 AND vb.word = 'mariposa' AND vb.cefr_level = 'D'",
                params![user_b],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(mastery, 1);
    }

    #[test]
    fn import_user_vocab_creates_stub_when_graded_word_missing_locally() {
        let pool_a = test_pool();
        let user_a = seed_user(&pool_a);
        let pool_b = test_pool();
        let user_b = seed_user(&pool_b);

        {
            let conn = pool_a.conn().unwrap();
            conn.execute(
                "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
                 VALUES ('nuevo', 'nuevo', 'adj', 'B1', 'es', 10)",
                [],
            )
            .unwrap();
            let word_id = conn.last_insert_rowid() as i32;
            conn.execute(
                "INSERT INTO user_vocab (user_id, word_id, mastery, updated_at)
                 VALUES (?1, ?2, 2, '2026-07-01 10:00:00')",
                params![user_a, word_id],
            )
            .unwrap();
        }

        import_sync_payload(&pool_b, &export_sync_payload(&pool_a).unwrap()).unwrap();

        let conn = pool_b.conn().unwrap();
        let mastery: i32 = conn
            .query_row(
                "SELECT uv.mastery FROM user_vocab uv
                 JOIN vocab_bank vb ON vb.id = uv.word_id
                 WHERE uv.user_id = ?1 AND LOWER(vb.word) = 'nuevo'",
                params![user_b],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(mastery, 2);
    }

    #[test]
    fn import_user_vocab_matches_case_insensitive() {
        let pool_a = test_pool();
        let user_a = seed_user(&pool_a);
        let pool_b = test_pool();
        let user_b = seed_user(&pool_b);

        {
            let conn = pool_a.conn().unwrap();
            conn.execute(
                "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
                 VALUES ('Hola', 'hola', 'interj', 'A1', 'es', 100)",
                [],
            )
            .unwrap();
            let word_id = conn.last_insert_rowid() as i32;
            conn.execute(
                "INSERT INTO user_vocab (user_id, word_id, mastery, updated_at)
                 VALUES (?1, ?2, 2, '2026-07-01 10:00:00')",
                params![user_a, word_id],
            )
            .unwrap();
        }
        {
            let conn = pool_b.conn().unwrap();
            conn.execute(
                "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
                 VALUES ('hola', 'hola', 'interj', 'A1', 'es', 100)",
                [],
            )
            .unwrap();
        }

        import_sync_payload(&pool_b, &export_sync_payload(&pool_a).unwrap()).unwrap();

        let conn = pool_b.conn().unwrap();
        let mastery: i32 = conn
            .query_row(
                "SELECT mastery FROM user_vocab WHERE user_id = ?1",
                params![user_b],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(mastery, 2);
    }

    #[test]
    fn import_skips_duplicate_reading_log_rows() {
        let pool = test_pool();
        let user_id = seed_user(&pool);
        {
            let conn = pool.conn().unwrap();
            conn.execute(
                "INSERT INTO news_articles (original_title, source, region, hot_rank, fetched_at)
                 VALUES ('Test', 'test-source', 'world', 1, datetime('now'))",
                [],
            )
            .unwrap();
        }

        let mut payload = export_sync_payload(&pool).unwrap();
        payload.news_reading_log = vec![SyncReadingLogRow {
            article_source: Some("test-source".to_string()),
            words_looked_up: None,
            words_known: None,
            words_unknown: None,
            reading_time_sec: 42,
            completed: true,
            read_at: "2026-06-29T12:00:00Z".to_string(),
        }];

        import_sync_payload(&pool, &payload).unwrap();
        import_sync_payload(&pool, &payload).unwrap();

        let conn = pool.conn().unwrap();
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM news_reading_log WHERE user_id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    /// Live E2E: push local data to Cloudflare, wipe local DB, pull restore.
    /// Run: cargo test e2e_restore_after_local_reset -- --ignored --test-threads=1 --include-ignored
    #[tokio::test]
    #[ignore = "requires network and deployed Cloudflare sync API"]
    async fn e2e_restore_after_local_reset() {
        use std::path::PathBuf;

        let (data_dir, cleanup_after) = match std::env::var("IDIOMA_DATA_DIR") {
            Ok(path) if !path.is_empty() => (PathBuf::from(path), false),
            _ => {
                let dir =
                    std::env::temp_dir().join(format!("idioma-sync-e2e-{}", uuid::Uuid::new_v4()));
                std::fs::create_dir_all(&dir).expect("temp data dir");
                std::env::set_var("IDIOMA_DATA_DIR", &dir);
                (dir, true)
            }
        };

        let pool = DatabasePool::new();
        let nickname = format!("E2E_{}", &uuid::Uuid::new_v4().to_string()[..8]);

        let user = create_user_from_wizard(
            &pool,
            CreateUserRequest {
                nickname: nickname.clone(),
                avatar: "avatar-a".to_string(),
                native_language: "zh".to_string(),
                country: "CN".to_string(),
                gender: None,
                birth_year: None,
                age_range: None,
                wizard_completed: None,
            },
        )
        .expect("seed user");

        save_setting(&pool, "ui_language", "en").expect("seed setting");
        crate::modules::user::save_learning_goal(
            &pool,
            crate::modules::user::LearningGoal {
                id: None,
                user_id: user.id.clone(),
                target_language: "fr".to_string(),
                cefr_level: "A2".to_string(),
                daily_minutes: 20,
                objective: "travel".to_string(),
            },
        )
        .expect("seed goal");

        let ping = test_cloud_sync().await.expect("ping");
        assert!(ping.success, "sync ping failed: {}", ping.message);

        set_cloud_sync_enabled(&pool, true, true)
            .await
            .expect("initial push enable");

        pool.reset_database().expect("simulate local data loss");

        create_user_from_wizard(
            &pool,
            CreateUserRequest {
                nickname: nickname.clone(),
                avatar: "avatar-b".to_string(),
                native_language: "zh".to_string(),
                country: "CN".to_string(),
                gender: None,
                birth_year: None,
                age_range: None,
                wizard_completed: None,
            },
        )
        .expect("recreate user after wipe");

        set_cloud_sync_enabled(&pool, true, true)
            .await
            .expect("restore from cloud");

        let restored = get_or_create_user(&pool).expect("restored user");
        assert_eq!(restored.nickname, nickname);
        assert_eq!(restored.avatar, "avatar-a");

        let goals = crate::modules::user::get_learning_goals(&pool, &restored.id).expect("goals");
        assert_eq!(goals.len(), 1);
        assert_eq!(goals[0].target_language, "fr");
        assert_eq!(goals[0].cefr_level, "A2");

        assert_eq!(
            get_setting(&pool, "ui_language")
                .expect("setting")
                .as_deref(),
            Some("en")
        );

        if cleanup_after {
            let _ = std::fs::remove_dir_all(&data_dir);
        }
    }
}
