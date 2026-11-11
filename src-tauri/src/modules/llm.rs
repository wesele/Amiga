use crate::modules::database::DatabasePool;
use log;
use reqwest;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Built-in (system-provided) model configuration. Free tier hosted by
/// NVIDIA; offered out of the box so new users have a working AI without
/// having to bring their own API key.
pub const BUILTIN_BASE_URL: &str = "https://integrate.api.nvidia.com/v1";
pub const BUILTIN_API_KEY: &str =
    "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";
pub const BUILTIN_MODEL: &str = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
/// Default multimodal model for speaking scoring (transcribe + rubric).
pub const MULTIMODAL_BUILTIN_MODEL: &str = "gemini-3.8-live";
pub const MULTIMODAL_BUILTIN_BASE_URL: &str = "https://generativelanguage.googleapis.com";
const ENV_BUILTIN_BASE_URL: &str = "IDIOMA_BUILTIN_LLM_BASE_URL";
const ENV_BUILTIN_API_KEY: &str = "IDIOMA_BUILTIN_LLM_API_KEY";
const ENV_BUILTIN_MODEL: &str = "IDIOMA_BUILTIN_LLM_MODEL";
const ENV_MULTIMODAL_BUILTIN_BASE_URL: &str = "IDIOMA_BUILTIN_MULTIMODAL_BASE_URL";
const ENV_MULTIMODAL_BUILTIN_API_KEY: &str = "IDIOMA_BUILTIN_MULTIMODAL_API_KEY";
const ENV_MULTIMODAL_BUILTIN_MODEL: &str = "IDIOMA_BUILTIN_MULTIMODAL_MODEL";
const BUILTIN_THINKING_MODEL_SETTING: &str = "builtin_thinking_model";

fn setting_or_default(value: Option<&str>, default: &str) -> String {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or(default)
        .to_string()
}

fn builtin_config_from_values(
    base_url: Option<&str>,
    api_key: Option<&str>,
    model: Option<&str>,
) -> ModelConfig {
    ModelConfig {
        base_url: setting_or_default(base_url, BUILTIN_BASE_URL)
            .trim_end_matches('/')
            .to_string(),
        api_key: setting_or_default(api_key, BUILTIN_API_KEY),
        model: setting_or_default(model, BUILTIN_MODEL),
        provider: LlmProvider::NvidiaNim,
        // In this project the flag means "explicitly disable reasoning".
        thinking_enabled: true,
    }
}

pub fn builtin_config() -> ModelConfig {
    builtin_config_from_values(
        std::env::var(ENV_BUILTIN_BASE_URL).ok().as_deref(),
        std::env::var(ENV_BUILTIN_API_KEY).ok().as_deref(),
        std::env::var(ENV_BUILTIN_MODEL).ok().as_deref(),
    )
}

pub fn multimodal_builtin_config() -> ModelConfig {
    let base = builtin_config();
    ModelConfig {
        base_url: setting_or_default(
            std::env::var(ENV_MULTIMODAL_BUILTIN_BASE_URL)
                .ok()
                .as_deref(),
            MULTIMODAL_BUILTIN_BASE_URL,
        )
        .trim_end_matches('/')
        .to_string(),
        api_key: setting_or_default(
            std::env::var(ENV_MULTIMODAL_BUILTIN_API_KEY)
                .ok()
                .as_deref(),
            &base.api_key,
        ),
        model: setting_or_default(
            std::env::var(ENV_MULTIMODAL_BUILTIN_MODEL).ok().as_deref(),
            MULTIMODAL_BUILTIN_MODEL,
        ),
        provider: LlmProvider::Gemini,
        thinking_enabled: false,
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum LlmProvider {
    #[default]
    Openai,
    Gemini,
    Deepseek,
    NvidiaNim,
}

impl LlmProvider {
    fn from_setting(value: Option<&str>, base_url: &str, model: &str) -> Self {
        match value {
            Some("gemini") => Self::Gemini,
            Some("deepseek") => Self::Deepseek,
            Some("nvidia_nim") => Self::NvidiaNim,
            Some("openai") => Self::Openai,
            _ if base_url.contains("generativelanguage.googleapis.com")
                || model.to_ascii_lowercase().contains("gemini") =>
            {
                Self::Gemini
            }
            _ if base_url.contains("deepseek.com")
                || model.to_ascii_lowercase().contains("deepseek") =>
            {
                Self::Deepseek
            }
            _ if base_url.contains("nvidia.com")
                || base_url.contains("integrate.api.nvidia.com") =>
            {
                Self::NvidiaNim
            }
            _ => Self::Openai,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Openai => "openai",
            Self::Gemini => "gemini",
            Self::Deepseek => "deepseek",
            Self::NvidiaNim => "nvidia_nim",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub provider: LlmProvider,
    #[serde(default)]
    pub thinking_enabled: bool,
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
pub struct MultimodalConfig {
    pub mode: LlmMode,
    pub custom: Option<ModelConfig>,
    pub builtin: ModelConfig,
}

impl MultimodalConfig {
    pub fn active(&self) -> Result<&ModelConfig, String> {
        match self.mode {
            LlmMode::Builtin => Ok(&self.builtin),
            LlmMode::Custom => self.custom.as_ref().ok_or_else(|| {
                "未配置自定义多模态模型 API。请填写 API Key、Base URL 和模型后保存。".to_string()
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
    #[serde(default)]
    pub new_words_used: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationResult {
    /// Translation of the word in the user's native language.
    #[serde(default)]
    pub translation: String,
    #[serde(default)]
    pub ipa: Option<String>,
    #[serde(default)]
    pub pos: Option<String>,
    #[serde(default)]
    pub example: Option<String>,
}

/// Map a language code to a human-readable name (used in LLM prompts and
/// bio strings). Falls back to the raw code for unsupported languages.
pub fn lang_name(code: &str) -> &'static str {
    let base = code.split('-').next().unwrap_or(code).to_lowercase();
    match base.as_str() {
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
    let base = code.split('-').next().unwrap_or(code).to_lowercase();
    match base.as_str() {
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
    pub time_to_first_token_ms: u32,
    pub thinking_speed: f32, // tokens/sec
    pub decode_speed: f32,   // tokens/sec
    pub thinking_tokens: u32,
    pub completion_tokens: u32,
}

#[derive(Clone)]
pub struct LlmClient {
    http: reqwest::Client,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct CompletionProgress {
    pub tokens: u64,
    pub estimated: bool,
}

#[derive(Default)]
struct StreamedCompletion {
    content: String,
    reasoning: String,
    tokens: Option<u64>,
}

impl StreamedCompletion {
    fn push(&mut self, line: &[u8]) -> Result<bool, String> {
        let line = std::str::from_utf8(line).map_err(|e| format!("Invalid stream text: {e}"))?;
        let Some(data) = line.strip_prefix("data:").map(str::trim) else {
            return Ok(false);
        };
        if data == "[DONE]" {
            return Ok(true);
        }
        if data.is_empty() {
            return Ok(false);
        }
        let event: Value =
            serde_json::from_str(data).map_err(|e| format!("Invalid stream response: {e}"))?;
        if event.get("error").is_some_and(|error| !error.is_null()) {
            return Err("大模型返回了流式生成错误，请重试".into());
        }
        if let Some(tokens) = completion_tokens(&event) {
            self.tokens = Some(tokens);
        }
        let choice = &event["choices"][0];
        let delta = &choice["delta"];
        if let Some(content) = delta["content"]
            .as_str()
            .or_else(|| choice["text"].as_str())
        {
            self.content.push_str(content);
        }
        if let Some(reasoning) = reasoning_text(delta) {
            self.reasoning.push_str(reasoning);
        }
        Ok(false)
    }

    fn progress(&self) -> Option<CompletionProgress> {
        if let Some(tokens) = self.tokens {
            return Some(CompletionProgress {
                tokens,
                estimated: false,
            });
        }
        let bytes = self.content.len() + self.reasoning.len();
        (bytes > 0).then(|| CompletionProgress {
            tokens: bytes.div_ceil(3) as u64,
            estimated: true,
        })
    }
}

fn completion_tokens(reply: &Value) -> Option<u64> {
    reply
        .pointer("/usage/completion_tokens")
        .and_then(Value::as_u64)
}

fn reasoning_text(message: &Value) -> Option<&str> {
    message["reasoning_content"]
        .as_str()
        .or_else(|| message["reasoning"].as_str())
}

fn reasoning_answer(reasoning: &str) -> &str {
    if let (Some(start), Some(end)) = (reasoning.find('{'), reasoning.rfind('}')) {
        if start < end {
            return &reasoning[start..=end];
        }
    }
    reasoning
}

fn apply_thinking_params(body: &mut serde_json::Value, config: &ModelConfig) {
    // 逻辑更改：config.thinking_enabled 现在代表“关闭思考”开关是否被启用。
    // 如果启用 (true)，则发送明确关闭思考的参数；
    // 如果未启用 (false，默认状态)，则不发送任何相关参数（保留大模型服务商的默认行为）。
    if config.thinking_enabled {
        match config.provider {
            LlmProvider::Openai => {
                body["reasoning_effort"] = serde_json::json!("low");
            }
            LlmProvider::Gemini => {
                body["reasoning_effort"] = serde_json::json!("none");
            }
            LlmProvider::Deepseek => {
                body["thinking"] = serde_json::json!({
                    "type": "disabled"
                });
            }
            LlmProvider::NvidiaNim => {
                body["chat_template_kwargs"] = serde_json::json!({
                    "enable_thinking": false
                });
            }
        }
    }
}

impl LlmClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .danger_accept_invalid_certs(true)
            .build()
            .expect("Failed to create HTTP client");
        Self { http }
    }

    /// Stream a chat completion via SSE and emit Tauri events for each delta.
    /// Emits `{ delta: "...", done: false }` for each token chunk,
    /// and `{ delta: "", done: true }` when the stream ends.
    /// Returns the full accumulated response text.
    pub async fn call_stream(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
        event_channel: &str,
        app: &tauri::AppHandle,
    ) -> Result<String, String> {
        use futures_util::StreamExt;

        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        let mut body = serde_json::json!({
            "model": config.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 4096,
            "stream": true,
        });
        apply_thinking_params(&mut body, config);

        let response = self
            .http
            .post(&url)
            .timeout(std::time::Duration::from_secs(90))
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Streaming request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error {}: {}",
                status,
                &text[..text.len().min(300)]
            ));
        }

        let mut stream = response.bytes_stream();
        let mut full_text = String::new();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Stream read error: {e}"))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE lines from the buffer
            loop {
                if let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer.drain(..=newline_pos);

                    if line.starts_with("data: ") {
                        let data = &line["data: ".len()..];
                        if data == "[DONE]" {
                            break;
                        }
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(delta) = json
                                .pointer("/choices/0/delta/content")
                                .and_then(|v| v.as_str())
                            {
                                full_text.push_str(delta);
                                let _ = app.emit(
                                    event_channel,
                                    serde_json::json!({
                                        "delta": delta,
                                        "done": false,
                                    }),
                                );
                            }
                        }
                    }
                } else {
                    break;
                }
            }
        }

        // Signal stream end
        let _ = app.emit(
            event_channel,
            serde_json::json!({
                "delta": "",
                "done": true,
            }),
        );

        Ok(full_text)
    }

    /// Low-level: send the messages to a specific config. No fallback chain.
    async fn call(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        self.call_with_options(config, messages, 4096, 90, true)
            .await
    }

    async fn call_with_options(
        &self,
        config: &ModelConfig,
        messages: Vec<ChatMessage>,
        max_tokens: u32,
        timeout_secs: u64,
        include_completion_tokens: bool,
    ) -> Result<String, String> {
        let mut body = serde_json::json!({
            "model": config.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": max_tokens,
        });
        if include_completion_tokens {
            body["max_completion_tokens"] = serde_json::json!(max_tokens);
        }
        apply_thinking_params(&mut body, config);
        let response = self.send_completion(config, &body, timeout_secs).await?;
        Self::read_completion(response, |_| {}).await
    }

    async fn send_completion(
        &self,
        config: &ModelConfig,
        body: &Value,
        timeout_secs: u64,
    ) -> Result<reqwest::Response, String> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        log::debug!(
            "LLM request to {}: model={} timeout={}s",
            url,
            config.model,
            timeout_secs
        );
        self.http
            .post(&url)
            .timeout(Duration::from_secs(timeout_secs))
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    format!("大模型请求超时（{timeout_secs} 秒），请检查网络或稍后重试")
                } else {
                    format!("HTTP request failed: {e}")
                }
            })
    }

    async fn read_completion(
        response: reqwest::Response,
        report: impl FnOnce(CompletionProgress),
    ) -> Result<String, String> {
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error {status}: {}",
                text.chars().take(300).collect::<String>()
            ));
        }

        let raw_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        let json: serde_json::Value =
            serde_json::from_str(&raw_text).map_err(|e| format!("Invalid JSON response: {}", e))?;
        if let Some(tokens) = completion_tokens(&json) {
            report(CompletionProgress {
                tokens,
                estimated: false,
            });
        }

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
        let reasoning = reasoning_text(&json["choices"][0]["message"]);

        if let Some(reason) = reasoning {
            log::warn!("LLM returned reasoning ({} chars) but content is null/empty. \
                       The model may need more token budget. Trying to extract answer from reasoning...", reason.len());

            return Ok(reasoning_answer(reason).to_string());
        }

        // Other fallback formats
        if let Some(content) = json.pointer("/choices/0/text").and_then(|v| v.as_str()) {
            return Ok(content.to_string());
        }

        Err(format!(
            "LLM returned empty content. Response: {}",
            raw_text.chars().take(500).collect::<String>()
        ))
    }

    pub async fn chat_for_teaching_plan(
        &self,
        db: &DatabasePool,
        messages: Vec<ChatMessage>,
        report: impl Fn(CompletionProgress),
    ) -> Result<String, String> {
        const MAX_TOKENS: u32 = 8192;
        const TIMEOUT_SECS: u64 = 120;
        let config = get_llm_config(db)?;
        let active = config.active()?;
        let mut body = serde_json::json!({
            "model": active.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": MAX_TOKENS,
            "max_completion_tokens": MAX_TOKENS,
            "stream": true,
            "stream_options": { "include_usage": true },
        });
        apply_thinking_params(&mut body, active);
        let rejected =
            |status: reqwest::StatusCode| matches!(status.as_u16(), 400 | 415 | 422 | 501);
        let mut response = self.send_completion(active, &body, TIMEOUT_SECS).await?;
        if rejected(response.status()) {
            // Some compatible providers reject usage options or max_completion_tokens.
            let options = body.as_object_mut().unwrap();
            options.remove("stream_options");
            options.remove("max_completion_tokens");
            response = self.send_completion(active, &body, TIMEOUT_SECS).await?;
            if rejected(response.status()) {
                body.as_object_mut().unwrap().remove("stream");
                response = self.send_completion(active, &body, TIMEOUT_SECS).await?;
                return Self::read_completion(response, report).await;
            }
        }
        let json_response = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.contains("/json") || value.contains("+json"));
        if !response.status().is_success() || json_response {
            return Self::read_completion(response, report).await;
        }
        Self::read_streamed_completion(response, report).await
    }

    async fn read_streamed_completion(
        mut response: reqwest::Response,
        report: impl Fn(CompletionProgress),
    ) -> Result<String, String> {
        let mut completion = StreamedCompletion::default();
        let mut pending = Vec::new();
        let mut last_report = None;
        let mut done = false;
        while !done {
            let Some(chunk) = response
                .chunk()
                .await
                .map_err(|e| format!("Stream read error: {e}"))?
            else {
                break;
            };
            pending.extend_from_slice(&chunk);
            // Keep incomplete lines as bytes so a split UTF-8 character is decoded only once.
            let complete = pending
                .iter()
                .rposition(|&byte| byte == b'\n')
                .map_or(0, |i| i + 1);
            for line in pending[..complete].split_inclusive(|&byte| byte == b'\n') {
                if completion.push(line)? {
                    done = true;
                    break;
                }
            }
            pending.drain(..complete);
            if let Some(progress) = completion.progress() {
                if last_report.as_ref().is_none_or(
                    |&(previous, at): &(CompletionProgress, Instant)| {
                        progress != previous && at.elapsed() >= Duration::from_millis(150)
                    },
                ) {
                    report(progress);
                    last_report = Some((progress, Instant::now()));
                }
            }
        }
        if !done && !pending.is_empty() {
            completion.push(&pending)?;
        }
        if let Some(progress) = completion.progress() {
            if last_report.is_none_or(|(previous, _)| progress != previous) {
                report(progress);
            }
        }
        if !completion.content.trim().is_empty() {
            Ok(completion.content)
        } else if !completion.reasoning.trim().is_empty() {
            Ok(reasoning_answer(&completion.reasoning).into())
        } else {
            Err("大模型返回了空的教学大纲，请重试".into())
        }
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

    #[allow(dead_code)]
    pub async fn chat_with_limits(
        &self,
        db: &DatabasePool,
        messages: Vec<ChatMessage>,
        max_tokens: u32,
        timeout_secs: u64,
    ) -> Result<String, String> {
        let config = get_llm_config(db)?;
        let active = config.active()?;
        self.call_with_options(active, messages, max_tokens, timeout_secs, false)
            .await
    }

    /// Reading articles need a larger completion budget; reasoning models may
    /// consume tokens before emitting JSON.
    pub async fn chat_for_reading_content(
        &self,
        db: &DatabasePool,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        const MAX_TOKENS: u32 = 8192;
        const TIMEOUT_SECS: u64 = 120;

        let config = get_llm_config(db)?;
        let active = config.active()?;
        match self
            .call_with_options(active, messages.clone(), MAX_TOKENS, TIMEOUT_SECS, true)
            .await
        {
            Ok(response) => Ok(response),
            Err(err) if err.contains("max_completion_tokens") || err.contains("HTTP 400") => {
                log::warn!(
                    "Reading content retrying without max_completion_tokens: {}",
                    &err[..err.len().min(120)]
                );
                self.call_with_options(active, messages, MAX_TOKENS, TIMEOUT_SECS, false)
                    .await
            }
            Err(err) => Err(err),
        }
    }

    /// Grammar explanations are short but may need extra time on mobile networks.
    /// Try with `max_completion_tokens` first (NVIDIA builtin), then fall back
    /// without it for older OpenAI-compatible endpoints.
    pub async fn chat_for_grammar(
        &self,
        db: &DatabasePool,
        messages: Vec<ChatMessage>,
    ) -> Result<String, String> {
        const MAX_TOKENS: u32 = 2048;
        const TIMEOUT_SECS: u64 = 120;

        let config = get_llm_config(db)?;
        let active = config.active()?;
        match self
            .call_with_options(active, messages.clone(), MAX_TOKENS, TIMEOUT_SECS, true)
            .await
        {
            Ok(response) => Ok(response),
            Err(err) if err.contains("max_completion_tokens") || err.contains("HTTP 400") => {
                log::warn!(
                    "Grammar explain retrying without max_completion_tokens: {}",
                    &err[..err.len().min(120)]
                );
                self.call_with_options(active, messages, MAX_TOKENS, TIMEOUT_SECS, false)
                    .await
            }
            Err(err) => Err(err),
        }
    }

    pub async fn test_connection(&self, config: &ModelConfig) -> TestResult {
        use futures_util::StreamExt;

        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        let body = serde_json::json!({
            "model": config.model,
            "messages": [{"role": "user", "content": "输出20个常用英语单词"}],
            "max_tokens": 500,
            "stream": true
        });

        let mut body = body;
        apply_thinking_params(&mut body, config);

        let start_time = std::time::Instant::now();

        match self
            .http
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                let mut stream = resp.bytes_stream();
                let mut ttft: Option<u32> = None;
                let mut thinking_end_time: Option<u32> = None;
                let mut reasoning_len = 0;
                let mut content_len = 0;
                let mut usage_completion_tokens: Option<u32> = None;
                let mut reasoning_tokens: Option<u32> = None;
                let mut buffer = String::new();

                while let Some(chunk_res) = stream.next().await {
                    let chunk = match chunk_res {
                        Ok(c) => c,
                        Err(_) => continue,
                    };
                    buffer.push_str(&String::from_utf8_lossy(&chunk));

                    loop {
                        if let Some(newline_pos) = buffer.find('\n') {
                            let line = buffer[..newline_pos].trim().to_string();
                            buffer.drain(..=newline_pos);

                            if line.starts_with("data: ") {
                                let data = &line["data: ".len()..];
                                if data == "[DONE]" {
                                    break;
                                }
                                if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                                    let mut has_content = false;
                                    let mut _chunk_has_reasoning = false;
                                    let mut chunk_has_content = false;

                                    if let Some(delta) = json
                                        .pointer("/choices/0/delta/content")
                                        .and_then(|v| v.as_str())
                                    {
                                        content_len += delta.len();
                                        if !delta.is_empty() {
                                            has_content = true;
                                            chunk_has_content = true;
                                        }
                                    }
                                    if let Some(reason) = json
                                        .pointer("/choices/0/delta/reasoning_content")
                                        .or_else(|| json.pointer("/choices/0/delta/reasoning"))
                                        .and_then(|v| v.as_str())
                                    {
                                        reasoning_len += reason.len();
                                        if !reason.is_empty() {
                                            has_content = true;
                                            _chunk_has_reasoning = true;
                                        }
                                    }

                                    let current_elapsed = start_time.elapsed().as_millis() as u32;

                                    if has_content && ttft.is_none() {
                                        ttft = Some(current_elapsed);
                                    }

                                    if chunk_has_content && thinking_end_time.is_none() {
                                        thinking_end_time = Some(current_elapsed);
                                    }

                                    if let Some(usage) = json.get("usage") {
                                        if !usage.is_null() {
                                            if let Some(ct) = usage
                                                .get("completion_tokens")
                                                .and_then(|v| v.as_u64())
                                            {
                                                usage_completion_tokens = Some(ct as u32);
                                            }
                                            if let Some(rt) = usage
                                                .pointer(
                                                    "/completion_tokens_details/reasoning_tokens",
                                                )
                                                .or_else(|| usage.get("reasoning_tokens"))
                                                .and_then(|v| v.as_u64())
                                            {
                                                reasoning_tokens = Some(rt as u32);
                                            }
                                        }
                                    }
                                }
                            }
                        } else {
                            break;
                        }
                    }
                }

                let elapsed_ms = start_time.elapsed().as_millis() as u32;
                let final_ttft = ttft.unwrap_or(elapsed_ms);

                let reas_tokens = reasoning_tokens.unwrap_or_else(|| {
                    if reasoning_len > 0 {
                        (reasoning_len as u32 / 3).max(1)
                    } else {
                        0
                    }
                });
                let content_tokens = if let Some(total_ct) = usage_completion_tokens {
                    total_ct.saturating_sub(reas_tokens)
                } else {
                    (content_len as u32 / 3).max(5)
                };

                let mut thinking_speed = 0.0;
                let mut decode_speed = 0.0;

                let think_end = thinking_end_time.unwrap_or(elapsed_ms);

                let thinking_duration_ms = think_end.saturating_sub(final_ttft);
                let decode_duration_ms = elapsed_ms.saturating_sub(think_end);

                let total_thinking_secs = if thinking_duration_ms > 0 {
                    thinking_duration_ms as f32 / 1000.0
                } else {
                    0.001
                };
                let total_decode_secs = if decode_duration_ms > 0 {
                    decode_duration_ms as f32 / 1000.0
                } else {
                    0.001
                };

                if reas_tokens > 0 {
                    thinking_speed = (reas_tokens as f32) / total_thinking_secs;
                }
                if content_tokens > 0 {
                    decode_speed = (content_tokens as f32) / total_decode_secs;
                }

                TestResult {
                    success: true,
                    message: "连接成功，模型可用".to_string(),
                    time_to_first_token_ms: final_ttft,
                    thinking_speed,
                    decode_speed,
                    thinking_tokens: reas_tokens,
                    completion_tokens: content_tokens,
                }
            }
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
                    time_to_first_token_ms: 0,
                    thinking_speed: 0.0,
                    decode_speed: 0.0,
                    thinking_tokens: 0,
                    completion_tokens: 0,
                }
            }
            Err(e) => TestResult {
                success: false,
                message: format!("连接失败: {}", e),
                time_to_first_token_ms: 0,
                thinking_speed: 0.0,
                decode_speed: 0.0,
                thinking_tokens: 0,
                completion_tokens: 0,
            },
        }
    }

    /// Multimodal scoring: audio + rubric text → JSON string response.
    pub async fn score_speaking_audio(
        &self,
        config: &ModelConfig,
        audio_base64: &str,
        audio_format: &str,
        system_prompt: &str,
        user_text: &str,
    ) -> Result<String, String> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
        let format = if audio_format.trim().is_empty() {
            "webm"
        } else {
            audio_format.trim()
        };

        let body = serde_json::json!({
            "model": config.model,
            "temperature": 0.2,
            "max_tokens": 1024,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_text
                        },
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": audio_base64,
                                "format": format
                            }
                        }
                    ]
                }
            ]
        });

        log::debug!(
            "Multimodal score request: model={} format={}",
            config.model,
            format
        );

        let response = self
            .http
            .post(&url)
            .timeout(std::time::Duration::from_secs(120))
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Multimodal HTTP failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!(
                "Multimodal API error {}: {}",
                status,
                &text[..text.len().min(300)]
            ));
        }

        let raw_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read multimodal response: {e}"))?;

        let json: serde_json::Value =
            serde_json::from_str(&raw_text).map_err(|e| format!("Invalid multimodal JSON: {e}"))?;

        if let Some(content) = json
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
        {
            if !content.is_empty() {
                return Ok(content.to_string());
            }
        }

        Err(format!(
            "Multimodal returned empty content: {}",
            &raw_text[..raw_text.len().min(500)]
        ))
    }
}

fn apply_prompt_vars(template: &str, vars: &[(&str, &str)]) -> String {
    let mut filled = template.to_string();
    for (k, v) in vars {
        filled = filled.replace(&format!("{{{{{}}}}}", k), v);
    }
    filled
}

pub fn build_chat_messages(
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

    // System prompts also use {{VARS}} (e.g. soulmate TARGET_LANG / NAME).
    // Leaving them unsubstituted makes the model ignore language constraints.
    vec![
        ChatMessage {
            role: "system".to_string(),
            content: apply_prompt_vars(&sys, vars),
        },
        ChatMessage {
            role: "user".to_string(),
            content: apply_prompt_vars(&usr, vars),
        },
    ]
}

/// Truncate to at most `max_chars` Unicode scalars (safe for Chinese log previews).
fn truncate_chars(text: &str, max_chars: usize) -> String {
    let mut out = String::new();
    for (idx, ch) in text.chars().enumerate() {
        if idx >= max_chars {
            out.push('…');
            break;
        }
        out.push(ch);
    }
    out
}

/// Fallback build messages for when DB prompts are not available
/// Strip markdown fences and other wrappers so grammar explanations display as plain text.
fn sanitize_llm_plaintext(raw: &str) -> String {
    let mut text = raw.trim().to_string();
    if text.starts_with("```") {
        if let Some(end) = text.rfind("```") {
            if end > 3 {
                text = text[3..end].trim().to_string();
                if let Some(newline) = text.find('\n') {
                    let lang_tag = text[..newline].trim();
                    if !lang_tag.is_empty()
                        && lang_tag
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
                    {
                        text = text[newline + 1..].trim().to_string();
                    }
                }
            }
        }
    }
    text.trim().to_string()
}

/// Extract the first top-level JSON object (`{…}`) from a string that may
/// contain surrounding prose, markdown fences, or other noise.  Returns the
/// substring from the first `{` to its matching `}` (brace-depth tracking),
/// or `None` if no valid object is found.
fn extract_json_object(raw: &str) -> Option<&str> {
    let bytes = raw.as_bytes();
    let start = bytes.iter().position(|&b| b == b'{')?;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escape_next = false;
    for (i, &b) in bytes[start..].iter().enumerate() {
        if escape_next {
            escape_next = false;
            continue;
        }
        match b {
            b'\\' if in_string => escape_next = true,
            b'"' => in_string = !in_string,
            b'{' if !in_string => depth += 1,
            b'}' if !in_string => {
                depth -= 1;
                if depth == 0 {
                    return Some(&raw[start..start + i + 1]);
                }
            }
            _ => {}
        }
    }
    None
}

pub fn build_chat_messages_fallback(system: &str, user: &str) -> Vec<ChatMessage> {
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
    let clean_title = crate::modules::news::clean_rss_text(original_title);
    let clean_body = crate::modules::news::clean_rss_summary(&clean_title, original_text);
    let body_for_prompt = if clean_body.is_empty() {
        "(Headline only — no article body provided in RSS feed; expand the headline into a complete 2-4 paragraph news reading passage)"
    } else {
        clean_body.as_str()
    };

    let vars = [
        ("CEFR_LEVEL", cefr_level),
        ("NEW_WORDS", &words_list),
        ("SOURCE_LANG", source_label),
        ("TITLE", clean_title.as_str()),
        ("TEXT", body_for_prompt),
    ];

    let messages = build_chat_messages(db, "rewrite-article", &vars);

    // Fallback to hardcoded prompt if DB prompt not available
    let messages = if messages.is_empty() {
        let prompt = format!(
            "Rewrite or expand the following {source_label} news item for a CEFR {cefr_level} language learner.\n\n\
             Requirements:\n\
             1. Stay faithful — keep all stated facts, names, places, numbers, and dates intact; do not invent fake quotes or unverified statistics\n\
             2. Complete article — if the body is empty, repeats the title, or is only a short 1-2 sentence snippet, expand it into a complete, natural 2-4 paragraph news reading passage (about 120-200 words) in {source_label} by providing relevant background context and explaining the topic clearly\n\
             3. Word level — use vocabulary and grammar appropriate for CEFR {cefr_level}; separate paragraphs with \\n\\n\n\
             4. Optional words — naturally weave in where they fit: {words_list}\n\n\
             Return JSON: {{\"rewritten\": \"the rewritten article in {source_label}\", \"new_words_used\": [\"words actually used\"]}}\n\n\
             Title: {clean_title}\n\
             Body: {body_for_prompt}"
        );
        build_chat_messages_fallback(
            "You are a language-learning news rewrite assistant. Output only valid JSON, no extra prose or markdown fences.",
            &prompt,
        )
    } else {
        messages
    };

    let response = client.chat(db, messages).await?;

    // Parse JSON response (extract_json_object handles surrounding prose or markdown fences)
    let cleaned = extract_json_object(&response).unwrap_or_else(|| {
        response
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    });

    let mut result: RewriteResult = serde_json::from_str(cleaned).map_err(|e| {
        log::error!("Failed to parse rewrite response: {}. Raw: {}", e, response);
        format!("AI response format error: {}", e)
    })?;

    result.rewritten = crate::modules::news::clean_rss_text(&result.rewritten);
    validate_rewrite_output(&clean_body, &result.rewritten)?;
    if crate::modules::news::is_summary_duplicate_of_title(&clean_title, &result.rewritten) {
        return Err("改写结果仅重复了标题，请重试".to_string());
    }

    log::info!(
        "Article rewritten successfully, {} new words used",
        result.new_words_used.len()
    );
    Ok(result)
}

/// Reject truncated or obviously broken rewrites so the frontend can prompt retry.
pub fn validate_rewrite_output(original: &str, rewritten: &str) -> Result<(), String> {
    let cleaned_original = crate::modules::news::clean_rss_text(original);
    let original = cleaned_original.trim();
    let rewritten = rewritten.trim();

    if rewritten.is_empty() {
        return Err("改写结果为空，请重试".to_string());
    }

    let min_expected_len = (original.len() / 2).min(400);
    if !original.is_empty() && rewritten.len() < min_expected_len {
        return Err("改写结果过短，可能不完整，请重试".to_string());
    }

    if (rewritten.len() < original.len() || original.is_empty())
        && ends_with_incomplete_word(rewritten)
        && !ends_with_sentence_punctuation(rewritten)
    {
        return Err("改写结果疑似在词中间截断，请重试".to_string());
    }

    if has_obvious_grammar_breaks(rewritten) {
        return Err("改写结果存在明显语法错误，请重试".to_string());
    }

    Ok(())
}

fn ends_with_sentence_punctuation(text: &str) -> bool {
    text.trim_end()
        .chars()
        .last()
        .map(|c| {
            matches!(
                c,
                '.' | '!' | '?' | '。' | '！' | '？' | '"' | '\'' | '»' | '”'
            )
        })
        .unwrap_or(false)
}

fn ends_with_incomplete_word(text: &str) -> bool {
    text.trim_end()
        .chars()
        .last()
        .map(|c| c.is_alphabetic())
        .unwrap_or(false)
}

fn has_obvious_grammar_breaks(text: &str) -> bool {
    let lower = text.to_lowercase();
    const BAD_PATTERNS: &[&str] = &[
        "que no ha inmigrantes",
        "que no ha ",
        "que no es inmigrantes",
        "that no has ",
        "that no is ",
    ];
    BAD_PATTERNS.iter().any(|p| lower.contains(p))
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

    let vars: Vec<(&str, &str)> = vec![
        ("WORD", word),
        ("CONTEXT", context),
        ("SOURCE_LANG", source_label),
        ("TARGET_LANG", native_label),
    ];

    let messages = build_chat_messages(db, "translate-word", &vars);

    // Fallback when the prompt key is missing or returns empty
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

    // Try extract_json_object first (handles prose around JSON, markdown
    // fences, etc.), then fall back to the simpler trim approach.
    let cleaned = extract_json_object(&response).unwrap_or_else(|| {
        response
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    });

    let result: TranslationResult = serde_json::from_str(cleaned).map_err(|e| {
        log::error!(
            "Failed to parse translation response: {}. Raw: {}",
            e,
            response
        );
        format!("Translation response format error: {}", e)
    })?;

    // Guard against empty translation (model returned {} or similar)
    if result.translation.is_empty() {
        log::warn!("translate_word: empty translation for '{}'", word);
        return Err("Translation returned empty result".to_string());
    }

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

    let response = client.chat_for_grammar(db, messages).await?;
    let explanation = sanitize_llm_plaintext(&response);
    if explanation.is_empty() {
        return Err("大模型未返回讲解内容，请重试或检查模型配置".to_string());
    }
    log::info!(
        "Grammar point explained ({} chars): {}",
        explanation.chars().count(),
        truncate_chars(grammar_point, 40)
    );
    Ok(explanation)
}

pub async fn grade_translation(
    client: &LlmClient,
    db: &DatabasePool,
    source_text: &str,
    accepted_answers: &[String],
    user_answer: &str,
    target_lang: &str,
) -> Result<bool, String> {
    let target_label = lang_name_zh(target_lang);
    let accepted_answers_str = accepted_answers
        .iter()
        .map(|ans| format!("- {}", ans))
        .collect::<Vec<String>>()
        .join("\n");

    let vars = [
        ("SOURCE_TEXT", source_text),
        ("ACCEPTED_ANSWERS", &accepted_answers_str),
        ("USER_ANSWER", user_answer),
        ("TARGET_LANG", target_label),
    ];

    let messages = build_chat_messages(db, "grade-translation", &vars);
    let messages = if messages.is_empty() {
        let fallback_sys = "You are an expert language teacher and assessment assistant. Evaluate if a user's translation is correct and natural. Output a strict JSON object with a single boolean field: {\"correct\": true/false}";
        let fallback_usr = format!(
            "Evaluate the user's translation to see if it is correct.\n\
             Source sentence (in user's native language): {}\n\
             Reference translations (in target language {}):\n\
             {}\n\n\
             User's translation: {}\n\n\
             Requirements:\n\
             1. Determine if the user's translation is grammatically correct and accurately translates the source sentence.\n\
             2. Allow for natural variations in word choice, phrasing, and word order as long as they are correct in the target language and capture the same meaning.\n\
             3. Be lenient with minor typos or punctuation/capitalization differences.\n\
             4. Output a strict JSON object: {{\"correct\": true}} or {{\"correct\": false}}",
            source_text, target_label, accepted_answers_str, user_answer
        );
        build_chat_messages_fallback(fallback_sys, &fallback_usr)
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

    #[derive(serde::Deserialize)]
    struct GradeResult {
        correct: bool,
    }

    let result: GradeResult = serde_json::from_str(cleaned).map_err(|e| {
        log::error!(
            "Failed to parse grade_translation response: {}. Raw: {}",
            e,
            response
        );
        format!("Grade translation response format error: {}", e)
    })?;

    log::info!("Translation graded: correct={}", result.correct);
    Ok(result.correct)
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
                let provider =
                    LlmProvider::from_setting(get_setting("primary_provider").as_deref(), &b, &m);
                let thinking_enabled = matches!(
                    get_setting("primary_thinking_enabled").as_deref(),
                    Some("true")
                );
                Some(ModelConfig {
                    base_url: b,
                    api_key: k,
                    model: m,
                    provider,
                    thinking_enabled,
                })
            }
            _ => None,
        }
    };

    let mut builtin = builtin_config();
    let saved_thinking_model = get_setting(BUILTIN_THINKING_MODEL_SETTING);
    if saved_thinking_model.as_deref() == Some(builtin.model.as_str()) {
        builtin.thinking_enabled = match get_setting("builtin_thinking_enabled").as_deref() {
            Some("false") => false,
            Some("true") => true,
            _ => builtin.thinking_enabled,
        };
    } else {
        // A reasoning preference saved for an older built-in model must not
        // silently enable reasoning on a newly shipped model. Reset it once,
        // then preserve any choice the user makes for this exact model.
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params!["builtin_thinking_enabled", "true"],
        )
        .map_err(|e| format!("Failed to migrate built-in thinking setting: {e}"))?;
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![BUILTIN_THINKING_MODEL_SETTING, builtin.model],
        )
        .map_err(|e| format!("Failed to migrate built-in model setting: {e}"))?;
        builtin.thinking_enabled = true;
    }

    Ok(LlmConfig {
        mode,
        primary,
        builtin,
    })
}

pub fn get_multimodal_config(db: &DatabasePool) -> Result<MultimodalConfig, String> {
    let conn = db.conn()?;

    let get_setting = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok()
    };

    let mode = LlmMode::from_setting(get_setting("multimodal_mode").as_deref());
    let custom = {
        let base_url = get_setting("multimodal_base_url");
        let api_key = get_setting("multimodal_api_key");
        let model_name = get_setting("multimodal_model");
        match (base_url, api_key, model_name) {
            (Some(b), Some(k), Some(m)) if !b.is_empty() && !k.is_empty() && !m.is_empty() => {
                let provider = LlmProvider::from_setting(None, &b, &m);
                Some(ModelConfig {
                    base_url: b,
                    api_key: k,
                    model: m,
                    provider,
                    thinking_enabled: false,
                })
            }
            _ => None,
        }
    };

    Ok(MultimodalConfig {
        mode,
        custom,
        builtin: multimodal_builtin_config(),
    })
}

pub fn save_multimodal_config(db: &DatabasePool, config: &ModelConfig) -> Result<(), String> {
    save_llm_setting(db, "multimodal_base_url", &config.base_url)?;
    save_llm_setting(db, "multimodal_api_key", &config.api_key)?;
    save_llm_setting(db, "multimodal_model", &config.model)?;
    Ok(())
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
    save_llm_setting(db, key, value)?;
    if key == "builtin_thinking_enabled" {
        save_llm_setting(db, BUILTIN_THINKING_MODEL_SETTING, &builtin_config().model)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::DatabasePool;

    #[test]
    fn classroom_stream_estimates_output_until_usage_arrives() {
        let mut reply = StreamedCompletion::default();
        assert!(reply.progress().is_none());
        assert!(!reply.push(b": keep-alive\r\n").unwrap());
        assert!(!reply
            .push(r#"data: {"choices":[{"delta":{"reasoning_content":"想法"}}]}"#.as_bytes())
            .unwrap());
        assert_eq!(
            reply.progress(),
            Some(CompletionProgress {
                tokens: 2,
                estimated: true
            })
        );
        assert!(!reply
            .push(r#"data: {"choices":[{"delta":{"content":"课程"}}]}"#.as_bytes())
            .unwrap());
        assert_eq!(
            reply.progress(),
            Some(CompletionProgress {
                tokens: 4,
                estimated: true
            })
        );
        assert!(!reply
            .push(br#"data: {"choices":[],"usage":{"completion_tokens":7}}"#)
            .unwrap());
        assert!(reply.push(b"data: [DONE]\r\n").unwrap());
        assert_eq!(reply.content, "课程");
        assert_eq!(
            reply.progress(),
            Some(CompletionProgress {
                tokens: 7,
                estimated: false
            })
        );
    }

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
    fn builtin_config_from_values_applies_overrides_and_trims_url() {
        let c = builtin_config_from_values(
            Some(" https://llm.test/v1/ "),
            Some(" test-key "),
            Some(" test-model "),
        );
        assert_eq!(c.base_url, "https://llm.test/v1");
        assert_eq!(c.api_key, "test-key");
        assert_eq!(c.model, "test-model");
    }

    #[test]
    fn builtin_config_from_values_falls_back_for_empty_overrides() {
        let c = builtin_config_from_values(Some(""), Some("  "), None);
        assert_eq!(c.base_url, BUILTIN_BASE_URL);
        assert_eq!(c.api_key, BUILTIN_API_KEY);
        assert_eq!(c.model, BUILTIN_MODEL);
        assert_eq!(c.provider, LlmProvider::NvidiaNim);
        assert!(c.thinking_enabled);
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
        assert_eq!(cfg.builtin.provider, LlmProvider::NvidiaNim);
        assert!(cfg.builtin.thinking_enabled);
    }

    #[test]
    fn config_migrates_thinking_choice_when_builtin_model_changes() {
        let db = empty_db();
        save_llm_setting(&db, "builtin_thinking_enabled", "false").unwrap();
        assert!(get_llm_config(&db).unwrap().builtin.thinking_enabled);
        assert_eq!(
            get_setting(&db, "builtin_thinking_enabled")
                .unwrap()
                .as_deref(),
            Some("true")
        );
        assert_eq!(
            get_setting(&db, BUILTIN_THINKING_MODEL_SETTING)
                .unwrap()
                .as_deref(),
            Some(BUILTIN_MODEL)
        );
    }

    #[test]
    fn config_preserves_choice_saved_for_current_builtin_model() {
        let db = empty_db();
        save_setting(&db, "builtin_thinking_enabled", "false").unwrap();
        assert!(!get_llm_config(&db).unwrap().builtin.thinking_enabled);

        save_setting(&db, "builtin_thinking_enabled", "true").unwrap();
        assert!(get_llm_config(&db).unwrap().builtin.thinking_enabled);
    }

    #[test]
    fn config_preserves_user_custom_when_saved() {
        let db = empty_db();
        save_llm_setting(&db, "llm_mode", "custom").unwrap();
        save_llm_setting(&db, "primary_base_url", "https://api.example.com/v1").unwrap();
        save_llm_setting(&db, "primary_api_key", "sk-test").unwrap();
        save_llm_setting(&db, "primary_model", "gpt-4o-mini").unwrap();
        save_llm_setting(&db, "primary_provider", "openai").unwrap();
        save_llm_setting(&db, "primary_thinking_enabled", "true").unwrap();

        let cfg = get_llm_config(&db).unwrap();
        assert_eq!(cfg.mode, LlmMode::Custom);
        let primary = cfg.primary.expect("primary should be set");
        assert_eq!(primary.base_url, "https://api.example.com/v1");
        assert_eq!(primary.api_key, "sk-test");
        assert_eq!(primary.model, "gpt-4o-mini");
        assert_eq!(primary.provider, LlmProvider::Openai);
        assert!(primary.thinking_enabled);
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
                provider: LlmProvider::Openai,
                thinking_enabled: false,
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

    #[test]
    fn maps_thinking_toggle_to_each_provider_request_shape() {
        let config = |provider, enabled| ModelConfig {
            base_url: "https://example.test/v1".into(),
            api_key: "key".into(),
            model: "model".into(),
            provider,
            thinking_enabled: enabled,
        };

        let mut openai = serde_json::json!({"temperature": 0.3});
        apply_thinking_params(&mut openai, &config(LlmProvider::Openai, false));
        assert!(openai.get("reasoning_effort").is_none());

        let mut gemini = serde_json::json!({});
        apply_thinking_params(&mut gemini, &config(LlmProvider::Gemini, true));
        assert_eq!(gemini["reasoning_effort"], "none");

        let mut deepseek = serde_json::json!({"temperature": 0.3});
        apply_thinking_params(&mut deepseek, &config(LlmProvider::Deepseek, true));
        assert_eq!(deepseek["thinking"]["type"], "disabled");

        let mut nvidia = serde_json::json!({});
        apply_thinking_params(&mut nvidia, &config(LlmProvider::NvidiaNim, true));
        assert_eq!(nvidia["chat_template_kwargs"]["enable_thinking"], false);
    }

    #[test]
    fn build_chat_messages_substitutes_vars_in_system_and_user() {
        let db = empty_db();
        crate::modules::prompts::ensure_default_prompts(&db);
        let messages = build_chat_messages(
            &db,
            "soulmate-story",
            &[
                ("NAME", "小雨"),
                ("TYPE", "soul"),
                ("PERSONALITY", "warm"),
                ("LOCATION", "上海"),
                ("TARGET_LANG", "Chinese"),
                ("CEFR", "A1"),
                ("DAY", "1"),
                ("INTENSITY", "2"),
                ("ROMANCE", "1"),
                ("SURPRISE", "2"),
                ("KNOWLEDGE", "2"),
                ("VARIETY_SEED", "seed-abc"),
                ("STORY_SUMMARY", ""),
                ("MEMORY_SUMMARY", ""),
                ("CURRENT_HOOKS", "(none)"),
            ],
        );
        assert_eq!(messages.len(), 2);
        assert!(messages[0].content.contains("Chinese"));
        assert!(!messages[0].content.contains("{{TARGET_LANG}}"));
        assert!(messages[1].content.contains("小雨"));
        assert!(messages[1].content.contains("Chinese"));
        assert!(messages[1].content.contains("seed-abc"));
        assert!(messages[1].content.contains("(none)"));
        assert!(!messages[1].content.contains("{{NAME}}"));
        assert!(!messages[1].content.contains("{{VARIETY_SEED}}"));
        assert!(!messages[1].content.contains("{{CURRENT_HOOKS}}"));
    }

    #[test]
    fn validate_rewrite_rejects_empty_output() {
        let err = validate_rewrite_output("Some original article text.", "").unwrap_err();
        assert!(err.contains("为空"));
    }

    #[test]
    fn validate_rewrite_rejects_suspiciously_short_output() {
        let original = "This is a full news article with many sentences and enough length.";
        let short = "Too short.";
        let err = validate_rewrite_output(original, short).unwrap_err();
        assert!(err.contains("过短"));
    }

    #[test]
    fn validate_rewrite_rejects_mid_word_truncation() {
        let original = "Los inmigrantes llegaron a la ciudad ayer por la tarde.";
        let truncated = "Los inmigrantes llegaron a la ciud";
        let err = validate_rewrite_output(original, truncated).unwrap_err();
        assert!(err.contains("截断"));
    }

    #[test]
    fn validate_rewrite_rejects_obvious_grammar_breaks() {
        let original = "El gobierno anunció nuevas medidas para los inmigrantes.";
        let broken = "El gobierno anunció que no ha inmigrantes en la frontera.";
        let err = validate_rewrite_output(original, broken).unwrap_err();
        assert!(err.contains("语法错误"));
    }

    #[test]
    fn validate_rewrite_accepts_complete_rewrite() {
        let original = "Los inmigrantes llegaron a la ciudad ayer por la tarde.";
        let rewritten =
            "Los inmigrantes llegaron a la ciudad ayer por la tarde. Fue un día tranquilo.";
        assert!(validate_rewrite_output(original, rewritten).is_ok());
    }

    #[test]
    fn validate_rewrite_ignores_html_link_bloat_in_original() {
        let original = r##"<a href="https://news.google.com/rss/articles/CBMi1gFBVV95cUxOVjVROF9HLXpLV21Vb2ZhRmhuLXEyX2ZwQmdDM19lZUZvZFNoM2drTTJWOUhIZzloYjZqV0tVWlFMSGxtUGhPcDcxNmhoanBIRy1DdkY4SUQ4N2pFLTdUTERGbXlvd0RHRVdCY1pTSXR1MnBCOU1OeFZ2TDFrWXpEM3FhVEJmZFdpQWoxVGs4WmRUY0xVcWozaUtPU3ZodE5zYWdNbi15QkxBeFFJNEt0OHFuS3dLVkpzRmNiWVU2SXhkajJpTXUxRmktZ2NHNzI1UjZhM1hn?oc=5" target="_blank">Una startup resuelve un problema cuántico con IA</a>&nbsp;&nbsp;<font color="#6f6f6f">Infobae</font>"##;
        let rewritten = "Una empresa joven usó un nuevo modelo de inteligencia artificial para resolver un problema de física cuántica que estaba abierto desde el año 2008.";
        assert!(validate_rewrite_output(original, rewritten).is_ok());
    }

    #[test]
    fn sanitize_llm_plaintext_strips_markdown_fence() {
        let raw = "```markdown\n1. Ser 用于永久特征\n2. Estar 用于临时状态\n```";
        assert_eq!(
            sanitize_llm_plaintext(raw),
            "1. Ser 用于永久特征\n2. Estar 用于临时状态"
        );
    }

    #[test]
    fn sanitize_llm_plaintext_preserves_plain_text() {
        let raw = "1. Ser 表示永久特征\n2. Estar 表示临时状态";
        assert_eq!(sanitize_llm_plaintext(raw), raw);
    }

    #[test]
    fn truncate_chars_respects_utf8_boundaries() {
        let text = "ser 和 estar 的基本区别：ser 用于描述永久特征，estar 用于描述临时状态";
        let truncated = truncate_chars(text, 40);
        assert!(truncated.is_char_boundary(truncated.len()));
        assert!(truncated.chars().count() <= 41);
    }

    #[test]
    fn multimodal_builtin_config_defaults() {
        let text = builtin_config();
        let mm = multimodal_builtin_config();
        assert_eq!(mm.base_url, MULTIMODAL_BUILTIN_BASE_URL);
        assert_eq!(mm.api_key, text.api_key);
        assert_eq!(mm.model, MULTIMODAL_BUILTIN_MODEL);
        assert_eq!(mm.provider, LlmProvider::Gemini);
        assert!(!mm.thinking_enabled);
    }

    #[tokio::test]
    #[ignore = "live multimodal call — run with: cargo test multimodal_builtin_connection_live -- --ignored --nocapture"]
    async fn multimodal_builtin_connection_live() {
        let client = LlmClient::new();
        let cfg = multimodal_builtin_config();
        let result = client.test_connection(&cfg).await;
        assert!(
            result.success,
            "multimodal builtin unavailable: {}",
            result.message
        );
    }

    #[tokio::test]
    #[ignore = "live LLM call — run with: cargo test explain_grammar_point_live -- --ignored --nocapture"]
    async fn explain_grammar_point_live() {
        let db = empty_db();
        crate::modules::prompts::ensure_default_prompts(&db);
        let client = LlmClient::new();
        let result = explain_grammar_point(
            &client,
            &db,
            "A1",
            "es",
            "基础问候与自我介绍",
            "掌握基础问候用语",
            "ser 和 estar 的基本区别：ser 用于描述永久特征，estar 用于描述临时状态",
        )
        .await
        .expect("grammar explain should succeed against builtin model");
        assert!(
            result.chars().count() >= 20,
            "expected substantive explanation, got: {result}"
        );
    }
}
