use crate::modules::database::DatabasePool;
use crate::modules::llm::{get_setting, save_setting};
use crate::modules::user::get_or_create_user;
use chrono::Utc;
use log;
use rusqlite::{params, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use tokio::sync::Mutex as AsyncMutex;

const SYNC_DEBOUNCE_MS: u64 = 3000;
const SYNC_MAX_ATTEMPTS: u32 = 2;

static SYNC_DEBOUNCE_GEN: AtomicU64 = AtomicU64::new(0);

fn sync_mutex() -> &'static AsyncMutex<()> {
    static MUTEX: OnceLock<AsyncMutex<()>> = OnceLock::new();
    MUTEX.get_or_init(|| AsyncMutex::new(()))
}

pub const SYNC_API_BASE_URL: &str = "https://amiga-chat-social.wh1018.workers.dev";
const ENV_SYNC_API_BASE_URL: &str = "IDIOMA_SYNC_API_BASE_URL";

const SETTING_ENABLED: &str = "cloud_sync_enabled";
const SETTING_DEVICE_ID: &str = "cloud_sync_device_id";
const SETTING_LAST_SYNCED: &str = "cloud_sync_last_synced_at";
const SETTING_LAST_PUSHED: &str = "cloud_sync_last_pushed_at";
const SETTING_LAST_ERROR: &str = "cloud_sync_last_error";
/// "" | "wizard" (fresh/re-run wizard) | "reset" (settings restart → wizard)
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CloudSyncStatus {
    pub enabled: bool,
    pub last_synced_at: Option<String>,
    pub last_error: Option<String>,
    pub device_id: String,
    pub nickname: String,
    /// True when a one-time cloud restore is allowed (post-wizard / post-reset).
    pub restore_available: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CloudSyncTestResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SetCloudSyncEnabledResult {
    pub enabled: bool,
    pub remote_conflict: bool,
    pub remote_device_id: Option<String>,
    pub remote_updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RunCloudSyncResult {
    pub direction: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncPayload {
    pub version: i32,
    pub users: Vec<SyncUserRow>,
    pub learning_goals: Vec<SyncLearningGoalRow>,
    pub user_vocab: Vec<SyncUserVocabRow>,
    pub news_reading_log: Vec<SyncReadingLogRow>,
    pub streak_records: Vec<SyncStreakRow>,
    pub chat_sessions: Vec<SyncChatSessionRow>,
    pub chat_messages: Vec<SyncChatMessageRow>,
    pub app_settings: Vec<SyncSettingRow>,
    pub prompts: Vec<SyncPromptRow>,
    #[serde(default)]
    pub path_section_progress: Vec<SyncPathProgressRow>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncPathProgressRow {
    pub pair_key: String,
    pub section_id: String,
    pub stars: i32,
    pub best_score: i32,
    pub attempts: i32,
    pub completed_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncUserRow {
    pub nickname: String,
    pub avatar: String,
    pub native_language: String,
    pub country: String,
    pub gender: String,
    pub birth_year: Option<i32>,
    pub age_range: Option<String>,
    pub wizard_completed: bool,
    pub created_at: String,
    pub last_active_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncLearningGoalRow {
    pub target_language: String,
    pub cefr_level: String,
    pub daily_minutes: i32,
    pub objective: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncUserVocabRow {
    pub word_id: i32,
    pub mastery: i32,
    pub source: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncReadingLogRow {
    pub article_source: Option<String>,
    pub words_looked_up: Option<String>,
    pub words_known: Option<String>,
    pub words_unknown: Option<String>,
    pub reading_time_sec: i32,
    pub completed: bool,
    #[serde(default)]
    pub scroll_pct: i32,
    #[serde(default)]
    pub comprehension_score: Option<i32>,
    #[serde(default)]
    pub comprehension_skipped: bool,
    #[serde(default)]
    pub comprehension_answers_json: Option<String>,
    pub read_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncStreakRow {
    pub date: String,
    pub articles_read: i32,
    pub words_learned: i32,
    #[serde(default)]
    pub lessons_completed: i32,
    #[serde(default)]
    pub review_sessions: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncChatSessionRow {
    pub id: String,
    pub title: String,
    pub user_profile_json: String,
    pub conversation_summary: String,
    pub message_count: i32,
    pub contact_type: String,
    pub target_language: String,
    pub last_message: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncChatMessageRow {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncSettingRow {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncPromptRow {
    pub key: String,
    pub name: String,
    pub category: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
struct RemoteSnapshot {
    payload: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "deviceId")]
    device_id: String,
}

fn is_sensitive_setting(key: &str) -> bool {
    SENSITIVE_SETTING_KEYS.contains(&key) || LOCAL_ONLY_SETTING_KEYS.contains(&key)
}

pub fn is_syncable_setting(key: &str) -> bool {
    !is_sensitive_setting(key)
}

fn is_sync_conflict_error(message: &str) -> bool {
    message.contains("409") || message.contains("conflict")
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn normalize_api_base_url(value: Option<&str>, default: &str) -> String {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or(default)
        .trim_end_matches('/')
        .to_string()
}

fn sync_api_base_url() -> String {
    normalize_api_base_url(
        std::env::var(ENV_SYNC_API_BASE_URL).ok().as_deref(),
        SYNC_API_BASE_URL,
    )
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

fn restore_mode(db: &DatabasePool) -> Result<Option<String>, String> {
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

fn clear_restore_mode(db: &DatabasePool) -> Result<(), String> {
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

pub fn export_sync_payload(db: &DatabasePool) -> Result<SyncPayload, String> {
    let user = get_or_create_user(db)?;
    let conn = db.conn()?;
    let user_id = user.id.clone();

    let users = vec![SyncUserRow {
        nickname: user.nickname,
        avatar: user.avatar,
        native_language: user.native_language,
        country: user.country,
        gender: user.gender,
        birth_year: user.birth_year,
        age_range: user.age_range,
        wizard_completed: user.wizard_completed,
        created_at: user.created_at,
        last_active_date: user.last_active_date,
    }];

    let mut stmt = conn
        .prepare(
            "SELECT target_language, cefr_level, daily_minutes, objective, created_at
             FROM learning_goals WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let learning_goals = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncLearningGoalRow {
                target_language: row.get(0)?,
                cefr_level: row.get(1)?,
                daily_minutes: row.get(2)?,
                objective: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT word_id, mastery, source, updated_at
             FROM user_vocab WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let user_vocab = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncUserVocabRow {
                word_id: row.get(0)?,
                mastery: row.get(1)?,
                source: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT a.source, l.words_looked_up, l.words_known, l.words_unknown,
                    l.reading_time_sec, l.completed, l.scroll_pct,
                    l.comprehension_score, l.comprehension_skipped, l.comprehension_answers_json,
                    l.read_at
             FROM news_reading_log l
             LEFT JOIN news_articles a ON a.id = l.article_id
             WHERE l.user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let news_reading_log = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncReadingLogRow {
                article_source: row.get(0)?,
                words_looked_up: row.get(1)?,
                words_known: row.get(2)?,
                words_unknown: row.get(3)?,
                reading_time_sec: row.get(4)?,
                completed: row.get::<_, i32>(5)? != 0,
                scroll_pct: row.get(6)?,
                comprehension_score: row.get(7)?,
                comprehension_skipped: row.get::<_, i32>(8)? != 0,
                comprehension_answers_json: row.get(9)?,
                read_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT date, articles_read, words_learned, COALESCE(lessons_completed, 0),
                    COALESCE(review_sessions, 0)
             FROM streak_records WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let streak_records = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncStreakRow {
                date: row.get(0)?,
                articles_read: row.get(1)?,
                words_learned: row.get(2)?,
                lessons_completed: row.get(3)?,
                review_sessions: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT id, title, user_profile_json, conversation_summary, message_count,
                    contact_type, target_language, last_message, created_at, updated_at
             FROM chat_sessions WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let chat_sessions: Vec<SyncChatSessionRow> = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncChatSessionRow {
                id: row.get(0)?,
                title: row.get(1)?,
                user_profile_json: row.get(2)?,
                conversation_summary: row.get(3)?,
                message_count: row.get(4)?,
                contact_type: row.get(5)?,
                target_language: row.get(6)?,
                last_message: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let session_ids: Vec<String> = chat_sessions.iter().map(|s| s.id.clone()).collect();
    let chat_messages = if session_ids.is_empty() {
        Vec::new()
    } else {
        let placeholders = session_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT session_id, role, content, created_at
             FROM chat_messages WHERE session_id IN ({placeholders})
             ORDER BY created_at ASC"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params: Vec<&dyn rusqlite::ToSql> = session_ids
            .iter()
            .map(|id| id as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt
            .query_map(params.as_slice(), |row| {
                Ok(SyncChatMessageRow {
                    session_id: row.get(0)?,
                    role: row.get(1)?,
                    content: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| e.to_string())?;
    let app_settings = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter(|(key, _)| !is_sensitive_setting(key))
        .map(|(key, value)| SyncSettingRow { key, value })
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT key, name, category, system_prompt, user_prompt_template, updated_at
             FROM prompts",
        )
        .map_err(|e| e.to_string())?;
    let prompts = stmt
        .query_map([], |row| {
            Ok(SyncPromptRow {
                key: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                system_prompt: row.get(3)?,
                user_prompt_template: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT pair_key, section_id, stars, best_score, attempts, completed_at, updated_at
             FROM path_section_progress WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let path_section_progress = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncPathProgressRow {
                pair_key: row.get(0)?,
                section_id: row.get(1)?,
                stars: row.get(2)?,
                best_score: row.get(3)?,
                attempts: row.get(4)?,
                completed_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(SyncPayload {
        version: 2,
        users,
        learning_goals,
        user_vocab,
        news_reading_log,
        streak_records,
        chat_sessions,
        chat_messages,
        app_settings,
        prompts,
        path_section_progress,
    })
}

pub fn import_sync_payload(db: &DatabasePool, payload: &SyncPayload) -> Result<(), String> {
    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start sync import transaction: {}", e))?;
    import_sync_payload_tx(&tx, payload)?;
    tx.commit()
        .map_err(|e| format!("Failed to commit sync import: {}", e))
}

fn import_sync_payload_tx(tx: &Transaction<'_>, payload: &SyncPayload) -> Result<(), String> {
    let local_user_id: String = tx
        .query_row("SELECT id FROM users LIMIT 1", [], |row| row.get(0))
        .map_err(|e| format!("No local user for sync import: {}", e))?;

    if let Some(remote_user) = payload.users.first() {
        tx.execute(
            "UPDATE users SET nickname = ?1, avatar = ?2, native_language = ?3, country = ?4,
             gender = ?5, birth_year = ?6, age_range = ?7, wizard_completed = ?8,
             last_active_date = ?9 WHERE id = ?10",
            params![
                remote_user.nickname,
                remote_user.avatar,
                remote_user.native_language,
                remote_user.country,
                remote_user.gender,
                remote_user.birth_year,
                remote_user.age_range,
                if remote_user.wizard_completed { 1 } else { 0 },
                remote_user.last_active_date,
                local_user_id,
            ],
        )
        .map_err(|e| format!("Failed to import user profile: {}", e))?;
    }

    tx.execute(
        "DELETE FROM learning_goals WHERE user_id = ?1",
        params![local_user_id],
    )
    .ok();
    for goal in &payload.learning_goals {
        tx.execute(
            "INSERT INTO learning_goals (user_id, target_language, cefr_level, daily_minutes, objective, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                local_user_id,
                goal.target_language,
                goal.cefr_level,
                goal.daily_minutes,
                goal.objective,
                goal.created_at,
            ],
        )
        .map_err(|e| format!("Failed to import learning goal: {}", e))?;
    }

    for row in &payload.user_vocab {
        tx.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(user_id, word_id) DO UPDATE SET
               mastery = excluded.mastery,
               source = excluded.source,
               updated_at = excluded.updated_at
             WHERE excluded.updated_at >= user_vocab.updated_at",
            params![
                local_user_id,
                row.word_id,
                row.mastery,
                row.source,
                row.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to import user_vocab: {}", e))?;
    }

    for row in &payload.news_reading_log {
        let Some(source) = row.article_source.as_deref().filter(|s| !s.is_empty()) else {
            continue;
        };
        let article_id: Option<i32> = tx
            .query_row(
                "SELECT id FROM news_articles WHERE source = ?1 LIMIT 1",
                params![source],
                |row| row.get(0),
            )
            .ok();
        let Some(article_id) = article_id else {
            continue;
        };
        tx.execute(
            "INSERT INTO news_reading_log (user_id, article_id, words_looked_up, words_known,
             words_unknown, reading_time_sec, completed, scroll_pct,
             comprehension_score, comprehension_skipped, comprehension_answers_json, read_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(user_id, article_id, read_at) DO NOTHING",
            params![
                local_user_id,
                article_id,
                row.words_looked_up,
                row.words_known,
                row.words_unknown,
                row.reading_time_sec,
                if row.completed { 1 } else { 0 },
                row.scroll_pct,
                row.comprehension_score,
                if row.comprehension_skipped { 1 } else { 0 },
                row.comprehension_answers_json,
                row.read_at,
            ],
        )
        .map_err(|e| format!("Failed to import news reading log: {}", e))?;
    }

    for row in &payload.streak_records {
        tx.execute(
            "INSERT INTO streak_records (user_id, date, articles_read, words_learned, lessons_completed, review_sessions)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(user_id, date) DO UPDATE SET
               articles_read = excluded.articles_read,
               words_learned = excluded.words_learned,
               lessons_completed = excluded.lessons_completed,
               review_sessions = excluded.review_sessions",
            params![
                local_user_id,
                row.date,
                row.articles_read,
                row.words_learned,
                row.lessons_completed,
                row.review_sessions,
            ],
        )
        .map_err(|e| format!("Failed to import streak record: {}", e))?;
    }

    for row in &payload.path_section_progress {
        tx.execute(
            "INSERT INTO path_section_progress
                (user_id, pair_key, section_id, stars, best_score, attempts, completed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(user_id, pair_key, section_id) DO UPDATE SET
               stars = MAX(path_section_progress.stars, excluded.stars),
               best_score = MAX(path_section_progress.best_score, excluded.best_score),
               attempts = MAX(path_section_progress.attempts, excluded.attempts),
               completed_at = COALESCE(path_section_progress.completed_at, excluded.completed_at),
               updated_at = excluded.updated_at
             WHERE excluded.updated_at >= path_section_progress.updated_at",
            params![
                local_user_id,
                row.pair_key,
                row.section_id,
                row.stars,
                row.best_score,
                row.attempts,
                row.completed_at,
                row.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to import path progress: {}", e))?;
    }

    let remote_session_ids: HashSet<String> =
        payload.chat_sessions.iter().map(|s| s.id.clone()).collect();
    if !remote_session_ids.is_empty() {
        let placeholders = remote_session_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!("DELETE FROM chat_sessions WHERE id IN ({placeholders})");
        let params: Vec<&dyn rusqlite::ToSql> = remote_session_ids
            .iter()
            .map(|id| id as &dyn rusqlite::ToSql)
            .collect();
        tx.execute(&sql, params.as_slice()).ok();
    }

    for session in &payload.chat_sessions {
        tx.execute(
            "INSERT INTO chat_sessions (id, user_id, title, user_profile_json, conversation_summary,
             message_count, contact_type, target_language, last_message, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                session.id,
                local_user_id,
                session.title,
                session.user_profile_json,
                session.conversation_summary,
                session.message_count,
                session.contact_type,
                session.target_language,
                session.last_message,
                session.created_at,
                session.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to import chat session: {}", e))?;
    }

    for message in &payload.chat_messages {
        if !remote_session_ids.contains(&message.session_id) {
            continue;
        }
        tx.execute(
            "INSERT INTO chat_messages (session_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                message.session_id,
                message.role,
                message.content,
                message.created_at,
            ],
        )
        .ok();
    }

    for setting in &payload.app_settings {
        if is_sensitive_setting(&setting.key) {
            continue;
        }
        tx.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![setting.key, setting.value],
        )
        .ok();
    }

    for prompt in &payload.prompts {
        tx.execute(
            "INSERT INTO prompts (key, name, category, system_prompt, user_prompt_template, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(key) DO UPDATE SET
               name = excluded.name,
               category = excluded.category,
               system_prompt = excluded.system_prompt,
               user_prompt_template = excluded.user_prompt_template,
               updated_at = excluded.updated_at",
            params![
                prompt.key,
                prompt.name,
                prompt.category,
                prompt.system_prompt,
                prompt.user_prompt_template,
                prompt.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to import prompt: {}", e))?;
    }

    Ok(())
}

async fn pull_remote_snapshot(user_id: &str) -> Result<Option<RemoteSnapshot>, String> {
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

async fn push_remote_snapshot(
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

fn urlencoding_encode(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => ch.to_string(),
            _ => format!("%{:02X}", ch as u32),
        })
        .collect()
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
    use crate::modules::user::{create_user_from_wizard, CreateUserRequest};

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    fn seed_user(pool: &DatabasePool) -> String {
        let user = create_user_from_wizard(
            pool,
            CreateUserRequest {
                nickname: "SyncUser".to_string(),
                avatar: "🐱".to_string(),
                native_language: "zh".to_string(),
                country: "CN".to_string(),
                gender: None,
                birth_year: None,
                age_range: None,
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
        payload.users[0].avatar = "🌟".to_string();
        import_sync_payload(&pool, &payload).unwrap();

        let user = get_or_create_user(&pool).unwrap();
        assert_eq!(user.id, local_id);
        assert_eq!(user.nickname, "Renamed");
        assert_eq!(user.avatar, "🌟");
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
            scroll_pct: 100,
            comprehension_score: None,
            comprehension_skipped: false,
            comprehension_answers_json: None,
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
                avatar: "🛰️".to_string(),
                native_language: "zh".to_string(),
                country: "CN".to_string(),
                gender: None,
                birth_year: None,
                age_range: None,
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
                avatar: "😊".to_string(),
                native_language: "zh".to_string(),
                country: "CN".to_string(),
                gender: None,
                birth_year: None,
                age_range: None,
            },
        )
        .expect("recreate user after wipe");

        set_cloud_sync_enabled(&pool, true, true)
            .await
            .expect("restore from cloud");

        let restored = get_or_create_user(&pool).expect("restored user");
        assert_eq!(restored.nickname, nickname);
        assert_eq!(restored.avatar, "🛰️");

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
