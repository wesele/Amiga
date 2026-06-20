use crate::modules::database::DatabasePool;
use log;
use reqwest;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LlmConfig {
    pub primary: Option<ModelConfig>,
    pub backup: Option<ModelConfig>,
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

    async fn chat(
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

    pub async fn chat_with_fallback(
        &self,
        db: &DatabasePool,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        let config = get_llm_config(db)?;
        let mut primary_error = String::new();

        // Try primary model first
        if let Some(primary) = &config.primary {
            match self.chat(primary, messages.clone()).await {
                Ok(result) => return Ok(result),
                Err(e) => {
                    primary_error = e.clone();
                    log::warn!("Primary model failed: {}. Trying backup...", e);
                }
            }
        }

        // Try backup model
        if let Some(backup) = &config.backup {
            match self.chat(backup, messages).await {
                Ok(result) => {
                    log::info!("Backup model succeeded, returning fallback result");
                    return Ok(result);
                }
                Err(e) => {
                    log::error!("Backup model also failed: {}", e);
                    return Err(format!(
                        "AI 功能暂时不可用。主模型错误: {}，备用模型错误: {}",
                        primary_error, e
                    ));
                }
            }
        }

        // No backup and primary failed
        if !primary_error.is_empty() {
            return Err(format!("AI 功能不可用: {}", primary_error));
        }

        Err("未配置大模型 API，请在设置中配置 API 密钥。".to_string())
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

    let response = client.chat_with_fallback(db, messages).await?;

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

    let response = client.chat_with_fallback(db, messages).await?;

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

    let response = client.chat_with_fallback(db, messages).await?;

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

// --- Settings persistence ---

pub fn get_llm_config(db: &DatabasePool) -> Result<LlmConfig, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    let get_setting = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok()
    };

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

    let backup = {
        let base_url = get_setting("backup_base_url");
        let api_key = get_setting("backup_api_key");
        let model_name = get_setting("backup_model");
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

    Ok(LlmConfig { primary, backup })
}

pub fn save_llm_setting(db: &DatabasePool, key: &str, value: &str) -> Result<(), String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
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
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
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
