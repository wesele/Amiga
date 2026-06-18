use rusqlite::params;
use serde::{Deserialize, Serialize};
use log;
use crate::modules::database::DatabasePool;

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
        "你是专业的语言学习改写助手，只返回JSON格式。",
        r#"请将以下西班牙语新闻改写成适合 CEFR {{CEFR_LEVEL}} 级别学习者阅读的版本。

要求：
1. 忠实原文 — 新闻事实、人名、地名、数字、日期不得改动
2. 用词限制 — 全文尽量使用 {{CEFR_LEVEL}} 级及以下级别的单词
3. 超纲词 — 最多允许5个超级别单词，超纲词用 **加粗** 标记
4. 可选植入词 — {{NEW_WORDS}} 选自然植入，同样需加粗

返回 JSON：{"rewritten": "改写后的全文", "new_words_used": ["实际植入的词"]}

标题：{{TITLE}}
正文：{{TEXT}}"#,
    ),
    (
        "translate-word",
        "单词翻译",
        "学习功能",
        "你是专业的西班牙语翻译助手。给出准确的翻译和音标信息。只返回JSON格式。",
        r#"翻译以下西班牙语单词，基于给定上下文：
单词: {{WORD}}
上下文: {{CONTEXT}}
目标翻译语言: {{TARGET_LANG}}
返回严格的 JSON 格式：{"translation_zh": "中文翻译", "translation_es": "西语释义", "ipa": "IPA音标", "pos": "词性(名词/动词/形容词等)", "example": "一个简单例句"}"#,
    ),
    (
        "translate-paragraphs",
        "段落翻译",
        "学习功能",
        "你是专业翻译，只返回 JSON 数组格式。",
        r#"请将以下西班牙语段落逐段翻译为{{TARGET_LANG}}。每段独立翻译，保持原文段落结构。

段落列表：
{{PARAGRAPHS}}

返回严格的 JSON 数组格式，每个元素对应一段的翻译。例如：["第一段翻译", "第二段翻译"]
不要添加任何额外文字或解释。"#,
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
        r#"你叫 Amiga，是一位 AI 语言学习伙伴。你的性格：友善、耐心、鼓励、幽默。

用户的目标语言: {{TARGET_LANG}}
用户的母语: {{NATIVE_LANG}}

对话规则：
1. 用用户的母语交流，但在回复的消息末尾，附上 1-2 句目标语言的例句或练习
2. 如果用户用目标语言发消息，先肯定和鼓励，再纠正明显错误（不要过度纠正）
3. 保持对话自然流畅，像朋友一样聊天
4. 可以主动出简单的小题目帮助练习
5. 适当使用 emoji 让对话更生动，但不要过多
6. 如果是语言相关的问题，给出清晰简洁的解释
7. 你的名字是 Amiga，每次自我介绍或被人称呼时要保持这个名字"#,
        "",
    ),
    (
        "translator-chat",
        "AI 翻译助手",
        "AI对话",
        r#"你是一个智能翻译助手。对输入的内容进行翻译解释：

- 如果是西语单词：标注读音（IPA），翻译成中文，和英文（标注美式读音IPA），并提供常见用法例句以及这个西语单词的相近词和相反词
- 如果是西语句子：翻译成中文和英文，并解释关键难点（语法、时态、特殊用法）
- 如果是中文：提供西语翻译以及相近词和相反词，和英文翻译（不需要相近相反词，标注美式读音IPA）
- 如果是英文：标注美式读音IPA，提供中文和西语翻译

输出尽量简洁，用短句和列表。"#,
        "",
    ),
    (
        "profile-analysis",
        "用户画像分析",
        "系统功能",
        "你严格只输出JSON，不包含markdown代码块标记。",
        r#"你是一位语言学习评估专家。基于以下用户与AI助手的对话，分析用户对{{TARGET_LANG}}的学习情况。

请输出JSON格式（不要任何额外文字）：
{
  "cefr_level": "估计的CEFR等级 A1/A2/B1/B2",
  "strengths": ["已掌握的优势列表"],
  "weaknesses": ["需要加强的薄弱环节"],
  "known_topics": ["已讨论过的话题"],
  "new_vocab_used": ["用户新使用或接触的词汇"],
  "summary": "一段简洁的中文总结，概括这轮对话的核心内容和用户表现（50字以内）"
}

对话内容：
{{CONVERSATION}}"#,
    ),
];

/// Ensure default prompts are up-to-date (upserts on every startup)
pub fn ensure_default_prompts(db: &DatabasePool) {
    let conn = match db.conn.lock() {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to lock DB for ensure_default_prompts: {}", e);
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
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT key, name, category, system_prompt, user_prompt_template, updated_at
         FROM prompts ORDER BY category, key"
    ).map_err(|e| format!("Query error: {}", e))?;

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
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

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
    ).map_err(|e| format!("Prompt '{}' not found: {}", key, e))
}

pub fn save_prompt(
    db: &DatabasePool,
    key: &str,
    name: &str,
    category: &str,
    system_prompt: &str,
    user_prompt_template: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

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
    let default = DEFAULTS.iter().find(|(k, _, _, _, _)| *k == key)
        .ok_or_else(|| format!("No default defined for prompt '{}'", key))?;

    save_prompt(db, default.0, default.1, default.2, default.3, default.4)?;
    get_prompt(db, key)
}

pub fn reset_all_prompts(db: &DatabasePool) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

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
        assert_eq!(p.system_prompt, "你是专业的语言学习改写助手，只返回JSON格式。", "Should revert to default system prompt");
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
        save_prompt(&pool, "rewrite-article", "改过的", "x", "changed", "changed").unwrap();
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
