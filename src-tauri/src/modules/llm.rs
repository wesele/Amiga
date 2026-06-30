use crate::modules::database::DatabasePool;
use log;
use reqwest;
use rusqlite::params;
use serde::{Deserialize, Serialize};

/// Built-in (system-provided) model configuration. Free tier hosted by
/// NVIDIA; offered out of the box so new users have a working AI without
/// having to bring their own API key.
pub const BUILTIN_BASE_URL: &str = "https://integrate.api.nvidia.com/v1";
pub const BUILTIN_API_KEY: &str =
    "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";
pub const BUILTIN_MODEL: &str = "google/diffusiongemma-26b-a4b-it";

pub fn builtin_config() -> ModelConfig {
    ModelConfig {
        base_url: BUILTIN_BASE_URL.to_string(),
        api_key: BUILTIN_API_KEY.to_string(),
        model: BUILTIN_MODEL.to_string(),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

/// Which model the user wants the app to use right now. The "builtin" option
/// always works out of the box; "custom" requires a user-supplied config.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LlmMode {
    Builtin,
    Custom,
}

impl LlmMode {
    pub fn from_setting(value: Option<&str>) -> Self {
        match value {
            Some("custom") => LlmMode::Custom,
            // Default to builtin for new users so the app works without any
            // setup. Existing users keep whatever they had saved.
            _ => LlmMode::Builtin,
        }
    }

    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            LlmMode::Builtin => "builtin",
            LlmMode::Custom => "custom",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmConfig {
    pub mode: LlmMode,
    /// User's stored custom config (if any). Optional: a brand-new user on
    /// the custom mode will have this as None until they save it.
    pub primary: Option<ModelConfig>,
    /// Always populated from the built-in constants.
    pub builtin: ModelConfig,
}

impl LlmConfig {
    /// Resolve the model config the app should actually use, based on `mode`.
    pub fn active(&self) -> Result<&ModelConfig, String> {
        match self.mode {
            LlmMode::Builtin => Ok(&self.builtin),
            LlmMode::Custom => self.primary.as_ref().ok_or_else(|| {
                "未配置自定义大模型 API。请填写 API Key、Base URL 和模型后保存。".to_string()
            }),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ChatMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RewriteResult {
    pub rewritten: String,
    pub new_words_used: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationResult {
    /// Translation of the word in the user's native language.
    pub translation: String,
    pub ipa: Option<String>,
    pub pos: Option<String>,
    pub example: Option<String>,
}

/// Map a language code to a human-readable name (used in LLM prompts and
/// bio strings). Falls back to the raw code for unsupported languages.
pub fn lang_name(code: &str) -> &'static str {
    match code {
        "zh" => "Chinese",
        "en" => "English",
        "es" => "Spanish",
        _ => "the target language",
    }
}

/// Map a language code to its localized name (Chinese UI). Used for
/// Chinese-locale prompts.
#[allow(dead_code)]
pub fn lang_name_zh(code: &str) -> &'static str {
    match code {
        "zh" => "中文",
        "en" => "英语",
        "es" => "西班牙语",
        _ => "目标语言",
    }
}

#[derive(Debug, Serialize)]
pub struct TestResult {
    pub success: bool,
    pub message: String,
}

pub struct LlmClient {
    http: reqwest::Client,
}

impl LlmClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        Self { http }
    }

    /// Low-level: send the messages to a specific config. No fallback chain.
    async fn call(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        // Standard OpenAI-compatible request body
        let body = serde_json::json!({
            "model": config.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 4096,
            "max_completion_tokens": 4096
        });

        log::debug!("LLM request to {}: model={}", url, config.model);

        let response = self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error {}: {}",
                status,
                &text[..text.len().min(300)]
            ));
        }

        let raw_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        let json: serde_json::Value =
            serde_json::from_str(&raw_text).map_err(|e| format!("Invalid JSON response: {}", e))?;

        // Standard OpenAI: choices[0].message.content
        if let Some(content) = json
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
        {
            if !content.is_empty() {
                log::debug!("LLM response: content field ({} chars)", content.len());
                return Ok(content.to_string());
            }
        }

        // Reasoning models: reasoning_content (DeepSeek-style) or reasoning (Nemotron-style)
        // Contains chain-of-thought, NOT the final answer
        let reasoning = json
            .pointer("/choices/0/message/reasoning_content")
            .or_else(|| json.pointer("/choices/0/message/reasoning"))
            .and_then(|v| v.as_str());

        if let Some(reason) = reasoning {
            log::warn!("LLM returned reasoning ({} chars) but content is null/empty. \
                       The model may need more token budget. Trying to extract answer from reasoning...", reason.len());

            // Try to find a JSON block in the reasoning (some models embed the answer there)
            if let Some(json_start) = reason.find('{') {
                if let Some(json_end) = reason.rfind('}') {
                    let candidate = &reason[json_start..=json_end];
                    log::debug!("Extracted JSON from reasoning: {} chars", candidate.len());
                    return Ok(candidate.to_string());
                }
            }

            // If no JSON found, return reasoning as-is
            return Ok(reason.to_string());
        }

        // Other fallback formats
        if let Some(content) = json.pointer("/choices/0/text").and_then(|v| v.as_str()) {
            return Ok(content.to_string());
        }

        Err(format!(
            "LLM returned empty content. Response: {}",
            &raw_text[..raw_text.len().min(500)]
        ))
    }

    /// Send messages using whichever model is currently active (per
    /// `LlmConfig::active`). Errors out if the chosen mode is custom but
    /// no custom config has been saved yet.
    pub async fn chat(
        &self,
        db: &DatabasePool,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        let config = get_llm_config(db)?;
        let active = config.active()?;
        self.call(active, messages).await
    }

    pub async fn test_connection(&self, config: &ModelConfig) -> TestResult {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        let body = serde_json::json!({
            "model": config.model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 5
        });

        match self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => TestResult {
                success: true,
                message: "连接成功，模型可用".to_string(),
            },
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                let short_msg = if text.len() > 100 {
                    &text[..100]
                } else {
                    &text
                };
                TestResult {
                    success: false,
                    message: format!("连接失败: HTTP {} - {}", status, short_msg),
                }
            }
            Err(e) => TestResult {
                success: false,
                message: format!("连接失败: {}", e),
            },
        }
    }
}

fn build_chat_messages(
    db: &DatabasePool,
    prompt_key: &str,
    vars: &[(&str, &str)],
) -> Vec<ChatMessage> {
    let (sys, usr) = match crate::modules::prompts::get_prompt(db, prompt_key) {
        Ok(p) => (p.system_prompt, p.user_prompt_template),
        Err(_) => {
            log::warn!("Prompt '{}' not found, using default", prompt_key);
            return vec![];
        }
    };

    let mut filled = usr;
    for (k, v) in vars {
        filled = filled.replace(&format!("{{{{{}}}}}", k), v);
    }

    vec![
        ChatMessage {
            role: "system".to_string(),
            content: sys,
        },
        ChatMessage {
            role: "user".to_string(),
            content: filled,
        },
    ]
}

/// Fallback build messages for when DB prompts are not available
fn build_chat_messages_fallback(system: &str, user: &str) -> Vec<ChatMessage> {
    vec![
        ChatMessage {
            role: "system".to_string(),
            content: system.to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: user.to_string(),
        },
    ]
}

pub async fn rewrite_article(
    client: &LlmClient,
    db: &DatabasePool,
    original_text: &str,
    original_title: &str,
    cefr_level: &str,
    new_words: &[String],
    source_lang: &str,
) -> Result<RewriteResult, String> {
    let words_list = new_words.join(", ");
    let source_label = lang_name(source_lang);
    let vars = [
        ("CEFR_LEVEL", cefr_level),
        ("NEW_WORDS", &words_list),
        ("SOURCE_LANG", source_label),
        ("TITLE", original_title),
        ("TEXT", original_text),
    ];

    let messages = build_chat_messages(db, "rewrite-article", &vars);

    // Fallback to hardcoded prompt if DB prompt not available
    let messages = if messages.is_empty() {
        let prompt = format!(
            "Rewrite the following {source_label} news article for a CEFR {cefr_level} language learner.\n\n\
             Requirements:\n\
             1. Stay faithful — keep all facts, names, places, numbers, and dates intact\n\
             2. Word level — prefer vocabulary at CEFR {cefr_level} or below\n\
             3. Optional words — naturally weave in: {words_list}\n\n\
             Return JSON: {{\"rewritten\": \"the rewritten article\", \"new_words_used\": [\"words actually used\"]}}\n\n\
             Title: {original_title}\n\
             Body: {original_text}"
        );
        build_chat_messages_fallback(
            "You are a language-learning rewrite assistant. Output only JSON, no extra prose.",
            &prompt,
        )
    } else {
        messages
    };

    let response = client.chat(db, messages).await?;

    // Parse JSON response
    let cleaned = response
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let result: RewriteResult = serde_json::from_str(cleaned).map_err(|e| {
        log::error!("Failed to parse rewrite response: {}. Raw: {}", e, response);
        format!("AI response format error: {}", e)
    })?;

    log::info!(
        "Article rewritten successfully, {} new words used",
        result.new_words_used.len()
    );
    Ok(result)
}

pub async fn translate_word(
    client: &LlmClient,
    db: &DatabasePool,
    word: &str,
    context: &str,
    source_lang: &str,
    native_lang: &str,
) -> Result<TranslationResult, String> {
    let native_label = lang_name(native_lang);
    let source_label = lang_name(source_lang);

    let vars = [
        ("WORD", word),
        ("CONTEXT", context),
        ("SOURCE_LANG", source_label),
        ("TARGET_LANG", native_label),
    ];

    let messages = build_chat_messages(db, "translate-word", &vars);

    let messages = if messages.is_empty() {
        let prompt = format!(
            "Translate the following {source_label} word, given its context. \
             Output a translation in {native_label}.\n\
             Word: {word}\n\
             Context: {context}\n\
             Return a strict JSON object: \
             {{\"translation\": \"<translation in {native_label}>\", \
             \"ipa\": \"IPA pronunciation\", \
             \"pos\": \"part of speech (noun/verb/adjective/etc.)\", \
             \"example\": \"one simple example sentence in {source_label}\"}}"
        );
        build_chat_messages_fallback(
            "You are a precise dictionary assistant. Output only the requested JSON, no extra prose.",
            &prompt,
        )
    } else {
        messages
    };

    let response = client.chat(db, messages).await?;

    let cleaned = response
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let result: TranslationResult = serde_json::from_str(cleaned).map_err(|e| {
        log::error!(
            "Failed to parse translation response: {}. Raw: {}",
            e,
            response
        );
        format!("Translation response format error: {}", e)
    })?;

    log::debug!("Word translated: {} -> {}", word, result.translation);
    Ok(result)
}

/// Translate multiple paragraphs in a single LLM call
pub async fn translate_paragraphs(
    client: &LlmClient,
    db: &DatabasePool,
    paragraphs: &[String],
    source_lang: &str,
    native_lang: &str,
) -> Result<Vec<String>, String> {
    let source_label = lang_name(source_lang);
    let native_label = lang_name(native_lang);

    let numbered: Vec<String> = paragraphs
        .iter()
        .enumerate()
        .map(|(i, p)| format!("{}. {}", i + 1, p))
        .collect();
    let paras_str = numbered.join("\n");

    let vars = [
        ("SOURCE_LANG", source_label),
        ("TARGET_LANG", native_label),
        ("PARAGRAPHS", &paras_str),
    ];

    let messages = build_chat_messages(db, "translate-paragraphs", &vars);

    let messages = if messages.is_empty() {
        let prompt = format!(
            "Translate the following {source_label} paragraphs into {native_label}, \
             one translation per paragraph, preserving order.\n\n\
             Paragraphs:\n{paras_str}\n\n\
             Return a strict JSON array where each element is the translation of the \
             corresponding paragraph, e.g. [\"first translation\", \"second translation\"]. \
             No extra prose."
        );
        build_chat_messages_fallback(
            "You are a professional translator. Output only JSON.",
            &prompt,
        )
    } else {
        messages
    };

    let response = client.chat(db, messages).await?;

    let cleaned = response
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let translations: Vec<String> = serde_json::from_str(cleaned).map_err(|e| {
        log::error!(
            "Failed to parse paragraph translations: {}. Raw: {}",
            e,
            response
        );
        format!("Paragraph translation format error: {}", e)
    })?;

    log::info!("Translated {} paragraphs", translations.len());
    Ok(translations)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GrammarExplainResult {
    pub explanation: String,
    pub from_cache: bool,
}

pub async fn explain_grammar_point(
    client: &LlmClient,
    db: &DatabasePool,
    cefr_level: &str,
    target_lang: &str,
    unit_title: &str,
    unit_goal: &str,
    grammar_point: &str,
) -> Result<String, String> {
    let target_label = lang_name_zh(target_lang);
    let vars = [
        ("CEFR_LEVEL", cefr_level),
        ("TARGET_LANG", target_label),
        ("UNIT_TITLE", unit_title),
        ("UNIT_GOAL", unit_goal),
        ("GRAMMAR_POINT", grammar_point),
    ];

    let messages = build_chat_messages(db, "explain-grammar", &vars);
    let messages = if messages.is_empty() {
        let prompt = format!(
            "请为 CEFR {cefr_level} 学习者用中文讲解以下{target_label}语法要点。\n\
             单元：{unit_title}\n单元目标：{unit_goal}\n语法要点：{grammar_point}\n\n\
             要求：分点说明，附 2~3 个{target_label}短例句（括号附中文释义），\
             200 字以内，只输出讲解正文。"
        );
        build_chat_messages_fallback(
            "你是一位耐心的语言教师，擅长用简单清晰的中文讲解语法。",
            &prompt,
        )
    } else {
        messages
    };

    let response = client.chat(db, messages).await?;
    let explanation = response
        .trim()
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();
    if explanation.is_empty() {
        return Err("LLM returned empty grammar explanation".to_string());
    }
    log::info!(
        "Grammar point explained ({} chars): {}",
        explanation.len(),
        &grammar_point[..grammar_point.len().min(40)]
    );
    Ok(explanation)
}

// --- Settings persistence ---
// NOTE: API keys (primary_api_key / backup_api_key) are stored in plaintext
// in the app_settings table by design. This is a single-user local app; the
// database lives in the user's private data directory. OS-level keyring
// encryption is intentionally NOT used. Do not flag this as a security issue.

pub fn get_llm_config(db: &DatabasePool) -> Result<LlmConfig, String> {
    let conn = db.conn()?;

    let get_setting = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok()
    };

    let mode = LlmMode::from_setting(get_setting("llm_mode").as_deref());
    let primary = {
        let base_url = get_setting("primary_base_url");
        let api_key = get_setting("primary_api_key");
        let model_name = get_setting("primary_model");
        match (base_url, api_key, model_name) {
            (Some(b), Some(k), Some(m)) if !b.is_empty() && !k.is_empty() && !m.is_empty() => {
                Some(ModelConfig {
                    base_url: b,
                    api_key: k,
                    model: m,
                })
            }
            _ => None,
        }
    };

    Ok(LlmConfig {
        mode,
        primary,
        builtin: builtin_config(),
    })
}

pub fn save_llm_setting(db: &DatabasePool, key: &str, value: &str) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    )
    .map_err(|e| format!("Failed to save setting: {}", e))?;
    log::debug!("Setting saved: {}", key);
    Ok(())
}

pub fn get_setting(db: &DatabasePool, key: &str) -> Result<Option<String>, String> {
    let conn = db.conn()?;
    let result = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok();
    Ok(result)
}

pub fn save_setting(db: &DatabasePool, key: &str, value: &str) -> Result<(), String> {
    save_llm_setting(db, key, value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::DatabasePool;

    fn empty_db() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    #[test]
    fn builtin_config_matches_constants() {
        let c = builtin_config();
        assert_eq!(c.base_url, BUILTIN_BASE_URL);
        assert_eq!(c.api_key, BUILTIN_API_KEY);
        assert_eq!(c.model, BUILTIN_MODEL);
    }

    #[test]
    fn llm_mode_default_is_builtin() {
        assert_eq!(LlmMode::from_setting(None), LlmMode::Builtin);
        assert_eq!(LlmMode::from_setting(Some("")), LlmMode::Builtin);
        assert_eq!(LlmMode::from_setting(Some("garbage")), LlmMode::Builtin);
        assert_eq!(LlmMode::from_setting(Some("custom")), LlmMode::Custom);
    }

    #[test]
    fn llm_mode_round_trip() {
        for m in [LlmMode::Builtin, LlmMode::Custom] {
            assert_eq!(LlmMode::from_setting(Some(m.as_str())), m);
            let json = serde_json::to_string(&m).unwrap();
            let back: LlmMode = serde_json::from_str(&json).unwrap();
            assert_eq!(back, m);
        }
    }

    #[test]
    fn config_defaults_to_builtin_with_no_saved_settings() {
        let db = empty_db();
        let cfg = get_llm_config(&db).unwrap();
        assert_eq!(cfg.mode, LlmMode::Builtin);
        assert!(cfg.primary.is_none());
        assert_eq!(cfg.builtin.base_url, BUILTIN_BASE_URL);
        assert_eq!(cfg.builtin.model, BUILTIN_MODEL);
    }

    #[test]
    fn config_preserves_user_custom_when_saved() {
        let db = empty_db();
        save_llm_setting(&db, "llm_mode", "custom").unwrap();
        save_llm_setting(&db, "primary_base_url", "https://api.example.com/v1").unwrap();
        save_llm_setting(&db, "primary_api_key", "sk-test").unwrap();
        save_llm_setting(&db, "primary_model", "gpt-4o-mini").unwrap();

        let cfg = get_llm_config(&db).unwrap();
        assert_eq!(cfg.mode, LlmMode::Custom);
        let primary = cfg.primary.expect("primary should be set");
        assert_eq!(primary.base_url, "https://api.example.com/v1");
        assert_eq!(primary.api_key, "sk-test");
        assert_eq!(primary.model, "gpt-4o-mini");
        // Builtin is still populated for display.
        assert_eq!(cfg.builtin.model, BUILTIN_MODEL);
    }

    #[test]
    fn config_custom_mode_without_saved_config_has_no_primary() {
        let db = empty_db();
        save_llm_setting(&db, "llm_mode", "custom").unwrap();
        let cfg = get_llm_config(&db).unwrap();
        assert_eq!(cfg.mode, LlmMode::Custom);
        assert!(cfg.primary.is_none());
    }

    #[test]
    fn active_returns_builtin_when_mode_builtin() {
        let cfg = LlmConfig {
            mode: LlmMode::Builtin,
            primary: None,
            builtin: builtin_config(),
        };
        let a = cfg.active().unwrap();
        assert_eq!(a.base_url, BUILTIN_BASE_URL);
    }

    #[test]
    fn active_returns_primary_when_mode_custom_and_set() {
        let cfg = LlmConfig {
            mode: LlmMode::Custom,
            primary: Some(ModelConfig {
                base_url: "https://x".into(),
                api_key: "k".into(),
                model: "m".into(),
            }),
            builtin: builtin_config(),
        };
        let a = cfg.active().unwrap();
        assert_eq!(a.base_url, "https://x");
    }

    #[test]
    fn active_errors_when_mode_custom_but_primary_missing() {
        let cfg = LlmConfig {
            mode: LlmMode::Custom,
            primary: None,
            builtin: builtin_config(),
        };
        let err = cfg.active().unwrap_err();
        assert!(
            err.contains("自定义"),
            "should mention custom config: {err}"
        );
    }
}
