use crate::modules::database::DatabasePool;
use crate::modules::llm::{ChatMessage, LlmClient};
use crate::modules::prompts;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use uuid::Uuid;

pub const MAX_CONTEXT_MESSAGES: usize = 20;
pub const PROFILE_UPDATE_INTERVAL: i32 = 8;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatSession {
    pub id: String,
    pub user_id: String,
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
pub struct ChatMessageItem {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

// ─── Session CRUD ───

pub fn create_session(
    db: &DatabasePool,
    user_id: &str,
    title: &str,
    contact_type: &str,
    target_lang: &str,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO chat_sessions (id, user_id, title, contact_type, target_language, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))",
        params![id, user_id, title, contact_type, target_lang],
    ).map_err(|e| format!("Failed to create session: {}", e))?;
    Ok(id)
}

pub fn get_sessions(db: &DatabasePool, target_lang: &str) -> Result<Vec<ChatSession>, String> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, user_id, title, user_profile_json, conversation_summary, message_count, contact_type, target_language, last_message, created_at, updated_at FROM chat_sessions WHERE target_language = ?1 ORDER BY updated_at DESC"
    ).map_err(|e| format!("Failed to prepare: {}", e))?;

    let sessions = stmt
        .query_map(params![target_lang], |row| {
            Ok(ChatSession {
                id: row.get(0)?,
                user_id: row.get(1)?,
                title: row.get(2)?,
                user_profile_json: row.get(3)?,
                conversation_summary: row.get(4)?,
                message_count: row.get(5)?,
                contact_type: row.get(6)?,
                target_language: row.get(7)?,
                last_message: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query: {}", e))?;

    sessions
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect: {}", e))
}

pub fn delete_session(db: &DatabasePool, session_id: &str) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "DELETE FROM chat_messages WHERE session_id = ?1",
        params![session_id],
    )
    .map_err(|e| format!("Failed to delete messages: {}", e))?;
    conn.execute(
        "DELETE FROM chat_sessions WHERE id = ?1",
        params![session_id],
    )
    .map_err(|e| format!("Failed to delete session: {}", e))?;
    Ok(())
}

pub fn update_session_title(
    db: &DatabasePool,
    session_id: &str,
    title: &str,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE chat_sessions SET title = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![title, session_id],
    )
    .map_err(|e| format!("Failed to update title: {}", e))?;
    Ok(())
}

// ─── Message CRUD ───

pub fn save_message(
    db: &DatabasePool,
    session_id: &str,
    role: &str,
    content: &str,
) -> Result<i64, String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?1, ?2, ?3, datetime('now'))",
        params![session_id, role, content],
    ).map_err(|e| format!("Failed to save message: {}", e))?;

    let id = conn.last_insert_rowid();
    let preview: String = content.chars().take(60).collect();
    conn.execute(
        "UPDATE chat_sessions SET message_count = message_count + 1, last_message = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![preview, session_id],
    ).map_err(|e| format!("Failed to update session: {}", e))?;

    Ok(id)
}

pub fn get_messages(
    db: &DatabasePool,
    session_id: &str,
    limit: usize,
) -> Result<Vec<ChatMessageItem>, String> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, created_at FROM chat_messages WHERE session_id = ?1 ORDER BY id ASC"
    ).map_err(|e| format!("Failed to prepare: {}", e))?;

    let all = stmt
        .query_map(params![session_id], |row| {
            Ok(ChatMessageItem {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect: {}", e))?;

    let start = if all.len() > limit {
        all.len() - limit
    } else {
        0
    };
    Ok(all[start..].to_vec())
}

// ─── Profile / Summary ───

pub fn get_session_profile(
    db: &DatabasePool,
    session_id: &str,
) -> Result<(String, String, i32, String), String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT user_profile_json, conversation_summary, message_count, contact_type FROM chat_sessions WHERE id = ?1",
        params![session_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).map_err(|e| format!("Session not found: {}", e))
}

pub fn update_profile(
    db: &DatabasePool,
    session_id: &str,
    profile_json: &str,
    summary: &str,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE chat_sessions SET user_profile_json = ?1, conversation_summary = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![profile_json, summary, session_id],
    ).map_err(|e| format!("Failed to update profile: {}", e))?;
    Ok(())
}

// ─── Prompt loading helpers ───

fn load_system_prompt(
    db: &DatabasePool,
    prompt_key: &str,
    vars: &[(&str, &str)],
) -> Option<String> {
    match prompts::get_prompt(db, prompt_key) {
        Ok(p) => {
            let mut content = p.system_prompt;
            for (k, v) in vars {
                content = content.replace(&format!("{{{{{}}}}}", k), v);
            }
            Some(content)
        }
        Err(_) => None,
    }
}

fn load_user_prompt_template(
    db: &DatabasePool,
    prompt_key: &str,
    vars: &[(&str, &str)],
) -> Option<String> {
    match prompts::get_prompt(db, prompt_key) {
        Ok(p) => {
            let mut content = p.user_prompt_template;
            for (k, v) in vars {
                content = content.replace(&format!("{{{{{}}}}}", k), v);
            }
            Some(content)
        }
        Err(_) => None,
    }
}

// ─── Chat Completion with persistence ───

pub async fn chat_completion(
    client: &LlmClient,
    db: &DatabasePool,
    messages: Vec<ChatMessage>,
    native_lang: &str,
    target_lang: &str,
) -> Result<String, String> {
    let system = build_amiga_system_prompt(db, native_lang, target_lang, "{}", "");

    let mut full_messages = vec![ChatMessage {
        role: "system".to_string(),
        content: system,
    }];
    full_messages.extend(messages);

    client.chat(db, full_messages).await
}

pub async fn chat_completion_with_session(
    client: &LlmClient,
    db: &DatabasePool,
    session_id: &str,
    message: &str,
    native_lang: &str,
    target_lang: &str,
) -> Result<String, String> {
    save_message(db, session_id, "user", message)?;

    let (profile_json, summary, msg_count, contact_type) = get_session_profile(db, session_id)?;

    let system = match contact_type.as_str() {
        "translator" => build_translator_system_prompt(db, target_lang, native_lang),
        _ => build_amiga_system_prompt(db, native_lang, target_lang, &profile_json, &summary),
    };

    let recent = get_messages(db, session_id, MAX_CONTEXT_MESSAGES)?;
    let mut full_messages = vec![ChatMessage {
        role: "system".to_string(),
        content: system,
    }];
    for msg in &recent {
        full_messages.push(ChatMessage {
            role: msg.role.clone(),
            content: msg.content.clone(),
        });
    }

    let reply = client.chat(db, full_messages).await?;

    save_message(db, session_id, "assistant", &reply)?;

    if contact_type == "amiga" {
        let new_count = msg_count + 1;
        if new_count % PROFILE_UPDATE_INTERVAL == 0 {
            let _ =
                update_profile_from_conversation(client, db, session_id, native_lang, target_lang)
                    .await;
        }
    }

    Ok(reply)
}

/// Streaming version: emits tokens via Tauri events as they arrive,
/// saves the complete reply to the DB when the stream finishes.
pub async fn chat_completion_stream_with_session(
    client: &LlmClient,
    db: &DatabasePool,
    session_id: &str,
    message: &str,
    native_lang: &str,
    target_lang: &str,
    event_channel: &str,
    app: &tauri::AppHandle,
) -> Result<String, String> {
    save_message(db, session_id, "user", message)?;

    let (profile_json, summary, msg_count, contact_type) = get_session_profile(db, session_id)?;

    let system = match contact_type.as_str() {
        "translator" => build_translator_system_prompt(db, target_lang, native_lang),
        _ => build_amiga_system_prompt(db, native_lang, target_lang, &profile_json, &summary),
    };

    let recent = get_messages(db, session_id, MAX_CONTEXT_MESSAGES)?;
    let mut full_messages = vec![ChatMessage {
        role: "system".to_string(),
        content: system.clone(),
    }];
    for msg in &recent {
        full_messages.push(ChatMessage {
            role: msg.role.clone(),
            content: msg.content.clone(),
        });
    }

    let config = crate::modules::llm::get_llm_config(db)?;
    let active = config.active()?.clone();

    let reply = match client
        .call_stream(&active, full_messages.clone(), event_channel, app)
        .await
    {
        Ok(text) if !text.is_empty() => text,
        // Fallback to non-streaming if provider doesn't support SSE
        _ => {
            log::warn!("Streaming failed or returned empty, falling back to non-streaming");
            // Emit done to unblock frontend
            let _ = app.emit(event_channel, serde_json::json!({"delta": "", "done": true, "fallback": true}));
            let fallback_messages = {
                let mut msgs = vec![ChatMessage { role: "system".to_string(), content: system }];
                for msg in &recent {
                    msgs.push(ChatMessage { role: msg.role.clone(), content: msg.content.clone() });
                }
                msgs
            };
            client.chat(db, fallback_messages).await?
        }
    };

    save_message(db, session_id, "assistant", &reply)?;

    if contact_type == "amiga" {
        let new_count = msg_count + 1;
        if new_count % PROFILE_UPDATE_INTERVAL == 0 {
            let _ =
                update_profile_from_conversation(client, db, session_id, native_lang, target_lang)
                    .await;
        }
    }

    Ok(reply)
}

fn build_amiga_system_prompt(
    db: &DatabasePool,
    native_lang: &str,
    target_lang: &str,
    profile_json: &str,
    summary: &str,
) -> String {
    let native_label = crate::modules::llm::lang_name(native_lang);
    let target_label = crate::modules::llm::lang_name(target_lang);
    let vars = [("NATIVE_LANG", native_label), ("TARGET_LANG", target_label)];
    let mut system = match load_system_prompt(db, "amiga-chat", &vars) {
        Some(p) => p,
        None => {
            // Fallback (should not happen after ensure_default_prompts).
            // The user wrote the default in English so the same fallback
            // works regardless of the user's target language.
            format!(
                "You are Amiga, an AI language-learning buddy. Your personality: friendly, patient, encouraging.\n\n\
                 User's target language: {target_label}\n\
                 User's native language: {native_label}\n\n\
                 Conversation rules:\n\
                 1. Be concise — answer in 1-3 short sentences for casual chat; only go longer when the user asks for a detailed explanation\n\
                 2. Chat in the user's native language by default; weave in {target_label} only when the user is practicing or explicitly asks for examples\n\
                 3. If the user writes in {target_label}, affirm briefly, then gently correct only obvious errors (do not over-correct)\n\
                 4. Do not give unsolicited lectures, step-by-step study plans, or practice drills unless the user asks\n\
                 5. Skip filler phrases, repetition, and motivational padding — get to the point\n\
                 6. Use at most one emoji per reply, only when it fits naturally\n\
                 7. Your name is Amiga — use it only when introducing yourself or when addressed by name"
            )
        }
    };

    if !profile_json.is_empty() && profile_json != "{}" {
        if let Ok(profile) = serde_json::from_str::<serde_json::Value>(profile_json) {
            system.push_str("\n\n用户当前学习画像：\n");
            if let Some(cefr) = profile.get("cefr_level").and_then(|v| v.as_str()) {
                if !cefr.is_empty() {
                    system.push_str(&format!("- CEFR 等级：{}\n", cefr));
                }
            }
            if let Some(vocab) = profile.get("vocab").and_then(|v| v.as_array()) {
                let words: Vec<&str> = vocab.iter().filter_map(|v| v.as_str()).collect();
                if !words.is_empty() {
                    system.push_str(&format!("- 已使用词汇：{}\n", words.join(", ")));
                }
            }
            if let Some(weak) = profile.get("weaknesses").and_then(|v| v.as_array()) {
                let items: Vec<&str> = weak.iter().filter_map(|v| v.as_str()).collect();
                if !items.is_empty() {
                    system.push_str(&format!("- 薄弱环节：{}\n", items.join(", ")));
                }
            }
            if let Some(strength) = profile.get("strengths").and_then(|v| v.as_array()) {
                let items: Vec<&str> = strength.iter().filter_map(|v| v.as_str()).collect();
                if !items.is_empty() {
                    system.push_str(&format!("- 已掌握优势：{}\n", items.join(", ")));
                }
            }
        }
    }

    if !summary.is_empty() {
        system.push_str(&format!(
            "\n\n上一轮对话总结：{}\n据此调整难度；仅在用户想练习时再针对薄弱环节。",
            summary
        ));
    }

    system
}

fn build_translator_system_prompt(
    db: &DatabasePool,
    source_lang: &str,
    target_lang: &str,
) -> String {
    let source_label = crate::modules::llm::lang_name(source_lang);
    let target_label = crate::modules::llm::lang_name(target_lang);
    let vars = [("SOURCE_LANG", source_label), ("TARGET_LANG", target_label)];
    match load_system_prompt(db, "translator-chat", &vars) {
        Some(p) => p,
        None => {
            // Fallback: keep in sync with the default in modules/prompts.rs.
            r#"你是一个语言翻译助手。对输入的内容进行翻译解释，输出尽量简洁。
请严格遵守以下排版与格式规范：
1. 单词与读音：读音必须紧跟在单词后面。如果是西语或英文单词，格式为：**单词** [读音]。例如：**casa** [ˈkasa]。
2. 去除「翻译」两个字：只用「中文」、「英文」、「西语」等作为粗体标题，且不要有列表符号（bullet point）。例如：
**中文**：房子
**英文**：house
3. 例句部分：将「常见用法例句」改为「例句」，格式为：
**例句**：
- 例句内容 (带翻译)
注意：只有具体例句才使用列表符号（bullet point），粗体标题（如 **中文**：, **例句**：, **相近词**：等）前面绝对不要带列表符号。

具体输入处理逻辑：
- 如果输入是西语单词：标注读音，提供中文和英文（标注美式读音），提供例句，以及该单词的相近相反词。
- 如果输入是西语句子：提供中英文，并解释关键难点。
- 如果输入是中文：提供西语以及相近相反词，和英文（标注美式读音）。
- 如果输入是英文：标注美式读音，提供中文 and 西语。"#.to_string()
        }
    }
}

async fn update_profile_from_conversation(
    client: &LlmClient,
    db: &DatabasePool,
    session_id: &str,
    native_lang: &str,
    target_lang: &str,
) -> Result<(), String> {
    let all_messages = get_messages(db, session_id, MAX_CONTEXT_MESSAGES * 2)?;
    if all_messages.is_empty() {
        return Ok(());
    }

    let conversation: String = all_messages
        .iter()
        .map(|m| format!("{}: {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n");

    let sys_prompt = match load_system_prompt(db, "profile-analysis", &[]) {
        Some(p) => p,
        None => "You output only JSON, no markdown code fences.".to_string(),
    };

    let target_label = crate::modules::llm::lang_name(target_lang);
    let native_label = crate::modules::llm::lang_name(native_lang);
    let user_prompt = match load_user_prompt_template(
        db,
        "profile-analysis",
        &[
            ("TARGET_LANG", target_label),
            ("NATIVE_LANG", native_label),
            ("CONVERSATION", &conversation),
        ],
    ) {
        Some(p) => p,
        None => {
            // Fallback: same language-agnostic schema, just with {{NATIVE_LANG}}
            // interpolation for the summary field.
            format!(
                "You are a language-learning assessment expert. Based on the conversation below, analyze the user's progress learning {target_label}.\n\n\
                 Output JSON (no extra prose):\n\
                 {{\n  \"cefr_level\": \"A1/A2/B1/B2\",\n  \"strengths\": [...],\n  \"weaknesses\": [...],\n  \"known_topics\": [...],\n  \"new_vocab_used\": [...],\n  \"summary\": \"<concise summary in {native_label}, 50 words>\"\n}}\n\n\
                 Conversation:\n{conversation}"
            )
        }
    };

    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: sys_prompt,
        },
        ChatMessage {
            role: "user".to_string(),
            content: user_prompt,
        },
    ];

    match client.chat(db, messages).await {
        Ok(response) => {
            let cleaned = response
                .trim()
                .trim_start_matches("```json")
                .trim_start_matches("```")
                .trim_end_matches("```")
                .trim();

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(cleaned) {
                let (existing_profile, _, _, _) = get_session_profile(db, session_id).unwrap_or((
                    "{}".to_string(),
                    String::new(),
                    0,
                    "amiga".to_string(),
                ));
                let merged = merge_profiles(&existing_profile, &val);
                let summary = val
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                update_profile(db, session_id, &merged, &summary).ok();
            }
        }
        Err(e) => log::warn!("Profile update failed: {}", e),
    }

    Ok(())
}

fn merge_profiles(existing: &str, new: &serde_json::Value) -> String {
    let mut profile: serde_json::Value =
        serde_json::from_str(existing).unwrap_or(serde_json::json!({}));

    if let Some(cefr) = new.get("cefr_level").and_then(|v| v.as_str()) {
        profile["cefr_level"] = serde_json::Value::String(cefr.to_string());
    }
    if let Some(new_vocab) = new.get("new_vocab_used").and_then(|v| v.as_array()) {
        let existing_vocab = profile
            .get("vocab")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut known: Vec<String> = existing_vocab
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        for v in new_vocab {
            let word = v.as_str().unwrap_or("");
            if !word.is_empty() && !known.contains(&word.to_string()) {
                known.push(word.to_string());
            }
        }
        profile["vocab"] = serde_json::Value::Array(
            known
                .iter()
                .map(|s| serde_json::Value::String(s.clone()))
                .collect(),
        );
    }
    if let Some(weak) = new.get("weaknesses").and_then(|v| v.as_array()) {
        profile["weaknesses"] = serde_json::Value::Array(weak.clone());
    }
    if let Some(strength) = new.get("strengths").and_then(|v| v.as_array()) {
        profile["strengths"] = serde_json::Value::Array(strength.clone());
    }

    profile.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::DatabasePool;

    fn setup_db() -> DatabasePool {
        let db = DatabasePool::new_in_memory();
        {
            let conn = db.conn().unwrap();
            conn.execute_batch("INSERT INTO users (id) VALUES ('test-user');")
                .unwrap();
        }
        db
    }

    #[test]
    fn test_create_and_get_sessions() {
        let db = setup_db();
        let id = create_session(&db, "test-user", "测试对话", "amiga", "es").unwrap();
        let sessions = get_sessions(&db, "es").unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, id);
        assert_eq!(sessions[0].title, "测试对话");
        assert_eq!(sessions[0].contact_type, "amiga");
        assert_eq!(sessions[0].target_language, "es");
        assert_eq!(sessions[0].message_count, 0);
    }

    #[test]
    fn test_save_and_get_messages() {
        let db = setup_db();
        let sid = create_session(&db, "test-user", "Test", "amiga", "es").unwrap();
        let mid = save_message(&db, &sid, "user", "你好").unwrap();
        assert!(mid > 0);

        let msgs = get_messages(&db, &sid, 10).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].content, "你好");

        let sessions = get_sessions(&db, "es").unwrap();
        assert_eq!(sessions[0].message_count, 1);
        assert_eq!(sessions[0].last_message, "你好");
    }

    #[test]
    fn test_message_limit() {
        let db = setup_db();
        let sid = create_session(&db, "test-user", "Test", "amiga", "es").unwrap();
        for i in 0..5 {
            save_message(&db, &sid, "user", &format!("msg {}", i)).unwrap();
        }
        let msgs = get_messages(&db, &sid, 3).unwrap();
        assert_eq!(msgs.len(), 3);
        assert_eq!(msgs[0].content, "msg 2");
    }

    #[test]
    fn test_delete_session() {
        let db = setup_db();
        let sid = create_session(&db, "test-user", "Del", "amiga", "es").unwrap();
        save_message(&db, &sid, "user", "test").unwrap();
        delete_session(&db, &sid).unwrap();
        let sessions = get_sessions(&db, "es").unwrap();
        assert_eq!(sessions.len(), 0);
    }

    #[test]
    fn test_update_title() {
        let db = setup_db();
        let sid = create_session(&db, "test-user", "Old", "amiga", "es").unwrap();
        update_session_title(&db, &sid, "New Title").unwrap();
        let sessions = get_sessions(&db, "es").unwrap();
        assert_eq!(sessions[0].title, "New Title");
    }

    #[test]
    fn test_profile_update() {
        let db = setup_db();
        let sid = create_session(&db, "test-user", "Profile", "amiga", "es").unwrap();
        let profile = r#"{"cefr_level":"A1","vocab":["hola"]}"#;
        update_profile(&db, &sid, profile, "简单对话").unwrap();
        let (p, s, _, _) = get_session_profile(&db, &sid).unwrap();
        assert_eq!(p, profile);
        assert_eq!(s, "简单对话");
    }

    #[test]
    fn test_get_session_profile_defaults() {
        let db = setup_db();
        let result = get_session_profile(&db, "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_contact_type_translator() {
        let db = setup_db();
        let _sid = create_session(&db, "test-user", "翻译", "translator", "es").unwrap();
        let sessions = get_sessions(&db, "es").unwrap();
        assert_eq!(sessions[0].contact_type, "translator");
    }

    #[test]
    fn test_sessions_isolated_by_target_language() {
        let db = setup_db();
        let _es_amiga = create_session(&db, "test-user", "ES Amiga", "amiga", "es").unwrap();
        let en_amiga = create_session(&db, "test-user", "EN Amiga", "amiga", "en").unwrap();
        let _en_translator =
            create_session(&db, "test-user", "EN Translator", "translator", "en").unwrap();

        let es_sessions = get_sessions(&db, "es").unwrap();
        assert_eq!(es_sessions.len(), 1);
        assert_eq!(es_sessions[0].title, "ES Amiga");
        assert_eq!(es_sessions[0].target_language, "es");

        let en_sessions = get_sessions(&db, "en").unwrap();
        assert_eq!(en_sessions.len(), 2);
        for s in &en_sessions {
            assert_eq!(s.target_language, "en");
        }
        let en_amiga_session = en_sessions
            .iter()
            .find(|s| s.contact_type == "amiga")
            .unwrap();
        assert_eq!(en_amiga_session.id, en_amiga);

        let zh_sessions = get_sessions(&db, "zh").unwrap();
        assert_eq!(zh_sessions.len(), 0);
    }

    #[test]
    fn test_save_message_long_unicode() {
        let db = setup_db();
        let sid = create_session(&db, "test-user", "unicode", "amiga", "es").unwrap();
        // More than 60 bytes of Chinese (each char is 3 bytes)
        let long = "中文翻译：什么？/ 怎么了？\n英文翻译：How? /haʊ/\n\n关键难点解释：\n1. 多重含义：cómo 是西语中最常用的词之一";
        let mid = save_message(&db, &sid, "assistant", long).unwrap();
        assert!(mid > 0);

        let sessions = get_sessions(&db, "es").unwrap();
        // Preview should be truncated to 60 chars (not bytes), safely
        assert!(sessions[0].last_message.len() <= 60 * 3); // at most 60 chars * 3 bytes
        assert!(!sessions[0].last_message.contains("��")); // no replacement chars
        assert!(sessions[0].last_message.starts_with("中文翻译"));
    }
}
