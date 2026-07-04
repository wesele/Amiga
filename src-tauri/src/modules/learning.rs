use crate::modules::database::DatabasePool;
use crate::modules::llm::{lang_name, LlmClient};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedSentence {
    pub id: i32,
    pub user_id: String,
    pub article_id: Option<i32>,
    pub original_text: String,
    pub translation: String,
    pub source: Option<String>,
    pub target_lang: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveSentenceRequest {
    pub user_id: String,
    pub article_id: Option<i32>,
    pub original_text: String,
    pub translation: String,
    pub source: Option<String>,
    pub target_lang: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuizQuestion {
    pub question: String,
    pub options: Vec<String>,
    pub answer_index: usize,
    pub explanation: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArticleQuiz {
    pub questions: Vec<QuizQuestion>,
    pub from_cache: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScoreRequest {
    pub user_id: String,
    pub mode: String,
    pub target_lang: String,
    pub native_lang: String,
    pub scenario: String,
    pub input_text: String,
    pub reference_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScoreResult {
    pub mode: String,
    pub total_score: i32,
    pub scores: serde_json::Value,
    pub summary: String,
    pub improved_version: String,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LearningProfile {
    pub user_id: String,
    pub cefr_level: String,
    pub target_lang: String,
    pub native_lang: String,
    pub articles_read: i32,
    pub vocab_seen: i32,
    pub vocab_mastered: i32,
    pub weak_skills: Vec<String>,
    pub interests: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiCallLogRequest {
    pub user_id: Option<String>,
    pub feature_name: String,
    pub model: Option<String>,
    pub duration_ms: i64,
    pub failed: bool,
    pub feedback_type: Option<String>,
    pub input_text: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModerationResult {
    pub allowed: bool,
    pub category: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportedArticleRequest {
    pub title: String,
    pub body: String,
    pub source: Option<String>,
    pub target_lang: String,
}

pub fn save_sentence(
    db: &DatabasePool,
    request: &SaveSentenceRequest,
) -> Result<SavedSentence, String> {
    let original = request.original_text.trim();
    if original.is_empty() {
        return Err("收藏句不能为空".to_string());
    }
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO saved_sentences
         (user_id, article_id, original_text, translation, source, target_lang)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(user_id, article_id, original_text, target_lang)
         DO UPDATE SET translation = excluded.translation, source = excluded.source",
        params![
            request.user_id,
            request.article_id,
            original,
            request.translation.trim(),
            request.source,
            request.target_lang,
        ],
    )
    .map_err(|e| format!("Failed to save sentence: {e}"))?;

    let id = conn
        .query_row(
            "SELECT id FROM saved_sentences
             WHERE user_id = ?1
               AND COALESCE(article_id, -1) = COALESCE(?2, -1)
               AND original_text = ?3
               AND target_lang = ?4
             ORDER BY id DESC LIMIT 1",
            params![
                request.user_id,
                request.article_id,
                original,
                request.target_lang
            ],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to reload saved sentence: {e}"))?;
    drop(conn);
    get_saved_sentence(db, id)
}

fn get_saved_sentence(db: &DatabasePool, id: i32) -> Result<SavedSentence, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, user_id, article_id, original_text, translation, source, target_lang, created_at
         FROM saved_sentences WHERE id = ?1",
        params![id],
        row_to_saved_sentence,
    )
    .map_err(|e| format!("Failed to get saved sentence: {e}"))
}

pub fn list_saved_sentences(
    db: &DatabasePool,
    user_id: &str,
    article_id: Option<i32>,
) -> Result<Vec<SavedSentence>, String> {
    let conn = db.conn()?;
    let sql = if article_id.is_some() {
        "SELECT id, user_id, article_id, original_text, translation, source, target_lang, created_at
         FROM saved_sentences WHERE user_id = ?1 AND article_id = ?2 ORDER BY created_at DESC"
    } else {
        "SELECT id, user_id, article_id, original_text, translation, source, target_lang, created_at
         FROM saved_sentences WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 50"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = if let Some(article_id) = article_id {
        stmt.query_map(params![user_id, article_id], row_to_saved_sentence)
    } else {
        stmt.query_map(params![user_id], row_to_saved_sentence)
    }
    .map_err(|e| format!("Failed to list saved sentences: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read saved sentence: {e}"))
}

fn row_to_saved_sentence(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedSentence> {
    Ok(SavedSentence {
        id: row.get(0)?,
        user_id: row.get(1)?,
        article_id: row.get(2)?,
        original_text: row.get(3)?,
        translation: row.get(4)?,
        source: row.get(5)?,
        target_lang: row.get(6)?,
        created_at: row.get(7)?,
    })
}

pub async fn get_or_generate_article_quiz(
    client: &LlmClient,
    db: &DatabasePool,
    article_id: i32,
    target_lang: &str,
    native_lang: &str,
) -> Result<ArticleQuiz, String> {
    if let Some(cached) = load_quiz_cache(db, article_id, target_lang, native_lang)? {
        return Ok(ArticleQuiz {
            questions: cached,
            from_cache: true,
        });
    }

    let conn = db.conn()?;
    let (title, body): (String, String) = conn
        .query_row(
            "SELECT original_title, COALESCE(rewritten_body, original_body, '')
             FROM news_articles WHERE id = ?1",
            params![article_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Failed to load article for quiz: {e}"))?;
    drop(conn);

    let prompt = format!(
        "Create exactly 3 reading-comprehension questions about this {target} article. \
         Explain answers in {native}. Return strict JSON array only. Each item: \
         {{\"question\":\"...\",\"options\":[\"A\",\"B\",\"C\"],\"answer_index\":0,\"explanation\":\"...\"}}.\n\
         Title: {title}\nArticle:\n{body}",
        target = lang_name(target_lang),
        native = lang_name(native_lang),
    );
    let started = Instant::now();
    let response = client
        .chat(
            db,
            vec![
                super::llm::ChatMessage {
                    role: "system".to_string(),
                    content:
                        "You write concise language-learning reading quizzes. Output only JSON."
                            .to_string(),
                },
                super::llm::ChatMessage {
                    role: "user".to_string(),
                    content: prompt,
                },
            ],
        )
        .await;
    let duration = started.elapsed().as_millis() as i64;
    match response {
        Ok(raw) => {
            let questions = parse_quiz_questions(&raw)?;
            save_quiz_cache(db, article_id, target_lang, native_lang, &questions)?;
            log_ai_call(
                db,
                &AiCallLogRequest {
                    user_id: None,
                    feature_name: "article_quiz".to_string(),
                    model: None,
                    duration_ms: duration,
                    failed: false,
                    feedback_type: Some("generated".to_string()),
                    input_text: Some(format!("{title}\n{body}")),
                    error_message: None,
                },
            )?;
            Ok(ArticleQuiz {
                questions,
                from_cache: false,
            })
        }
        Err(err) => {
            let _ = log_ai_call(
                db,
                &AiCallLogRequest {
                    user_id: None,
                    feature_name: "article_quiz".to_string(),
                    model: None,
                    duration_ms: duration,
                    failed: true,
                    feedback_type: Some("error".to_string()),
                    input_text: Some(format!("{title}\n{body}")),
                    error_message: Some(err.clone()),
                },
            );
            Err(err)
        }
    }
}

fn load_quiz_cache(
    db: &DatabasePool,
    article_id: i32,
    target_lang: &str,
    native_lang: &str,
) -> Result<Option<Vec<QuizQuestion>>, String> {
    let conn = db.conn()?;
    let raw: Option<String> = conn
        .query_row(
            "SELECT quiz_json FROM article_quiz_cache
             WHERE article_id = ?1 AND target_lang = ?2 AND native_lang = ?3",
            params![article_id, target_lang, native_lang],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Failed to read quiz cache: {e}"))?;
    raw.map(|s| serde_json::from_str(&s).map_err(|e| format!("Invalid quiz cache: {e}")))
        .transpose()
}

fn save_quiz_cache(
    db: &DatabasePool,
    article_id: i32,
    target_lang: &str,
    native_lang: &str,
    questions: &[QuizQuestion],
) -> Result<(), String> {
    let conn = db.conn()?;
    let json = serde_json::to_string(questions).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO article_quiz_cache (article_id, target_lang, native_lang, quiz_json)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(article_id, target_lang, native_lang)
         DO UPDATE SET quiz_json = excluded.quiz_json",
        params![article_id, target_lang, native_lang, json],
    )
    .map_err(|e| format!("Failed to save quiz cache: {e}"))?;
    Ok(())
}

fn parse_quiz_questions(raw: &str) -> Result<Vec<QuizQuestion>, String> {
    let cleaned = clean_json(raw);
    let questions: Vec<QuizQuestion> =
        serde_json::from_str(&cleaned).map_err(|e| format!("Quiz response format error: {e}"))?;
    if questions.len() != 3 {
        return Err("Quiz must contain exactly 3 questions".to_string());
    }
    Ok(questions)
}

pub async fn score_expression(
    client: &LlmClient,
    db: &DatabasePool,
    request: &ScoreRequest,
) -> Result<ScoreResult, String> {
    validate_score_request(request)?;
    let mode_hint = match request.mode.as_str() {
        "speaking" => "fluency, accuracy, and naturalness",
        "retell" => "content coverage, language accuracy, and naturalness",
        _ => "accuracy, naturalness, and expression richness",
    };
    let prompt = format!(
        "Assess this learner response in {target}. Scenario: {scenario}. \
         Score {mode_hint}. Return strict JSON: \
         {{\"total_score\":80,\"scores\":{{\"accuracy\":80}},\"summary\":\"...\",\
         \"improved_version\":\"...\",\"suggestions\":[\"...\"]}}. Be encouraging and specific. \
         Reference text if any: {reference}\nLearner text:\n{text}",
        target = lang_name(&request.target_lang),
        scenario = request.scenario,
        reference = request.reference_text.clone().unwrap_or_default(),
        text = request.input_text,
    );
    let started = Instant::now();
    let response = client
        .chat(
            db,
            vec![
                super::llm::ChatMessage {
                    role: "system".to_string(),
                    content: "You are a supportive language-learning assessor. Output only JSON."
                        .to_string(),
                },
                super::llm::ChatMessage {
                    role: "user".to_string(),
                    content: prompt,
                },
            ],
        )
        .await;
    let duration = started.elapsed().as_millis() as i64;
    match response {
        Ok(raw) => {
            let mut result: ScoreResult = serde_json::from_str(&clean_json(&raw))
                .map_err(|e| format!("Score response format error: {e}"))?;
            result.mode = request.mode.clone();
            save_score_result(db, request, &result)?;
            log_ai_call(
                db,
                &AiCallLogRequest {
                    user_id: Some(request.user_id.clone()),
                    feature_name: format!("expression_{}", request.mode),
                    model: None,
                    duration_ms: duration,
                    failed: false,
                    feedback_type: Some("score".to_string()),
                    input_text: Some(request.input_text.clone()),
                    error_message: None,
                },
            )?;
            Ok(result)
        }
        Err(err) => {
            let _ = log_ai_call(
                db,
                &AiCallLogRequest {
                    user_id: Some(request.user_id.clone()),
                    feature_name: format!("expression_{}", request.mode),
                    model: None,
                    duration_ms: duration,
                    failed: true,
                    feedback_type: Some("error".to_string()),
                    input_text: Some(request.input_text.clone()),
                    error_message: Some(err.clone()),
                },
            );
            Err(err)
        }
    }
}

fn validate_score_request(request: &ScoreRequest) -> Result<(), String> {
    let len = request.input_text.trim().chars().count();
    if len == 0 {
        return Err("请输入要评分的内容".to_string());
    }
    if len > 1200 {
        return Err("内容过长，请控制在 1200 字以内".to_string());
    }
    if !matches!(request.mode.as_str(), "writing" | "speaking" | "retell") {
        return Err("Unsupported scoring mode".to_string());
    }
    Ok(())
}

fn save_score_result(
    db: &DatabasePool,
    request: &ScoreRequest,
    result: &ScoreResult,
) -> Result<(), String> {
    let conn = db.conn()?;
    let result_json = serde_json::to_string(result).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO expression_scores
         (user_id, mode, target_lang, native_lang, scenario, input_text, reference_text, result_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            request.user_id,
            request.mode,
            request.target_lang,
            request.native_lang,
            request.scenario,
            request.input_text,
            request.reference_text.clone().unwrap_or_default(),
            result_json,
        ],
    )
    .map_err(|e| format!("Failed to save score: {e}"))?;
    Ok(())
}

pub fn get_learning_profile(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
) -> Result<LearningProfile, String> {
    let conn = db.conn()?;
    let native_lang: String = conn
        .query_row(
            "SELECT native_language FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "zh".to_string());
    let cefr_level: String = conn
        .query_row(
            "SELECT cefr_level FROM learning_goals
             WHERE user_id = ?1 AND target_language = ?2
             ORDER BY id DESC LIMIT 1",
            params![user_id, target_lang],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "A1".to_string());
    let articles_read: i32 = conn
        .query_row(
            "SELECT COUNT(DISTINCT article_id) FROM news_reading_log
             WHERE user_id = ?1 AND completed = 1",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let (vocab_seen, vocab_mastered): (i32, i32) = conn
        .query_row(
            "SELECT
                SUM(CASE WHEN uv.mastery >= 1 THEN 1 ELSE 0 END),
                SUM(CASE WHEN uv.mastery >= 2 THEN 1 ELSE 0 END)
             FROM user_vocab uv
             JOIN vocab_bank vb ON vb.id = uv.word_id
             WHERE uv.user_id = ?1 AND vb.language = ?2",
            params![user_id, target_lang],
            |row| {
                Ok((
                    row.get::<_, Option<i32>>(0)?.unwrap_or(0),
                    row.get::<_, Option<i32>>(1)?.unwrap_or(0),
                ))
            },
        )
        .unwrap_or((0, 0));
    let mut weak_skills = Vec::new();
    if vocab_seen < 20 {
        weak_skills.push("词汇积累".to_string());
    }
    if articles_read < 3 {
        weak_skills.push("真实阅读".to_string());
    }
    if weak_skills.is_empty() {
        weak_skills.push("表达输出".to_string());
    }
    Ok(LearningProfile {
        user_id: user_id.to_string(),
        cefr_level,
        target_lang: target_lang.to_string(),
        native_lang,
        articles_read,
        vocab_seen,
        vocab_mastered,
        weak_skills,
        interests: vec!["news".to_string()],
    })
}

pub fn log_ai_call(db: &DatabasePool, request: &AiCallLogRequest) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO ai_call_logs
         (user_id, feature_name, model, duration_ms, failed, feedback_type, input_hash, error_message)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            request.user_id,
            request.feature_name,
            request.model.clone().unwrap_or_default(),
            request.duration_ms,
            if request.failed { 1 } else { 0 },
            request.feedback_type.clone().unwrap_or_default(),
            request.input_text.as_deref().map(hash_text).unwrap_or_default(),
            request.error_message.clone().unwrap_or_default(),
        ],
    )
    .map_err(|e| format!("Failed to log AI call: {e}"))?;
    Ok(())
}

pub fn clear_ai_call_logs(db: &DatabasePool, user_id: Option<&str>) -> Result<(), String> {
    let conn = db.conn()?;
    if let Some(user_id) = user_id {
        conn.execute(
            "DELETE FROM ai_call_logs WHERE user_id = ?1",
            params![user_id],
        )
    } else {
        conn.execute("DELETE FROM ai_call_logs", [])
    }
    .map_err(|e| format!("Failed to clear AI call logs: {e}"))?;
    Ok(())
}

pub fn moderate_content(
    db: &DatabasePool,
    user_id: Option<&str>,
    feature_name: &str,
    text: &str,
    target_type: &str,
    target_id: &str,
) -> Result<ModerationResult, String> {
    let lower = text.to_lowercase();
    let blocked = [
        "自杀",
        "杀人",
        "恐怖袭击",
        "炸弹",
        "bomb",
        "porn",
        "terror",
        "suicide",
        "kill",
    ];
    let hit = blocked.iter().find(|word| lower.contains(**word));
    let result = if let Some(word) = hit {
        ModerationResult {
            allowed: false,
            category: (*word).to_string(),
            message: "内容可能不适合公开分享，请调整后再试。".to_string(),
        }
    } else {
        ModerationResult {
            allowed: true,
            category: "safe".to_string(),
            message: "内容检查通过".to_string(),
        }
    };
    let conn = db.conn()?;
    let result_json = serde_json::to_string(&result).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO moderation_results
         (user_id, feature_name, target_type, target_id, result_json)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![user_id, feature_name, target_type, target_id, result_json],
    )
    .map_err(|e| format!("Failed to save moderation result: {e}"))?;
    Ok(result)
}

pub fn import_clipboard_article(
    db: &DatabasePool,
    request: &ImportedArticleRequest,
) -> Result<i32, String> {
    let body = request.body.trim();
    if body.is_empty() {
        return Err("剪贴板没有可导入的文本".to_string());
    }
    if body.chars().count() > 6000 {
        return Err("导入文本过长，请先截取关键段落".to_string());
    }
    let title = if request.title.trim().is_empty() {
        body.lines()
            .next()
            .unwrap_or("Imported text")
            .chars()
            .take(60)
            .collect()
    } else {
        request.title.trim().to_string()
    };
    let source = request
        .source
        .clone()
        .unwrap_or_else(|| "clipboard".to_string());
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO news_articles
         (original_title, original_body, source, region, hot_rank, target_lang, is_current)
         VALUES (?1, ?2, ?3, 'clipboard', 0, ?4, 1)",
        params![title, body, source, request.target_lang],
    )
    .map_err(|e| format!("Failed to import article: {e}"))?;
    Ok(conn.last_insert_rowid() as i32)
}

fn hash_text(text: &str) -> String {
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn clean_json(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_sentence_deduplicates_per_article_text() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, target_lang) VALUES ('T', 'B', 'es')",
            [],
        )
        .unwrap();
        let article_id = conn.last_insert_rowid() as i32;
        drop(conn);

        let req = SaveSentenceRequest {
            user_id: "u1".to_string(),
            article_id: Some(article_id),
            original_text: "Hola mundo.".to_string(),
            translation: "你好，世界。".to_string(),
            source: Some("sample".to_string()),
            target_lang: "es".to_string(),
        };
        let first = save_sentence(&db, &req).unwrap();
        let second = save_sentence(&db, &req).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(
            list_saved_sentences(&db, "u1", Some(article_id))
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn moderation_blocks_obvious_sensitive_text() {
        let db = DatabasePool::new_in_memory();
        let result = moderate_content(&db, Some("u1"), "share", "bomb plan", "card", "1").unwrap();
        assert!(!result.allowed);
    }

    #[test]
    fn profile_returns_defaults_for_new_user() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        drop(conn);
        let profile = get_learning_profile(&db, "u1", "es").unwrap();
        assert_eq!(profile.cefr_level, "A1");
        assert_eq!(profile.articles_read, 0);
    }

    #[test]
    fn import_clipboard_article_works() {
        let db = DatabasePool::new_in_memory();
        let req = ImportedArticleRequest {
            title: "Test Title".to_string(),
            body: "Test body content".to_string(),
            source: Some("test-source".to_string()),
            target_lang: "es".to_string(),
        };
        let id = import_clipboard_article(&db, &req).unwrap();
        assert!(id > 0);
    }

    #[test]
    fn log_ai_call_and_clear_works() {
        let db = DatabasePool::new_in_memory();
        let req = AiCallLogRequest {
            user_id: Some("u1".to_string()),
            feature_name: "test_feat".to_string(),
            model: None,
            duration_ms: 100,
            failed: false,
            feedback_type: None,
            input_text: Some("test".to_string()),
            error_message: None,
        };
        log_ai_call(&db, &req).unwrap();
        
        let conn = db.conn().unwrap();
        let count: i32 = conn.query_row("SELECT COUNT(*) FROM ai_call_logs", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
        drop(conn);
        
        clear_ai_call_logs(&db, Some("u1")).unwrap();
        let conn_after = db.conn().unwrap();
        let count_after: i32 = conn_after.query_row("SELECT COUNT(*) FROM ai_call_logs", [], |r| r.get(0)).unwrap();
        assert_eq!(count_after, 0);
    }
}
