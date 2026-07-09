use serde::{Deserialize, Serialize};

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
pub struct CloudRestoreResult {
    /// Whether a cloud snapshot was found and restored into the local DB.
    pub restored: bool,
    /// Final nickname after restore (may differ from the requested one).
    pub nickname: String,
    /// Restored target language, if a learning goal was present.
    pub target_language: Option<String>,
    /// Restored CEFR level, if a learning goal was present.
    pub cefr_level: Option<String>,
    /// Machine-readable status: "restored" | "no_remote_data" | "error".
    pub message: String,
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
    /// Stable identity for cross-device restore (vocab_bank ids differ per install).
    #[serde(default)]
    pub word: Option<String>,
    #[serde(default)]
    pub cefr_level: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncReadingLogRow {
    pub article_source: Option<String>,
    pub words_looked_up: Option<String>,
    pub words_known: Option<String>,
    pub words_unknown: Option<String>,
    pub reading_time_sec: i32,
    pub completed: bool,
    pub read_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncStreakRow {
    pub date: String,
    pub articles_read: i32,
    pub words_learned: i32,
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
pub(crate) struct RemoteSnapshot {
    pub(crate) payload: String,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
    #[serde(rename = "deviceId")]
    pub(crate) device_id: String,
}
