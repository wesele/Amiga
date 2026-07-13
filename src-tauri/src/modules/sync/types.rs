use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

fn deserialize_lossy_vec<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: DeserializeOwned,
{
    let value = Value::deserialize(deserializer)?;
    let Value::Array(items) = value else {
        return Ok(Vec::new());
    };
    Ok(items
        .into_iter()
        .filter_map(|item| serde_json::from_value(item).ok())
        .collect())
}

fn default_payload_version() -> i32 {
    1
}

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
    #[serde(default)]
    pub imported_items: usize,
    #[serde(default)]
    pub skipped_items: usize,
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
    /// Number of rows successfully recovered across all payload sections.
    pub imported_items: usize,
    /// Number of malformed or unusable rows skipped without aborting recovery.
    pub skipped_items: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncPayload {
    #[serde(default = "default_payload_version")]
    pub version: i32,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub users: Vec<SyncUserRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub learning_goals: Vec<SyncLearningGoalRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub user_vocab: Vec<SyncUserVocabRow>,
    /// Legacy v1-v3 section. Kept for decoding old snapshots; v4 no longer
    /// exports or imports cached news history.
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub news_reading_log: Vec<SyncReadingLogRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub streak_records: Vec<SyncStreakRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub chat_sessions: Vec<SyncChatSessionRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub chat_messages: Vec<SyncChatMessageRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub app_settings: Vec<SyncSettingRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub prompts: Vec<SyncPromptRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub path_section_progress: Vec<SyncPathProgressRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub reading_articles: Vec<SyncReadingArticleRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub reading_tests: Vec<SyncReadingTestRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub reading_test_attempts: Vec<SyncReadingTestAttemptRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub speaking_sessions: Vec<SyncSpeakingSessionRow>,
    #[serde(default, deserialize_with = "deserialize_lossy_vec")]
    pub speaking_turns: Vec<SyncSpeakingTurnRow>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncPathProgressRow {
    pub pair_key: String,
    pub section_id: String,
    pub stars: i32,
    pub best_score: i32,
    pub attempts: i32,
    pub completed_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
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

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncLearningGoalRow {
    pub target_language: String,
    pub cefr_level: String,
    pub daily_minutes: i32,
    pub objective: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
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

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncReadingLogRow {
    pub article_source: Option<String>,
    pub words_looked_up: Option<String>,
    pub words_known: Option<String>,
    pub words_unknown: Option<String>,
    pub reading_time_sec: i32,
    pub completed: bool,
    pub read_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncStreakRow {
    pub date: String,
    pub articles_read: i32,
    pub words_learned: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
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

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncChatMessageRow {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncSettingRow {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncPromptRow {
    pub key: String,
    pub name: String,
    pub category: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncReadingArticleRow {
    /// Source installation's local id, used only to reconnect child rows.
    pub id: i64,
    pub target_language: String,
    pub cefr_level: String,
    pub local_date: String,
    pub slot: String,
    pub topic: String,
    pub title: String,
    pub body: String,
    pub status: String,
    pub test_correct_count: Option<i32>,
    pub test_total_count: Option<i32>,
    pub generated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncReadingTestRow {
    pub article_id: i64,
    pub questions_json: String,
    pub explanations_json: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncReadingTestAttemptRow {
    pub article_id: i64,
    pub answers_json: String,
    pub correct_count: i32,
    pub total_count: i32,
    pub completed_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncSpeakingSessionRow {
    pub id: String,
    pub topic_id: String,
    pub target_lang: String,
    pub native_lang: String,
    pub cefr_level: String,
    pub current_turn: i32,
    pub current_ai_text: String,
    pub status: String,
    pub total_turns: i32,
    pub retry_count: i32,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub struct SyncSpeakingTurnRow {
    pub session_id: String,
    pub turn_number: i32,
    pub ai_text: String,
    pub user_transcript: String,
    pub scores_json: String,
    pub total_score: i32,
    pub used_hint: bool,
    pub attempt_count: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct SyncImportReport {
    pub imported_items: usize,
    pub skipped_items: usize,
}

impl SyncImportReport {
    pub fn imported(&mut self) {
        self.imported_items += 1;
    }

    pub fn skipped(&mut self) {
        self.skipped_items += 1;
    }
}

#[derive(Debug, Deserialize)]
pub(crate) struct RemoteSnapshot {
    pub(crate) payload: String,
    #[serde(rename = "updatedAt")]
    pub(crate) updated_at: String,
    #[serde(rename = "deviceId")]
    pub(crate) device_id: String,
}
