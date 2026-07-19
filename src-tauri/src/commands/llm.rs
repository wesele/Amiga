use crate::modules::database::DatabasePool;
use crate::modules::llm as llm_mod;
use crate::modules::sync;
use std::sync::RwLock;
use tauri::State;

// We need to store the LlmClient as Tauri state too
pub struct LlmState {
    pub client: llm_mod::LlmClient,
    /// In-memory cache of the last-loaded LlmConfig. Invalidated on every save.
    pub config_cache: RwLock<Option<llm_mod::LlmConfig>>,
}

impl LlmState {
    pub fn new() -> Self {
        Self {
            client: llm_mod::LlmClient::new(),
            config_cache: RwLock::new(None),
        }
    }

    /// Invalidate the cached config so the next call re-reads from the DB.
    pub fn invalidate_config_cache(&self) {
        if let Ok(mut cache) = self.config_cache.write() {
            *cache = None;
        }
    }
}

#[tauri::command]
pub async fn rewrite_article_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    article_id: i32,
    cefr_level: String,
    user_id: String,
    target_lang: String,
) -> Result<serde_json::Value, String> {
    use crate::modules::news as news_mod;

    let updated = news_mod::rewrite_article_for_user(
        &llm.client,
        &db,
        article_id,
        &cefr_level,
        &user_id,
        &target_lang,
    )
    .await?;
    serde_json::to_value(updated).map_err(|e| format!("Serialization error: {}", e))
}

#[tauri::command]
pub async fn translate_word_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    word: String,
    context: String,
    source_lang: String,
    native_lang: String,
) -> Result<llm_mod::TranslationResult, String> {
    llm_mod::translate_word(
        &llm.client,
        &db,
        &word,
        &context,
        &source_lang,
        &native_lang,
    )
    .await
}
#[tauri::command]
pub async fn test_llm_connection_cmd(
    llm: State<'_, LlmState>,
    config: llm_mod::ModelConfig,
) -> Result<llm_mod::TestResult, String> {
    Ok(llm.client.test_connection(&config).await)
}

#[tauri::command]
pub async fn save_llm_config_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    key: String,
    config: llm_mod::ModelConfig,
) -> Result<(), String> {
    // The fallback model was removed — only the custom ("primary") slot is
    // user-editable now. Reject anything else so the old `backup` rows in
    // the DB stay untouched.
    if key != "primary" {
        return Err(format!(
            "Unknown LLM config key '{}': only 'primary' (custom) is supported",
            key
        ));
    }
    llm_mod::save_llm_setting(&db, "primary_base_url", &config.base_url)?;
    llm_mod::save_llm_setting(&db, "primary_api_key", &config.api_key)?;
    llm_mod::save_llm_setting(&db, "primary_model", &config.model)?;
    llm_mod::save_llm_setting(&db, "primary_provider", config.provider.as_str())?;
    llm_mod::save_llm_setting(
        &db,
        "primary_thinking_enabled",
        if config.thinking_enabled {
            "true"
        } else {
            "false"
        },
    )?;
    // Invalidate config cache so the next LLM call re-reads from the DB.
    llm.invalidate_config_cache();
    Ok(())
}

#[tauri::command]
pub async fn get_llm_config_cmd(db: State<'_, DatabasePool>) -> Result<llm_mod::LlmConfig, String> {
    llm_mod::get_llm_config(&db)
}

#[tauri::command]
pub async fn save_setting_cmd(
    db: State<'_, DatabasePool>,
    key: String,
    value: String,
) -> Result<(), String> {
    llm_mod::save_setting(&db, &key, &value)?;
    if sync::is_syncable_setting(&key) {
        sync::schedule_cloud_sync(&db);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_setting_cmd(
    db: State<'_, DatabasePool>,
    key: String,
) -> Result<Option<String>, String> {
    llm_mod::get_setting(&db, &key)
}

#[tauri::command]
pub async fn get_bilingual_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    article_id: i32,
    source_lang: String,
    native_lang: String,
) -> Result<Vec<String>, String> {
    use crate::modules::translation as translation_mod;

    translation_mod::get_bilingual_article_translation(
        &llm.client,
        &db,
        article_id,
        &source_lang,
        &native_lang,
    )
    .await
}

#[tauri::command]
pub async fn translate_text_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    text: String,
    source_lang: String,
    native_lang: String,
) -> Result<String, String> {
    use crate::modules::translation as translation_mod;

    translation_mod::translate_text(&llm.client, &db, &text, &source_lang, &native_lang).await
}

#[tauri::command]
pub async fn grade_translation_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    source_text: String,
    accepted_answers: Vec<String>,
    user_answer: String,
    target_lang: String,
) -> Result<bool, String> {
    llm_mod::grade_translation(
        &llm.client,
        &db,
        &source_text,
        &accepted_answers,
        &user_answer,
        &target_lang,
    )
    .await
}

#[tauri::command]
pub async fn fetch_models_cmd(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/models", base_url.trim_end_matches('/'));

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("获取可用模型失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("服务商接口返回错误: HTTP {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析模型列表 JSON 失败: {}", e))?;

    let mut models = Vec::new();
    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        for item in data {
            if let Some(id) = item.get("id").and_then(|id| id.as_str()) {
                models.push(id.to_string());
            }
        }
    }

    if models.is_empty() {
        if let Some(model_list) = json.as_array() {
            for item in model_list {
                if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                    models.push(name.to_string());
                }
            }
        }
    }

    models.sort();
    Ok(models)
}
