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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReviewSummary {
    pub due_count: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReviewItem {
    pub id: String,
    pub source_type: String,
    pub source_id: String,
    pub title: String,
    pub prompt: String,
    pub answer: String,
    pub skill_tag: String,
    pub due_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LessonMistakeRequest {
    pub user_id: String,
    pub target_lang: String,
    pub source_id: String,
    pub title: String,
    pub prompt: String,
    pub answer: String,
    pub skill_tag: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SocialProfile {
    pub user_id: String,
    pub native_lang: String,
    pub target_lang: String,
    pub interests: Vec<String>,
    pub timezone: String,
    pub practice_goal: String,
    pub public_enabled: bool,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SocialCandidate {
    pub user_id: String,
    pub native_lang: String,
    pub target_lang: String,
    pub interests: Vec<String>,
    pub timezone: String,
    pub practice_goal: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SocialReport {
    pub id: i32,
    pub reporter_id: String,
    pub target_id: String,
    pub reason: String,
    pub detail: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SentenceRewrite {
    pub id: i32,
    pub original_text: String,
    pub rewritten_text: String,
    pub adopted: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CultureQuestion {
    pub id: i32,
    pub question: String,
    pub ai_answer: String,
    pub saved: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArticleVersion {
    pub article_id: i32,
    pub cefr_level: String,
    pub body: String,
    pub source: String,
    pub from_cache: bool,
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

pub fn get_review_summary(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
) -> Result<ReviewSummary, String> {
    let conn = db.conn()?;
    let item_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM review_items
             WHERE user_id = ?1 AND target_lang = ?2 AND status = 'open' AND due_at <= datetime('now')",
            params![user_id, target_lang],
            |row| row.get(0),
        )
        .unwrap_or(0);
    let vocab_count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_vocab uv
             JOIN vocab_bank vb ON vb.id = uv.word_id
             WHERE uv.user_id = ?1
               AND vb.language = ?2
               AND uv.mastery < 2
               AND COALESCE(uv.next_review, datetime('now')) <= datetime('now')",
            params![user_id, target_lang],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(ReviewSummary {
        due_count: item_count + vocab_count,
    })
}

pub fn list_review_queue(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    limit: i32,
) -> Result<Vec<ReviewItem>, String> {
    let conn = db.conn()?;
    let mut items = Vec::new();
    let cap = limit.clamp(1, 10);

    let mut stmt = conn
        .prepare(
            "SELECT id, source_type, source_id, title, prompt, answer, skill_tag, due_at
             FROM review_items
             WHERE user_id = ?1 AND target_lang = ?2 AND status = 'open'
             ORDER BY due_at ASC, updated_at ASC
             LIMIT ?3",
        )
        .map_err(|e| format!("Failed to prepare review query: {e}"))?;
    let rows = stmt
        .query_map(params![user_id, target_lang, cap], |row| {
            Ok(ReviewItem {
                id: format!("item:{}", row.get::<_, i32>(0)?),
                source_type: row.get(1)?,
                source_id: row.get(2)?,
                title: row.get(3)?,
                prompt: row.get(4)?,
                answer: row.get(5)?,
                skill_tag: row.get(6)?,
                due_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to list review items: {e}"))?;
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }

    if items.len() < cap as usize {
        let remaining = cap - items.len() as i32;
        let mut stmt = conn
            .prepare(
                "SELECT uv.word_id, vb.word, COALESCE(vb.example, ''), COALESCE(uv.next_review, datetime('now'))
                 FROM user_vocab uv
                 JOIN vocab_bank vb ON vb.id = uv.word_id
                 WHERE uv.user_id = ?1
                   AND vb.language = ?2
                   AND uv.mastery < 2
                   AND COALESCE(uv.next_review, datetime('now')) <= datetime('now')
                 ORDER BY COALESCE(uv.next_review, uv.updated_at) ASC
                 LIMIT ?3",
            )
            .map_err(|e| format!("Failed to prepare vocab review query: {e}"))?;
        let rows = stmt
            .query_map(params![user_id, target_lang, remaining], |row| {
                let word_id: i32 = row.get(0)?;
                let word: String = row.get(1)?;
                let example: String = row.get(2)?;
                Ok(ReviewItem {
                    id: format!("vocab:{word_id}"),
                    source_type: "vocab".to_string(),
                    source_id: word_id.to_string(),
                    title: word.clone(),
                    prompt: if example.is_empty() { word } else { example },
                    answer: String::new(),
                    skill_tag: "vocab".to_string(),
                    due_at: row.get(3)?,
                })
            })
            .map_err(|e| format!("Failed to list vocab review items: {e}"))?;
        for row in rows {
            items.push(row.map_err(|e| e.to_string())?);
        }
    }

    Ok(items)
}

pub fn complete_review_item(
    db: &DatabasePool,
    user_id: &str,
    item_id: &str,
    remembered: bool,
) -> Result<(), String> {
    let conn = db.conn()?;
    if let Some(id) = item_id.strip_prefix("item:") {
        let due_modifier = if remembered { "+7 days" } else { "+1 day" };
        conn.execute(
            "UPDATE review_items
             SET status = CASE WHEN ?2 THEN 'done' ELSE 'open' END,
                 due_at = datetime('now', ?3),
                 updated_at = datetime('now')
             WHERE id = ?1 AND user_id = ?4",
            params![id, remembered, due_modifier, user_id],
        )
        .map_err(|e| format!("Failed to update review item: {e}"))?;
        return Ok(());
    }
    if let Some(word_id) = item_id.strip_prefix("vocab:") {
        drop(conn);
        let mastery = if remembered { 2 } else { 1 };
        super::vocabulary::update_word_mastery(
            db,
            user_id,
            word_id.parse::<i32>().map_err(|e| e.to_string())?,
            mastery,
            "review_basket",
        )?;
    }
    Ok(())
}

pub fn record_lesson_mistake(
    db: &DatabasePool,
    request: &LessonMistakeRequest,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO review_items
         (user_id, target_lang, source_type, source_id, title, prompt, answer, skill_tag, due_at)
         VALUES (?1, ?2, 'lesson_mistake', ?3, ?4, ?5, ?6, ?7, datetime('now'))
         ON CONFLICT(user_id, target_lang, source_type, source_id) DO UPDATE SET
           title = excluded.title,
           prompt = excluded.prompt,
           answer = excluded.answer,
           skill_tag = excluded.skill_tag,
           status = 'open',
           due_at = datetime('now'),
           updated_at = datetime('now')",
        params![
            request.user_id,
            request.target_lang,
            request.source_id,
            request.title,
            request.prompt,
            request.answer,
            request.skill_tag,
        ],
    )
    .map_err(|e| format!("Failed to record lesson mistake: {e}"))?;
    Ok(())
}

pub fn should_prompt_assessment(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
) -> Result<bool, String> {
    let conn = db.conn()?;
    let key = format!("assessment.last.{user_id}.{target_lang}");
    let dismissed_key = format!("assessment.dismissed.{user_id}.{target_lang}");
    let due: bool = conn
        .query_row(
            "SELECT COALESCE(datetime(value) <= datetime('now', '-30 days'), 1)
             FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .unwrap_or(true);
    if !due {
        return Ok(false);
    }
    let dismissed: bool = conn
        .query_row(
            "SELECT COALESCE(datetime(value) > datetime('now', '-30 days'), 0)
             FROM app_settings WHERE key = ?1",
            params![dismissed_key],
            |row| row.get(0),
        )
        .unwrap_or(false);
    Ok(!dismissed)
}

pub fn record_assessment_event(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    dismissed: bool,
) -> Result<(), String> {
    let key = if dismissed {
        format!("assessment.dismissed.{user_id}.{target_lang}")
    } else {
        format!("assessment.last.{user_id}.{target_lang}")
    };
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = datetime('now')",
        params![key],
    )
    .map_err(|e| format!("Failed to save assessment state: {e}"))?;
    Ok(())
}

pub fn save_social_profile(
    db: &DatabasePool,
    profile: &SocialProfile,
) -> Result<SocialProfile, String> {
    let conn = db.conn()?;
    let interests = serde_json::to_string(&profile.interests).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO social_profiles
         (user_id, native_lang, target_lang, interests, timezone, practice_goal, public_enabled, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           native_lang = excluded.native_lang,
           target_lang = excluded.target_lang,
           interests = excluded.interests,
           timezone = excluded.timezone,
           practice_goal = excluded.practice_goal,
           public_enabled = excluded.public_enabled,
           updated_at = datetime('now')",
        params![
            profile.user_id,
            profile.native_lang,
            profile.target_lang,
            interests,
            profile.timezone,
            profile.practice_goal,
            if profile.public_enabled { 1 } else { 0 },
        ],
    )
    .map_err(|e| format!("Failed to save social profile: {e}"))?;
    drop(conn);
    get_social_profile(db, &profile.user_id)
}

pub fn get_social_profile(db: &DatabasePool, user_id: &str) -> Result<SocialProfile, String> {
    let conn = db.conn()?;
    let row = conn
        .query_row(
            "SELECT user_id, native_lang, target_lang, interests, timezone, practice_goal, public_enabled, updated_at
             FROM social_profiles WHERE user_id = ?1",
            params![user_id],
            row_to_social_profile,
        )
        .optional()
        .map_err(|e| format!("Failed to load social profile: {e}"))?;
    Ok(row.unwrap_or_else(|| SocialProfile {
        user_id: user_id.to_string(),
        native_lang: String::new(),
        target_lang: String::new(),
        interests: vec![],
        timezone: String::new(),
        practice_goal: String::new(),
        public_enabled: false,
        updated_at: None,
    }))
}

fn row_to_social_profile(row: &rusqlite::Row<'_>) -> rusqlite::Result<SocialProfile> {
    let raw: String = row.get(3)?;
    let interests = serde_json::from_str(&raw).unwrap_or_default();
    Ok(SocialProfile {
        user_id: row.get(0)?,
        native_lang: row.get(1)?,
        target_lang: row.get(2)?,
        interests,
        timezone: row.get(4)?,
        practice_goal: row.get(5)?,
        public_enabled: row.get::<_, i32>(6)? != 0,
        updated_at: row.get(7)?,
    })
}

pub fn get_social_recommendations(
    db: &DatabasePool,
    user_id: &str,
) -> Result<Vec<SocialCandidate>, String> {
    let me = get_social_profile(db, user_id)?;
    if !me.public_enabled {
        return Ok(vec![]);
    }
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT user_id, native_lang, target_lang, interests, timezone, practice_goal, public_enabled, updated_at
             FROM social_profiles
             WHERE user_id != ?1
               AND public_enabled = 1
               AND user_id NOT IN (SELECT blocked_id FROM social_blocks WHERE blocker_id = ?1)
               AND user_id NOT IN (SELECT blocker_id FROM social_blocks WHERE blocked_id = ?1)
             ORDER BY updated_at DESC
             LIMIT 20",
        )
        .map_err(|e| format!("Failed to prepare recommendations: {e}"))?;
    let rows = stmt
        .query_map(params![user_id], row_to_social_profile)
        .map_err(|e| format!("Failed to query recommendations: {e}"))?;
    let mut candidates = rows
        .filter_map(|row| row.ok())
        .map(|profile| {
            let shared = profile
                .interests
                .iter()
                .filter(|item| {
                    me.interests
                        .iter()
                        .any(|mine| mine.eq_ignore_ascii_case(item))
                })
                .count();
            let complementary =
                profile.native_lang == me.target_lang || profile.target_lang == me.native_lang;
            let score = shared as i32 + if complementary { 3 } else { 0 };
            (score, profile)
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(candidates
        .into_iter()
        .take(3)
        .map(|(_, profile)| SocialCandidate {
            user_id: profile.user_id,
            native_lang: profile.native_lang,
            target_lang: profile.target_lang,
            interests: profile.interests,
            timezone: profile.timezone,
            practice_goal: profile.practice_goal,
            reason: "language-match".to_string(),
        })
        .collect())
}

pub fn set_social_block(
    db: &DatabasePool,
    blocker_id: &str,
    blocked_id: &str,
    blocked: bool,
) -> Result<(), String> {
    let conn = db.conn()?;
    if blocked {
        conn.execute(
            "INSERT OR IGNORE INTO social_blocks (blocker_id, blocked_id) VALUES (?1, ?2)",
            params![blocker_id, blocked_id],
        )
    } else {
        conn.execute(
            "DELETE FROM social_blocks WHERE blocker_id = ?1 AND blocked_id = ?2",
            params![blocker_id, blocked_id],
        )
    }
    .map_err(|e| format!("Failed to update block: {e}"))?;
    Ok(())
}

pub fn report_social_user(
    db: &DatabasePool,
    reporter_id: &str,
    target_id: &str,
    reason: &str,
    detail: &str,
) -> Result<SocialReport, String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO social_reports (reporter_id, target_id, reason, detail)
         VALUES (?1, ?2, ?3, ?4)",
        params![reporter_id, target_id, reason, detail],
    )
    .map_err(|e| format!("Failed to save report: {e}"))?;
    let id = conn.last_insert_rowid() as i32;
    conn.query_row(
        "SELECT id, reporter_id, target_id, reason, detail, created_at FROM social_reports WHERE id = ?1",
        params![id],
        |row| Ok(SocialReport {
            id: row.get(0)?,
            reporter_id: row.get(1)?,
            target_id: row.get(2)?,
            reason: row.get(3)?,
            detail: row.get(4)?,
            created_at: row.get(5)?,
        }),
    )
    .map_err(|e| format!("Failed to load report: {e}"))
}

pub fn list_social_reports(
    db: &DatabasePool,
    reporter_id: &str,
) -> Result<Vec<SocialReport>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, reporter_id, target_id, reason, detail, created_at
             FROM social_reports WHERE reporter_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![reporter_id], |row| {
            Ok(SocialReport {
                id: row.get(0)?,
                reporter_id: row.get(1)?,
                target_id: row.get(2)?,
                reason: row.get(3)?,
                detail: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn social_rate_limited(
    db: &DatabasePool,
    user_id: &str,
    feature_name: &str,
) -> Result<bool, String> {
    let conn = db.conn()?;
    let recent: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM social_moderation_logs
             WHERE user_id = ?1 AND feature_name = ?2 AND created_at > datetime('now', '-1 minute')",
            params![user_id, feature_name],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(recent >= 5)
}

fn log_social_moderation(
    db: &DatabasePool,
    user_id: &str,
    feature_name: &str,
    allowed: bool,
    category: &str,
    message: &str,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO social_moderation_logs (user_id, feature_name, allowed, category, message)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            user_id,
            feature_name,
            if allowed { 1 } else { 0 },
            category,
            message
        ],
    )
    .map_err(|e| format!("Failed to save social moderation log: {e}"))?;
    Ok(())
}

pub fn submit_sentence_rewrite(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    text: &str,
) -> Result<SentenceRewrite, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("empty-content".to_string());
    }
    if social_rate_limited(db, user_id, "sentence_rewrite")? {
        return Err("rate-limited".to_string());
    }
    let safety = moderate_content(
        db,
        Some(user_id),
        "sentence_rewrite",
        trimmed,
        "sentence",
        "",
    )?;
    log_social_moderation(
        db,
        user_id,
        "sentence_rewrite",
        safety.allowed,
        &safety.category,
        &safety.message,
    )?;
    if !safety.allowed {
        return Err(safety.message);
    }
    let rewritten = simple_rewrite(trimmed);
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO social_sentence_rewrites (user_id, target_lang, original_text, rewritten_text)
         VALUES (?1, ?2, ?3, ?4)",
        params![user_id, target_lang, trimmed, rewritten],
    )
    .map_err(|e| format!("Failed to save rewrite: {e}"))?;
    Ok(SentenceRewrite {
        id: conn.last_insert_rowid() as i32,
        original_text: trimmed.to_string(),
        rewritten_text: rewritten,
        adopted: false,
    })
}

pub fn adopt_sentence_rewrite(
    db: &DatabasePool,
    rewrite_id: i32,
    user_id: &str,
    target_lang: &str,
) -> Result<SavedSentence, String> {
    let conn = db.conn()?;
    let rewritten: String = conn
        .query_row(
            "SELECT rewritten_text FROM social_sentence_rewrites WHERE id = ?1 AND user_id = ?2",
            params![rewrite_id, user_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to load rewrite: {e}"))?;
    conn.execute(
        "UPDATE social_sentence_rewrites SET adopted = 1 WHERE id = ?1",
        params![rewrite_id],
    )
    .map_err(|e| format!("Failed to adopt rewrite: {e}"))?;
    drop(conn);
    save_sentence(
        db,
        &SaveSentenceRequest {
            user_id: user_id.to_string(),
            article_id: None,
            original_text: rewritten.clone(),
            translation: String::new(),
            source: Some("sentence_rewrite".to_string()),
            target_lang: target_lang.to_string(),
        },
    )
}

pub fn ask_culture_question(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    question: &str,
) -> Result<CultureQuestion, String> {
    let trimmed = question.trim();
    if trimmed.is_empty() {
        return Err("empty-content".to_string());
    }
    if social_rate_limited(db, user_id, "culture_question")? {
        return Err("rate-limited".to_string());
    }
    let safety = moderate_content(
        db,
        Some(user_id),
        "culture_question",
        trimmed,
        "question",
        "",
    )?;
    log_social_moderation(
        db,
        user_id,
        "culture_question",
        safety.allowed,
        &safety.category,
        &safety.message,
    )?;
    if !safety.allowed {
        return Err(safety.message);
    }
    let answer = format!(
        "AI preview: in {}, keep it polite, specific, and context-aware. Ask a local speaker to refine nuance when it matters.",
        target_lang
    );
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO culture_questions (user_id, target_lang, question, ai_answer)
         VALUES (?1, ?2, ?3, ?4)",
        params![user_id, target_lang, trimmed, answer],
    )
    .map_err(|e| format!("Failed to save culture question: {e}"))?;
    Ok(CultureQuestion {
        id: conn.last_insert_rowid() as i32,
        question: trimmed.to_string(),
        ai_answer: answer,
        saved: false,
    })
}

pub fn save_culture_question_card(
    db: &DatabasePool,
    question_id: i32,
    user_id: &str,
    target_lang: &str,
) -> Result<SavedSentence, String> {
    let conn = db.conn()?;
    let (question, answer): (String, String) = conn
        .query_row(
            "SELECT question, ai_answer FROM culture_questions WHERE id = ?1 AND user_id = ?2",
            params![question_id, user_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Failed to load culture question: {e}"))?;
    conn.execute(
        "UPDATE culture_questions SET saved = 1 WHERE id = ?1",
        params![question_id],
    )
    .map_err(|e| format!("Failed to mark culture question saved: {e}"))?;
    drop(conn);
    save_sentence(
        db,
        &SaveSentenceRequest {
            user_id: user_id.to_string(),
            article_id: None,
            original_text: question,
            translation: answer,
            source: Some("culture_question".to_string()),
            target_lang: target_lang.to_string(),
        },
    )
}

pub fn get_article_version(
    db: &DatabasePool,
    article_id: i32,
    cefr_level: &str,
) -> Result<ArticleVersion, String> {
    let conn = db.conn()?;
    if let Some((body, source)) = conn
        .query_row(
            "SELECT body, source FROM article_versions WHERE article_id = ?1 AND cefr_level = ?2",
            params![article_id, cefr_level],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| format!("Failed to load article version: {e}"))?
    {
        return Ok(ArticleVersion {
            article_id,
            cefr_level: cefr_level.to_string(),
            body,
            source,
            from_cache: true,
        });
    }
    let body: String = conn
        .query_row(
            "SELECT COALESCE(rewritten_body, original_body, '') FROM news_articles WHERE id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to load article: {e}"))?;
    let simplified = simplify_article_for_level(&body, cefr_level);
    conn.execute(
        "INSERT INTO article_versions (article_id, cefr_level, body, source)
         VALUES (?1, ?2, ?3, 'local-ai-fallback')",
        params![article_id, cefr_level, simplified],
    )
    .map_err(|e| format!("Failed to save article version: {e}"))?;
    Ok(ArticleVersion {
        article_id,
        cefr_level: cefr_level.to_string(),
        body: simplified,
        source: "local-ai-fallback".to_string(),
        from_cache: false,
    })
}

fn simple_rewrite(text: &str) -> String {
    let mut value = text.trim().to_string();
    if !value.ends_with('.') && !value.ends_with('!') && !value.ends_with('?') {
        value.push('.');
    }
    value
}

fn simplify_article_for_level(body: &str, cefr_level: &str) -> String {
    let max_words = match cefr_level {
        "A1" => 90,
        "A2" => 130,
        "B1" => 180,
        _ => 240,
    };
    let words = body.split_whitespace().take(max_words).collect::<Vec<_>>();
    if words.is_empty() {
        return body.to_string();
    }
    words.join(" ")
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
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM ai_call_logs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        drop(conn);

        clear_ai_call_logs(&db, Some("u1")).unwrap();
        let conn_after = db.conn().unwrap();
        let count_after: i32 = conn_after
            .query_row("SELECT COUNT(*) FROM ai_call_logs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count_after, 0);
    }

    #[test]
    fn review_queue_deduplicates_lesson_mistakes() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        drop(conn);
        let req = LessonMistakeRequest {
            user_id: "u1".to_string(),
            target_lang: "es".to_string(),
            source_id: "s1:q1".to_string(),
            title: "Section".to_string(),
            prompt: "Prompt".to_string(),
            answer: "Answer".to_string(),
            skill_tag: "T07".to_string(),
        };
        record_lesson_mistake(&db, &req).unwrap();
        record_lesson_mistake(&db, &req).unwrap();

        let summary = get_review_summary(&db, "u1", "es").unwrap();
        let queue = list_review_queue(&db, "u1", "es", 10).unwrap();
        assert_eq!(summary.due_count, 1);
        assert_eq!(queue.len(), 1);
    }

    #[test]
    fn social_profile_defaults_private_and_recommends_public_candidates() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'A')", [])
            .unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u2', 'B')", [])
            .unwrap();
        drop(conn);

        assert!(!get_social_profile(&db, "u1").unwrap().public_enabled);
        save_social_profile(
            &db,
            &SocialProfile {
                user_id: "u1".to_string(),
                native_lang: "zh".to_string(),
                target_lang: "es".to_string(),
                interests: vec!["music".to_string()],
                timezone: "UTC+8".to_string(),
                practice_goal: "speaking".to_string(),
                public_enabled: true,
                updated_at: None,
            },
        )
        .unwrap();
        save_social_profile(
            &db,
            &SocialProfile {
                user_id: "u2".to_string(),
                native_lang: "es".to_string(),
                target_lang: "zh".to_string(),
                interests: vec!["music".to_string()],
                timezone: "UTC+1".to_string(),
                practice_goal: "chat".to_string(),
                public_enabled: true,
                updated_at: None,
            },
        )
        .unwrap();

        let candidates = get_social_recommendations(&db, "u1").unwrap();
        assert_eq!(candidates.len(), 1);
        set_social_block(&db, "u1", "u2", true).unwrap();
        assert!(get_social_recommendations(&db, "u1").unwrap().is_empty());
    }

    #[test]
    fn sentence_rewrite_blocks_sensitive_content() {
        let db = DatabasePool::new_in_memory();
        let result = submit_sentence_rewrite(&db, "u1", "es", "bomb plan");
        assert!(result.is_err());
    }

    #[test]
    fn article_version_is_cached() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, target_lang)
             VALUES ('T', 'one two three four five six seven eight nine ten', 'es')",
            [],
        )
        .unwrap();
        let article_id = conn.last_insert_rowid() as i32;
        drop(conn);

        let first = get_article_version(&db, article_id, "A1").unwrap();
        let second = get_article_version(&db, article_id, "A1").unwrap();
        assert!(!first.from_cache);
        assert!(second.from_cache);
        assert_eq!(first.body, second.body);
    }
}
