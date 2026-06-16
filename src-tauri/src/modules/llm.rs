use reqwest;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use log;
use crate::modules::database::DatabasePool;

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
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
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
    pub translation_zh: String,
    pub translation_es: Option<String>,
    pub ipa: Option<String>,
    pub pos: Option<String>,
    pub example: Option<String>,
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

    async fn chat(&self, config: &ModelConfig, messages: Vec<ChatMessage>) -> Result<String, String> {
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

        let response = self.http
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
            return Err(format!("API error {}: {}", status, &text[..text.len().min(300)]));
        }

        let raw_text = response.text().await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        let json: serde_json::Value = serde_json::from_str(&raw_text)
            .map_err(|e| format!("Invalid JSON response: {}", e))?;

        // Standard OpenAI: choices[0].message.content
        if let Some(content) = json.pointer("/choices/0/message/content").and_then(|v| v.as_str()) {
            if !content.is_empty() {
                log::debug!("LLM response: content field ({} chars)", content.len());
                return Ok(content.to_string());
            }
        }

        // Reasoning models: reasoning_content (DeepSeek-style) or reasoning (Nemotron-style)
        // Contains chain-of-thought, NOT the final answer
        let reasoning = json.pointer("/choices/0/message/reasoning_content")
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

        Err(format!("LLM returned empty content. Response: {}", &raw_text[..raw_text.len().min(500)]))
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
                    return Err(format!("AI 功能暂时不可用。主模型错误: {}，备用模型错误: {}", primary_error, e));
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

        match self.http
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
                let short_msg = if text.len() > 100 { &text[..100] } else { &text };
                TestResult {
                    success: false,
                    message: format!("连接失败: HTTP {} - {}", status, short_msg),
                }
            },
            Err(e) => TestResult {
                success: false,
                message: format!("连接失败: {}", e),
            },
        }
    }
}

pub async fn rewrite_article(
    client: &LlmClient,
    db: &DatabasePool,
    original_text: &str,
    original_title: &str,
    cefr_level: &str,
    new_words: &[String],
) -> Result<RewriteResult, String> {
    let words_list = new_words.join(", ");
    let prompt = format!(
        "你是一个西班牙语语言学习助手。请将以下新闻改写为 CEFR {} 级别。\n\n\
        规则：\n\
        1. 新闻事实（人名、地名、数字、日期）一字不改\n\
        2. 句式简化为 {} 对应的复杂度（A1用简单短句，A2可用简单复合句，B1+可用从句）\n\
        3. 从以下词汇中挑选新词自然植入文章：{}\n\
        4. 新词用 **加粗** 标记（markdown格式）\n\
        5. 文章长度控制：A1约3-5句，A2约1-2段，B1+完整新闻\n\
        6. 返回严格的 JSON 格式：{{\"rewritten\": \"改写后的全文\", \"new_words_used\": [\"实际植入的词\"]}}\n\n\
        新闻标题：{}\n\
        新闻原文：{}",
        cefr_level, cefr_level, words_list, original_title, original_text
    );

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: "你是专业的语言学习改写助手，擅长根据CEFR等级调整文章难度。只返回JSON格式。".to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: prompt,
        },
    ];

    let response = client.chat_with_fallback(db, messages).await?;

    // Parse JSON response
    let cleaned = response.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let result: RewriteResult = serde_json::from_str(cleaned)
        .map_err(|e| {
            log::error!("Failed to parse rewrite response: {}. Raw: {}", e, response);
            format!("AI 返回格式异常: {}", e)
        })?;

    log::info!("Article rewritten successfully, {} new words used", result.new_words_used.len());
    Ok(result)
}

pub async fn translate_word(
    client: &LlmClient,
    db: &DatabasePool,
    word: &str,
    context: &str,
    native_lang: &str,
) -> Result<TranslationResult, String> {
    let lang_name = match native_lang {
        "zh" => "中文",
        "en" => "English",
        "es" => "Español",
        _ => native_lang,
    };

    let prompt = format!(
        "翻译以下西班牙语单词，基于给定上下文：\n\
        单词: {}\n\
        上下文: {}\n\
        目标翻译语言: {}\n\
        返回严格的 JSON 格式：{{\"translation_zh\": \"中文翻译\", \"translation_es\": \"西语释义\", \"ipa\": \"IPA音标\", \"pos\": \"词性(名词/动词/形容词等)\", \"example\": \"一个简单例句\"}}",
        word, context, lang_name
    );

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: "你是专业的西班牙语翻译助手。给出准确的翻译和音标信息。只返回JSON格式。".to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: prompt,
        },
    ];

    let response = client.chat_with_fallback(db, messages).await?;

    let cleaned = response.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let result: TranslationResult = serde_json::from_str(cleaned)
        .map_err(|e| {
            log::error!("Failed to parse translation response: {}. Raw: {}", e, response);
            format!("翻译返回格式异常: {}", e)
        })?;

    log::debug!("Word translated: {} -> {}", word, result.translation_zh);
    Ok(result)
}

/// Translate multiple paragraphs in a single LLM call
pub async fn translate_paragraphs(
    client: &LlmClient,
    db: &DatabasePool,
    paragraphs: &[String],
    native_lang: &str,
) -> Result<Vec<String>, String> {
    let lang_name = match native_lang {
        "zh" => "中文",
        "en" => "English",
        _ => native_lang,
    };

    let numbered: Vec<String> = paragraphs
        .iter()
        .enumerate()
        .map(|(i, p)| format!("{}. {}", i + 1, p))
        .collect();

    let prompt = format!(
        "请将以下西班牙语段落逐段翻译为{}。每段独立翻译，保持原文段落结构。\n\n\
        段落列表：\n{}\n\n\
        返回严格的 JSON 数组格式，每个元素对应一段的翻译。例如：[\"第一段翻译\", \"第二段翻译\"]\n\
        不要添加任何额外文字或解释。",
        lang_name,
        numbered.join("\n")
    );

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: format!("你是专业翻译，只返回 JSON 数组格式。"),
        },
        ChatMessage {
            role: "user".to_string(),
            content: prompt,
        },
    ];

    let response = client.chat_with_fallback(db, messages).await?;

    let cleaned = response.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let translations: Vec<String> = serde_json::from_str(cleaned)
        .map_err(|e| {
            log::error!("Failed to parse paragraph translations: {}. Raw: {}", e, response);
            format!("段落翻译格式异常: {}", e)
        })?;

    log::info!("Translated {} paragraphs", translations.len());
    Ok(translations)
}

// --- Settings persistence ---

pub fn get_llm_config(db: &DatabasePool) -> Result<LlmConfig, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let get_setting = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).ok()
    };

    let primary = {
        let base_url = get_setting("primary_base_url");
        let api_key = get_setting("primary_api_key");
        let model_name = get_setting("primary_model");
        match (base_url, api_key, model_name) {
            (Some(b), Some(k), Some(m)) if !b.is_empty() && !k.is_empty() && !m.is_empty() => {
                Some(ModelConfig { base_url: b, api_key: k, model: m })
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
                Some(ModelConfig { base_url: b, api_key: k, model: m })
            }
            _ => None,
        }
    };

    Ok(LlmConfig { primary, backup })
}

pub fn save_llm_setting(db: &DatabasePool, key: &str, value: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![key, value],
    ).map_err(|e| format!("Failed to save setting: {}", e))?;
    log::debug!("Setting saved: {}", key);
    Ok(())
}

pub fn get_setting(db: &DatabasePool, key: &str) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let result = conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ).ok();
    Ok(result)
}

pub fn save_setting(db: &DatabasePool, key: &str, value: &str) -> Result<(), String> {
    save_llm_setting(db, key, value)
}
