use crate::modules::database::DatabasePool;
use log;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Prompt {
    pub key: String,
    pub name: String,
    pub category: String,
    pub system_prompt: String,
    pub user_prompt_template: String,
    pub updated_at: Option<String>,
}

/// Default prompt definitions (key → (name, category, system_prompt, user_prompt_template))
const DEFAULTS: &[(&str, &str, &str, &str, &str)] = &[
    (
        "rewrite-article",
        "新闻文章改写",
        "学习功能",
        "You are a language-learning rewrite assistant. Output only JSON, no extra prose.",
        r#"Rewrite the following {{SOURCE_LANG}} news article for a CEFR {{CEFR_LEVEL}} language learner.

Requirements:
1. Stay faithful — keep all facts, names, places, numbers, and dates intact
2. Word level — prefer vocabulary at CEFR {{CEFR_LEVEL}} or below
3. Optional words — naturally weave in: {{NEW_WORDS}}

Return JSON: {"rewritten": "the rewritten article", "new_words_used": ["words actually used"]}

Title: {{TITLE}}
Body: {{TEXT}}"#,
    ),
    (
        "translate-word",
        "单词翻译",
        "学习功能",
        "You are a precise dictionary assistant. Output only the requested JSON, no extra prose.",
        r#"Translate the following {{SOURCE_LANG}} word, given its context. Output a translation in {{TARGET_LANG}}.

Word: {{WORD}}
Context: {{CONTEXT}}

Return a strict JSON object:
{"translation": "<translation in {{TARGET_LANG}}>", "ipa": "IPA pronunciation", "pos": "part of speech (noun/verb/adjective/etc.)", "example": "one simple example sentence in {{SOURCE_LANG}}"}"#,
    ),
    (
        "translate-paragraphs",
        "段落翻译",
        "学习功能",
        "You are a professional translator. Output only JSON.",
        r#"Translate the following {{SOURCE_LANG}} paragraphs into {{TARGET_LANG}}, one translation per paragraph, preserving order.

Paragraphs:
{{PARAGRAPHS}}

Return a strict JSON array where each element is the translation of the corresponding paragraph, e.g. ["first translation", "second translation"]. No extra prose."#,
    ),
    (
        "question-gen",
        "题目生成",
        "内容生产",
        "你是语言学习题目生成专家。严格遵循用户指定的题型和格式。",
        r#"为以下语言学习单元生成{{QUESTION_COUNT}}道{{QUESTION_TYPE}}类型的练习题。

目标语言: {{TARGET_LANG}}
CEFR级别: {{CEFR_LEVEL}}
主题: {{TOPIC}}
词汇范围: {{VOCAB_RANGE}}

返回严格的 JSON 数组格式。"#,
    ),
    (
        "amiga-chat",
        "Amiga AI 语言伙伴",
        "AI对话",
        r#"You are Amiga, an AI language-learning buddy. Your personality: friendly, patient, encouraging.

User's target language: {{TARGET_LANG}}
User's native language: {{NATIVE_LANG}}

Conversation rules:
1. Be concise — answer in 1-3 short sentences for casual chat; only go longer when the user asks for a detailed explanation
2. Chat in the user's native language by default; weave in {{TARGET_LANG}} only when the user is practicing or explicitly asks for examples
3. If the user writes in {{TARGET_LANG}}, affirm briefly, then gently correct only obvious errors (do not over-correct)
4. Do not give unsolicited lectures, step-by-step study plans, or practice drills unless the user asks
5. Skip filler phrases, repetition, and motivational padding — get to the point
6. Use at most one emoji per reply, only when it fits naturally
7. Your name is Amiga — use it only when introducing yourself or when addressed by name"#,
        "",
    ),
    (
        "translator-chat",
        "AI 翻译助手",
        "AI对话",
        r#"对输入的内容进行翻译解释。输入如果是西语单词，标注读音，翻译成中文，和英文（标注美式读音），并提供常见用法例句以及这个西语单词的相近相反的词。如果是西语句子，翻译成中英文，并解释关键难点。如果是中文，提供西语以及相近相反的词，和英文翻译（不需要相近相反的词，标注美式读音）。如果是英文，标注美式读音，提供中文和西语翻译。输出尽量简洁。"#,
        "",
    ),
    (
        "profile-analysis",
        "用户画像分析",
        "系统功能",
        "You output only JSON, no markdown code fences.",
        r#"You are a language-learning assessment expert. Based on the conversation below between the user and an AI assistant, analyze the user's progress learning {{TARGET_LANG}}.

Output a JSON object (no extra prose):
{
  "cefr_level": "estimated CEFR level A1/A2/B1/B2",
  "strengths": ["list of strengths"],
  "weaknesses": ["list of weak spots to work on"],
  "known_topics": ["topics already discussed"],
  "new_vocab_used": ["words the user newly used or encountered"],
  "summary": "a concise one-sentence summary in {{NATIVE_LANG}} (50 words or less) describing the core content of this exchange and the user's performance"
}

Conversation:
{{CONVERSATION}}"#,
    ),
];

/// Ensure default prompts are up-to-date (upserts on every startup)
pub fn ensure_default_prompts(db: &DatabasePool) {
    let conn = match db.conn() {
        Ok(c) => c,
        Err(e) => {
            log::error!(
                "Failed to get DB connection for ensure_default_prompts: {}",
                e
            );
            return;
        }
    };

    // Upsert each default so code changes take effect even if DB already has data
    for (key, name, category, system_prompt, user_prompt_template) in DEFAULTS {
        if let Err(e) = conn.execute(
            "INSERT INTO prompts (key, name, category, system_prompt, user_prompt_template, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET
             name = ?2, category = ?3, system_prompt = ?4, user_prompt_template = ?5, updated_at = datetime('now')",
            params![key, name, category, system_prompt, user_prompt_template],
        ) {
            log::error!("Failed to upsert default prompt '{}': {}", key, e);
        }
    }

    log::info!("Upserted {} default prompts", DEFAULTS.len());
}

pub fn get_all_prompts(db: &DatabasePool) -> Result<Vec<Prompt>, String> {
    let conn = db.conn()?;

    let mut stmt = conn
        .prepare(
            "SELECT key, name, category, system_prompt, user_prompt_template, updated_at
         FROM prompts ORDER BY category, key",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let prompts: Vec<Prompt> = stmt
        .query_map([], |row| {
            Ok(Prompt {
                key: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                system_prompt: row.get(3)?,
                user_prompt_template: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query prompts: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(prompts)
}

pub fn get_prompt(db: &DatabasePool, key: &str) -> Result<Prompt, String> {
    let conn = db.conn()?;

    conn.query_row(
        "SELECT key, name, category, system_prompt, user_prompt_template, updated_at
         FROM prompts WHERE key = ?1",
        params![key],
        |row| {
            Ok(Prompt {
                key: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                system_prompt: row.get(3)?,
                user_prompt_template: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
    .map_err(|e| format!("Prompt '{}' not found: {}", key, e))
}

pub fn save_prompt(
    db: &DatabasePool,
    key: &str,
    name: &str,
    category: &str,
    system_prompt: &str,
    user_prompt_template: &str,
) -> Result<(), String> {
    let conn = db.conn()?;

    conn.execute(
        "INSERT INTO prompts (key, name, category, system_prompt, user_prompt_template, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET
         name = ?2, category = ?3, system_prompt = ?4, user_prompt_template = ?5, updated_at = datetime('now')",
        params![key, name, category, system_prompt, user_prompt_template],
    ).map_err(|e| format!("Failed to save prompt: {}", e))?;

    log::info!("Prompt '{}' saved", key);
    Ok(())
}

pub fn reset_prompt_to_default(db: &DatabasePool, key: &str) -> Result<Prompt, String> {
    let default = DEFAULTS
        .iter()
        .find(|(k, _, _, _, _)| *k == key)
        .ok_or_else(|| format!("No default defined for prompt '{}'", key))?;

    save_prompt(db, default.0, default.1, default.2, default.3, default.4)?;
    get_prompt(db, key)
}

pub fn reset_all_prompts(db: &DatabasePool) -> Result<usize, String> {
    let conn = db.conn()?;

    conn.execute("DELETE FROM prompts", [])
        .map_err(|e| format!("Failed to clear prompts: {}", e))?;

    drop(conn);
    ensure_default_prompts(db);
    Ok(DEFAULTS.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    #[test]
    fn test_ensure_default_prompts_inserts_defaults() {
        let pool = test_pool();
        ensure_default_prompts(&pool);
        let prompts = get_all_prompts(&pool).unwrap();
        assert_eq!(prompts.len(), 7, "Should have 7 default prompts");
    }

    #[test]
    fn test_ensure_default_prompts_idempotent() {
        let pool = test_pool();
        ensure_default_prompts(&pool);
        ensure_default_prompts(&pool);
        let prompts = get_all_prompts(&pool).unwrap();
        assert_eq!(prompts.len(), 7, "Second call should not add duplicates");
    }

    #[test]
    fn test_ensure_default_prompts_overwrites_on_restart() {
        let pool = test_pool();
        ensure_default_prompts(&pool);
        // Simulate user editing the prompt
        save_prompt(&pool, "rewrite-article", "旧的", "x", "旧内容", "旧模板").unwrap();
        // Restart: ensure_default_prompts should restore defaults
        ensure_default_prompts(&pool);
        let p = get_prompt(&pool, "rewrite-article").unwrap();
        assert_eq!(p.name, "新闻文章改写", "Should revert to default name");
        assert_eq!(
            p.system_prompt,
            "You are a language-learning rewrite assistant. Output only JSON, no extra prose.",
            "Should revert to default system prompt"
        );
    }

    #[test]
    fn test_get_prompt_by_key() {
        let pool = test_pool();
        ensure_default_prompts(&pool);
        let p = get_prompt(&pool, "rewrite-article").unwrap();
        assert_eq!(p.name, "新闻文章改写");
        assert_eq!(p.category, "学习功能");
    }

    #[test]
    fn test_amiga_chat_prompt_emphasizes_concise_replies() {
        let pool = test_pool();
        ensure_default_prompts(&pool);
        let p = get_prompt(&pool, "amiga-chat").unwrap();
        assert!(
            p.system_prompt.contains("Be concise"),
            "amiga-chat should instruct concise replies"
        );
        assert!(
            !p.system_prompt.contains("append 1-2 example sentences"),
            "amiga-chat should not force examples on every reply"
        );
        assert!(
            !p.system_prompt.contains("Proactively offer"),
            "amiga-chat should not push unsolicited exercises"
        );
    }

    #[test]
    fn test_get_prompt_not_found() {
        let pool = test_pool();
        let result = get_prompt(&pool, "nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_save_and_get_prompt() {
        let pool = test_pool();
        save_prompt(&pool, "test-key", "测试", "test", "系统提示", "用户模板").unwrap();
        let p = get_prompt(&pool, "test-key").unwrap();
        assert_eq!(p.name, "测试");
        assert_eq!(p.system_prompt, "系统提示");
    }

    #[test]
    fn test_save_updates_existing() {
        let pool = test_pool();
        save_prompt(&pool, "k", "A", "cat1", "sys1", "usr1").unwrap();
        save_prompt(&pool, "k", "B", "cat2", "sys2", "usr2").unwrap();
        let p = get_prompt(&pool, "k").unwrap();
        assert_eq!(p.name, "B");
        assert_eq!(p.system_prompt, "sys2");
    }

    #[test]
    fn test_reset_prompt_to_default() {
        let pool = test_pool();
        ensure_default_prompts(&pool);
        save_prompt(
            &pool,
            "rewrite-article",
            "改过的",
            "x",
            "changed",
            "changed",
        )
        .unwrap();
        let p = reset_prompt_to_default(&pool, "rewrite-article").unwrap();
        assert_eq!(p.name, "新闻文章改写");
    }

    #[test]
    fn test_reset_all_prompts() {
        let pool = test_pool();
        ensure_default_prompts(&pool);
        save_prompt(&pool, "extra", "额外", "x", "s", "u").unwrap();
        reset_all_prompts(&pool).unwrap();
        let prompts = get_all_prompts(&pool).unwrap();
        assert_eq!(prompts.len(), 7, "Should restore to exactly 7 defaults");
    }
}
