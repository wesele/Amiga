use crate::modules::database::DatabasePool;
use crate::modules::llm as llm_mod;
use log;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::DatabasePool;
    use rusqlite::Connection;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    fn insert_user(conn: &Connection) {
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .ok();
    }

    #[test]
    fn test_ensure_default_topics_seeds_100() {
        let pool = test_pool();
        ensure_default_topics(&pool);
        let conn = pool.conn().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reading_topics", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 100);
    }

    #[test]
    fn test_ensure_default_topics_idempotent() {
        let pool = test_pool();
        ensure_default_topics(&pool);
        ensure_default_topics(&pool);
        let conn = pool.conn().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reading_topics", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 100);
    }

    #[test]
    fn test_slot_determination() {
        assert_eq!(determine_slot(0), "AM");
        assert_eq!(determine_slot(11), "AM");
        assert_eq!(determine_slot(12), "PM");
        assert_eq!(determine_slot(23), "PM");
    }

    #[test]
    fn test_normalize_questions_accepts_one_based_indexes() {
        let questions = vec![ReadingQuestion {
            question: "Question?".to_string(),
            options: vec![
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "D".to_string(),
            ],
            correct_index: 4,
            question_type: "reading".to_string(),
            audio_text: None,
        }];

        let normalized = normalize_reading_questions(questions).unwrap();
        assert_eq!(normalized[0].correct_index, 3);
    }

    #[test]
    fn test_normalize_questions_rejects_out_of_range_indexes() {
        let questions = vec![ReadingQuestion {
            question: "Question?".to_string(),
            options: vec![
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "D".to_string(),
            ],
            correct_index: 5,
            question_type: "reading".to_string(),
            audio_text: None,
        }];

        assert!(normalize_reading_questions(questions).is_err());
    }

    #[test]
    fn test_save_and_get_article() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        let aid = save_reading_article(
            &pool,
            "u1",
            "es",
            "A2",
            "2025-07-05",
            "AM",
            "Test topic",
            "Test Title",
            "Test body content here",
        )
        .unwrap();

        let article = get_reading_article(&pool, aid).unwrap();
        assert_eq!(article.title, "Test Title");
        assert_eq!(article.status, "unread");
    }

    #[test]
    fn test_mark_article_read() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        let aid = save_reading_article(
            &pool,
            "u1",
            "es",
            "A2",
            "2025-07-05",
            "AM",
            "Topic",
            "Title",
            "Body",
        )
        .unwrap();
        mark_article_read(&pool, aid).unwrap();
        assert_eq!(get_reading_article(&pool, aid).unwrap().status, "read");
    }

    #[test]
    fn test_submit_test_updates_article() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        let aid = save_reading_article(
            &pool,
            "u1",
            "es",
            "A2",
            "2025-07-05",
            "AM",
            "Topic",
            "Title",
            "Body",
        )
        .unwrap();
        submit_reading_test(&pool, aid, "u1", "[]", 8, 10).unwrap();
        let article = get_reading_article(&pool, aid).unwrap();
        assert_eq!(article.status, "completed");
        assert_eq!(article.test_correct_count, Some(8));
        assert_eq!(article.test_total_count, Some(10));
    }

    #[test]
    fn test_get_articles_ordered_by_date_desc() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        let a1 = save_reading_article(
            &pool,
            "u1",
            "es",
            "A2",
            "2025-07-04",
            "AM",
            "Topic A",
            "Old",
            "Body",
        )
        .unwrap();
        let a2 = save_reading_article(
            &pool,
            "u1",
            "es",
            "A2",
            "2025-07-05",
            "AM",
            "Topic B",
            "New",
            "Body",
        )
        .unwrap();

        let articles = get_reading_articles(&pool, "u1", "es").unwrap();
        assert_eq!(articles.len(), 2);
        assert_eq!(articles[0].id, a2);
        assert_eq!(articles[1].id, a1);
    }

    #[test]
    fn test_get_articles_filters_by_target_lang() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        save_reading_article(
            &pool,
            "u1",
            "es",
            "A1",
            "2025-07-05",
            "AM",
            "T1",
            "ES",
            "Body",
        )
        .unwrap();
        save_reading_article(
            &pool,
            "u1",
            "en",
            "A1",
            "2025-07-05",
            "AM",
            "T2",
            "EN",
            "Body",
        )
        .unwrap();

        assert_eq!(get_reading_articles(&pool, "u1", "es").unwrap().len(), 1);
    }

    #[test]
    fn test_clear_article_test_data() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        let aid = save_reading_article(
            &pool,
            "u1",
            "es",
            "A2",
            "2025-07-05",
            "AM",
            "Topic",
            "Title",
            "Body",
        )
        .unwrap();
        submit_reading_test(&pool, aid, "u1", "[]", 7, 10).unwrap();

        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO reading_tests (article_id, questions_json) VALUES (?1, '[]')",
            params![aid],
        )
        .unwrap();
        drop(conn);

        clear_article_test_data(&pool, aid).unwrap();
        update_reading_article_content(&pool, aid, "New topic", "New title", "New body", "B1")
            .unwrap();

        let article = get_reading_article(&pool, aid).unwrap();
        assert_eq!(article.title, "New title");
        assert_eq!(article.topic, "New topic");
        assert_eq!(article.cefr_level, "B1");
        assert_eq!(article.status, "unread");
        assert!(article.test_correct_count.is_none());
        assert!(article.test_total_count.is_none());

        let conn = pool.conn().unwrap();
        let test_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM reading_tests WHERE article_id = ?1",
                params![aid],
                |row| row.get(0),
            )
            .unwrap();
        let attempt_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM reading_test_attempts WHERE article_id = ?1",
                params![aid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(test_count, 0);
        assert_eq!(attempt_count, 0);
    }

    #[test]
    fn test_parse_generated_article_json_accepts_fenced_response() {
        let raw = r#"```json
{"title": "Un dia en el mercado", "body": "Hoy voy al mercado con mi madre. Compramos fruta fresca, pan recien horneado y queso local. El vendedor nos saluda con una sonrisa y recomienda las naranjas dulces de la temporada."}
```"#;
        let (title, body) = parse_generated_article_json(raw).unwrap();
        assert_eq!(title, "Un dia en el mercado");
        assert!(body.contains("mercado"));
    }

    #[test]
    fn test_parse_generated_article_json_rejects_truncated_object() {
        let raw = r#"{"title": "Test", "body": "This body ends without closing quote}"#;
        assert!(parse_generated_article_json(raw).is_err());
    }

    #[test]
    fn test_get_article_for_slot() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        save_reading_article(
            &pool,
            "u1",
            "es",
            "A2",
            "2025-07-05",
            "AM",
            "Topic",
            "Title",
            "Body",
        )
        .unwrap();

        assert!(get_article_for_slot(&pool, "u1", "es", "2025-07-05", "AM")
            .unwrap()
            .is_some());
        assert!(get_article_for_slot(&pool, "u1", "es", "2025-07-05", "PM")
            .unwrap()
            .is_none());
    }

    #[test]
    fn test_imported_article_chapters_and_courseware_progress() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        let aid = save_imported_article(
            &pool,
            "u1",
            "es",
            "youtube",
            "https://www.youtube.com/watch?v=test123",
            "test123",
            "Test Video",
            Some("Test Channel"),
            Some(420),
            None,
            r#"[{"start":0.0,"end":180.0,"text":"Hola amigos."},{"start":181.0,"end":360.0,"text":"Adiós amigos."}]"#,
            Some("A2"),
        )
        .unwrap();

        let drafts = vec![
            ImportedChapterDraft {
                chapter_index: 0,
                title: "第 1 章".to_string(),
                start_para_idx: 0,
                end_para_idx: 0,
                start_sec: 0.0,
                end_sec: 180.0,
            },
            ImportedChapterDraft {
                chapter_index: 1,
                title: "第 2 章".to_string(),
                start_para_idx: 1,
                end_para_idx: 1,
                start_sec: 181.0,
                end_sec: 360.0,
            },
        ];

        let chapters = save_imported_article_chapters(&pool, aid, &drafts).unwrap();
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "第 1 章");
        assert_eq!(chapters[0].courseware_status, "pending");

        // Simulate courseware ready with 5 pages
        let conn = pool.conn().unwrap();
        conn.execute(
            "UPDATE imported_article_chapters SET courseware_status = 'ready', total_pages = 5 WHERE id = ?1",
            params![chapters[0].id],
        )
        .unwrap();
        drop(conn);

        let updated = update_chapter_courseware_progress(&pool, chapters[0].id, 3).unwrap();
        assert_eq!(updated.viewed_pages, 3);
        assert_eq!(updated.total_pages, 5);

        // Monotonic progress: flipping back to page 1 does not reduce viewed_pages
        let updated2 = update_chapter_courseware_progress(&pool, chapters[0].id, 1).unwrap();
        assert_eq!(updated2.viewed_pages, 3);

        // Clamping to total_pages
        let updated3 = update_chapter_courseware_progress(&pool, chapters[0].id, 99).unwrap();
        assert_eq!(updated3.viewed_pages, 5);
    }

    #[test]
    fn test_parse_courseware_json_and_svg_fallback() {
        let raw = r#"```json
{
  "chapter_title": "En el restaurante",
  "slides": [
    {
      "slide_type": "vocab",
      "term": "propina",
      "lemma": "propina",
      "pos": "n.",
      "meaning": "小费",
      "explanation": "用餐后额外给服务员的费用",
      "context_sentence": "Dejamos una buena propina.",
      "context_translation": "我们留下了一笔丰厚的小费。",
      "para_idx": 0,
      "svg": "<script>alert(1)</script>"
    }
  ]
}
```"#;
        let parsed = parse_generated_courseware_json(raw).unwrap();
        assert_eq!(parsed.chapter_title.as_deref(), Some("En el restaurante"));
        assert_eq!(parsed.slides.len(), 1);
        let safe_svg = sanitize_or_fallback_slide_svg(&parsed.slides[0]);
        assert!(safe_svg.starts_with("<svg"));
        assert!(!safe_svg.contains("<script"));
        assert!(safe_svg.contains("propina"));
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadingArticle {
    pub id: i64,
    pub user_id: String,
    pub target_language: String,
    pub cefr_level: String,
    pub local_date: String,
    pub slot: String,
    pub topic: String,
    pub title: String,
    pub body: String,
    pub status: String,
    pub test_correct_count: Option<i32>,
    pub test_total_count: Option<i32>,
    pub generated_at: String,
}

fn default_question_type() -> String {
    "reading".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadingQuestion {
    pub question: String,
    pub options: Vec<String>,
    #[serde(rename = "correct")]
    pub correct_index: usize,
    #[serde(default = "default_question_type", rename = "type")]
    pub question_type: String,
    #[serde(default, rename = "audio_text")]
    pub audio_text: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeneratedArticle {
    title: String,
    body: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportedArticle {
    pub id: i64,
    pub user_id: String,
    pub target_language: String,
    pub source_type: String,
    pub source_url: String,
    pub source_id: String,
    pub title: String,
    pub channel: Option<String>,
    pub duration_sec: Option<i64>,
    pub audio_path: Option<String>,
    pub subtitles_json: String,
    pub cefr_level: Option<String>,
    pub created_at: String,
}

fn default_slide_type() -> String {
    "vocab".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CoursewareSlide {
    #[serde(default = "default_slide_type")]
    pub slide_type: String,
    pub term: String,
    #[serde(default)]
    pub lemma: Option<String>,
    #[serde(default)]
    pub pos: Option<String>,
    #[serde(default)]
    pub pronunciation: Option<String>,
    pub meaning: String,
    #[serde(default)]
    pub explanation: String,
    #[serde(default)]
    pub context_sentence: String,
    #[serde(default)]
    pub context_translation: String,
    #[serde(default)]
    pub para_idx: Option<usize>,
    #[serde(default)]
    pub start_sec: Option<f64>,
    #[serde(default)]
    pub end_sec: Option<f64>,
    #[serde(default)]
    pub svg: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportedChapterDraft {
    pub chapter_index: usize,
    pub title: String,
    pub start_para_idx: usize,
    pub end_para_idx: usize,
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportedArticleChapter {
    pub id: i64,
    pub article_id: i64,
    pub chapter_index: usize,
    pub title: String,
    pub start_para_idx: usize,
    pub end_para_idx: usize,
    pub start_sec: f64,
    pub end_sec: f64,
    pub courseware_status: String,
    pub slides: Vec<CoursewareSlide>,
    pub viewed_pages: usize,
    pub total_pages: usize,
    pub error_message: Option<String>,
}

// ── 100 default topics ─────────────────────────────────────────────

const DEFAULT_TOPICS: &[(&str, &str)] = &[
    ("Ordering food at a restaurant", "dining"),
    ("Asking for directions", "travel"),
    ("Checking into a hotel", "travel"),
    ("Shopping for clothes", "shopping"),
    ("Visiting a doctor", "health"),
    ("Taking a taxi", "travel"),
    ("Buying a bus ticket", "travel"),
    ("Visiting a pharmacy", "health"),
    ("Making a phone reservation", "services"),
    ("Introducing yourself", "social"),
    ("Talking about hobbies", "social"),
    ("Discussing the weather", "daily_life"),
    ("Asking about someone's weekend", "social"),
    ("Describing your family", "social"),
    ("Talking about work", "work"),
    ("Ordering coffee", "dining"),
    ("At the airport", "travel"),
    ("Renting an apartment", "services"),
    ("Going to a job interview", "work"),
    ("Talking about travel experiences", "travel"),
    ("Discussing movies", "entertainment"),
    ("Talking about music", "entertainment"),
    ("Describing your daily routine", "daily_life"),
    ("Asking for help in a store", "shopping"),
    ("At the post office", "services"),
    ("Visiting a museum", "entertainment"),
    ("Taking a guided tour", "travel"),
    ("At the bank", "services"),
    ("Renting a car", "travel"),
    ("Dealing with an emergency", "emergency"),
    ("Talking about food preferences", "dining"),
    ("Making plans with friends", "social"),
    ("Discussing current events", "daily_life"),
    ("Talking about sports", "entertainment"),
    ("Describing symptoms to a doctor", "health"),
    ("At a party", "social"),
    ("Talking about future plans", "social"),
    ("Discussing study habits", "education"),
    ("At the library", "education"),
    ("Using public transportation", "travel"),
    ("Talking about pets", "daily_life"),
    ("Discussing fashion", "shopping"),
    ("At the gym", "health"),
    ("Talking about technology", "daily_life"),
    ("Discussing environmental issues", "daily_life"),
    ("At the market", "shopping"),
    ("Shopping for groceries", "shopping"),
    ("Discussing recipes", "dining"),
    ("Talking about holidays", "culture"),
    ("At a wedding", "culture"),
    ("Discussing books", "entertainment"),
    ("Talking about education", "education"),
    ("At a conference", "work"),
    ("Negotiating a price", "shopping"),
    ("Giving compliments", "social"),
    ("Expressing opinions", "social"),
    ("Apologizing", "social"),
    ("Making small talk", "social"),
    ("Describing a city", "travel"),
    ("Talking about health and fitness", "health"),
    ("At the hair salon", "services"),
    ("Discussing art", "culture"),
    ("Talking about cultural differences", "culture"),
    ("At a business meeting", "work"),
    ("Explaining a problem", "services"),
    ("Asking for advice", "social"),
    ("Giving directions", "travel"),
    ("Describing a person", "social"),
    ("Talking about childhood memories", "social"),
    ("Discussing news headlines", "daily_life"),
    ("At a train station", "travel"),
    ("Renting a bicycle", "travel"),
    ("Visiting a friend's house", "social"),
    ("Talking about languages", "education"),
    ("At a concert", "entertainment"),
    ("Discussing social media", "daily_life"),
    ("Planning a trip", "travel"),
    ("Describing your home", "daily_life"),
    ("Talking about cooking", "dining"),
    ("At a car repair shop", "services"),
    ("Discussing politics politely", "social"),
    ("At the embassy", "services"),
    ("Volunteering", "social"),
    ("Talking about photography", "entertainment"),
    ("At a sporting event", "entertainment"),
    ("Describing nature", "nature"),
    ("Discussing career goals", "work"),
    ("At the dentist", "health"),
    ("Talking about movies", "entertainment"),
    ("Ordering delivery food", "dining"),
    ("At a farmer's market", "shopping"),
    ("Discussing finances", "daily_life"),
    ("Talking about relationships", "social"),
    ("At a bookstore", "shopping"),
    ("Participating in a meeting", "work"),
    ("Describing a dream", "daily_life"),
    ("Talking about famous people", "social"),
    ("At a theme park", "entertainment"),
    ("Discussing productivity", "work"),
    ("Celebrating a birthday", "culture"),
];

// ── Public API ─────────────────────────────────────────────────────

pub fn ensure_default_topics(db: &DatabasePool) {
    let conn = match db.conn() {
        Ok(c) => c,
        Err(e) => {
            log::error!(
                "Failed to get DB connection for ensure_default_topics: {}",
                e
            );
            return;
        }
    };
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM reading_topics", [], |row| row.get(0))
        .unwrap_or(0);
    if count > 0 {
        return;
    }
    for (topic, scene) in DEFAULT_TOPICS {
        if let Err(e) = conn.execute(
            "INSERT INTO reading_topics (topic, scene) VALUES (?1, ?2)",
            params![topic, scene],
        ) {
            log::error!("Failed to insert reading topic '{}': {}", topic, e);
        }
    }
    log::info!("Seeded {} default reading topics", DEFAULT_TOPICS.len());
}

pub fn determine_slot(hour: i32) -> &'static str {
    if hour < 12 {
        "AM"
    } else {
        "PM"
    }
}

fn normalize_reading_questions(
    mut questions: Vec<ReadingQuestion>,
) -> Result<Vec<ReadingQuestion>, String> {
    let use_one_based_index = questions
        .iter()
        .any(|q| q.correct_index == q.options.len() && !q.options.is_empty());

    for (idx, question) in questions.iter_mut().enumerate() {
        if question.question.trim().is_empty() {
            return Err(format!("Question {} is empty", idx + 1));
        }
        if question.options.len() != 4 {
            return Err(format!(
                "Question {} expected 4 options, got {}",
                idx + 1,
                question.options.len()
            ));
        }
        if use_one_based_index {
            if question.correct_index == 0 {
                return Err(format!(
                    "Question {} has invalid 1-based answer index 0",
                    idx + 1
                ));
            }
            question.correct_index -= 1;
        }
        if question.correct_index >= question.options.len() {
            return Err(format!(
                "Question {} answer index {} is out of range",
                idx + 1,
                question.correct_index
            ));
        }
        if question.question_type == "listening" {
            if question
                .audio_text
                .as_ref()
                .map(|text| text.trim().is_empty())
                .unwrap_or(true)
            {
                return Err(format!(
                    "Question {} is listening but missing audio_text",
                    idx + 1
                ));
            }
        } else if question.question_type != "reading" {
            return Err(format!(
                "Question {} has invalid type {}",
                idx + 1,
                question.question_type
            ));
        }
    }

    Ok(questions)
}

pub fn get_reading_articles(
    db: &DatabasePool,
    user_id: &str,
    target_language: &str,
) -> Result<Vec<ReadingArticle>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, target_language, cefr_level, local_date, slot,
                topic, title, body, status, test_correct_count, test_total_count, generated_at
         FROM reading_articles
         WHERE user_id = ?1 AND target_language = ?2
         ORDER BY local_date DESC, slot DESC, id DESC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let articles = stmt
        .query_map(params![user_id, target_language], |row| {
            Ok(ReadingArticle {
                id: row.get(0)?,
                user_id: row.get(1)?,
                target_language: row.get(2)?,
                cefr_level: row.get(3)?,
                local_date: row.get(4)?,
                slot: row.get(5)?,
                topic: row.get(6)?,
                title: row.get(7)?,
                body: row.get(8)?,
                status: row.get(9)?,
                test_correct_count: row.get(10)?,
                test_total_count: row.get(11)?,
                generated_at: row.get(12)?,
            })
        })
        .map_err(|e| format!("Query map error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(articles)
}

pub fn get_reading_article(db: &DatabasePool, article_id: i64) -> Result<ReadingArticle, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, user_id, target_language, cefr_level, local_date, slot,
                topic, title, body, status, test_correct_count, test_total_count, generated_at
         FROM reading_articles WHERE id = ?1",
        params![article_id],
        |row| {
            Ok(ReadingArticle {
                id: row.get(0)?,
                user_id: row.get(1)?,
                target_language: row.get(2)?,
                cefr_level: row.get(3)?,
                local_date: row.get(4)?,
                slot: row.get(5)?,
                topic: row.get(6)?,
                title: row.get(7)?,
                body: row.get(8)?,
                status: row.get(9)?,
                test_correct_count: row.get(10)?,
                test_total_count: row.get(11)?,
                generated_at: row.get(12)?,
            })
        },
    )
    .map_err(|e| format!("Article not found: {}", e))
}

pub fn get_article_for_slot(
    db: &DatabasePool,
    user_id: &str,
    target_language: &str,
    local_date: &str,
    slot: &str,
) -> Result<Option<ReadingArticle>, String> {
    let conn = db.conn()?;
    let result = conn
        .query_row(
            "SELECT id, user_id, target_language, cefr_level, local_date, slot,
                topic, title, body, status, test_correct_count, test_total_count, generated_at
         FROM reading_articles
         WHERE user_id = ?1 AND target_language = ?2 AND local_date = ?3 AND slot = ?4",
            params![user_id, target_language, local_date, slot],
            |row| {
                Ok(ReadingArticle {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    target_language: row.get(2)?,
                    cefr_level: row.get(3)?,
                    local_date: row.get(4)?,
                    slot: row.get(5)?,
                    topic: row.get(6)?,
                    title: row.get(7)?,
                    body: row.get(8)?,
                    status: row.get(9)?,
                    test_correct_count: row.get(10)?,
                    test_total_count: row.get(11)?,
                    generated_at: row.get(12)?,
                })
            },
        )
        .ok();
    Ok(result)
}

pub fn save_reading_article(
    db: &DatabasePool,
    user_id: &str,
    target_language: &str,
    cefr_level: &str,
    local_date: &str,
    slot: &str,
    topic: &str,
    title: &str,
    body: &str,
) -> Result<i64, String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO reading_articles
            (user_id, target_language, cefr_level, local_date, slot, topic, title, body)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            user_id,
            target_language,
            cefr_level,
            local_date,
            slot,
            topic,
            title,
            body
        ],
    )
    .map_err(|e| format!("Failed to save reading article: {}", e))?;
    Ok(conn.last_insert_rowid())
}

fn clear_article_test_data(db: &DatabasePool, article_id: i64) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "DELETE FROM reading_test_attempts WHERE article_id = ?1",
        params![article_id],
    )
    .map_err(|e| format!("Failed to clear reading test attempts: {}", e))?;
    conn.execute(
        "DELETE FROM reading_tests WHERE article_id = ?1",
        params![article_id],
    )
    .map_err(|e| format!("Failed to clear reading tests: {}", e))?;
    Ok(())
}

fn update_reading_article_content(
    db: &DatabasePool,
    article_id: i64,
    topic: &str,
    title: &str,
    body: &str,
    cefr_level: &str,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE reading_articles
         SET topic = ?1, title = ?2, body = ?3, cefr_level = ?4,
             status = 'unread', test_correct_count = NULL, test_total_count = NULL,
             generated_at = datetime('now', 'localtime')
         WHERE id = ?5",
        params![topic, title, body, cefr_level, article_id],
    )
    .map_err(|e| format!("Failed to update reading article: {}", e))?;
    Ok(())
}

pub fn mark_article_read(db: &DatabasePool, article_id: i64) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE reading_articles SET status = 'read' WHERE id = ?1 AND status = 'unread'",
        params![article_id],
    )
    .map_err(|e| format!("Failed to mark article read: {}", e))?;
    Ok(())
}

pub fn submit_reading_test(
    db: &DatabasePool,
    article_id: i64,
    user_id: &str,
    answers_json: &str,
    correct_count: i32,
    total_count: i32,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO reading_test_attempts (article_id, user_id, answers_json, correct_count, total_count)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![article_id, user_id, answers_json, correct_count, total_count],
    ).map_err(|e| format!("Failed to save test attempt: {}", e))?;

    conn.execute(
        "UPDATE reading_articles
         SET status = 'completed', test_correct_count = ?1, test_total_count = ?2
         WHERE id = ?3",
        params![correct_count, total_count, article_id],
    )
    .map_err(|e| format!("Failed to update article after test: {}", e))?;

    log::info!(
        "Reading test submitted: article={} user={} score={}/{}",
        article_id,
        user_id,
        correct_count,
        total_count
    );
    Ok(())
}

fn pick_unused_topic(db: &DatabasePool, user_id: &str) -> Result<String, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT topic FROM reading_topics WHERE enabled = 1
         AND topic NOT IN (SELECT DISTINCT topic FROM reading_articles WHERE user_id = ?1)
         ORDER BY RANDOM() LIMIT 1",
        params![user_id],
        |row| row.get(0),
    )
    .or_else(|_| {
        conn.query_row(
            "SELECT topic FROM reading_topics WHERE enabled = 1 ORDER BY RANDOM() LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("No enabled reading topics: {}", e))
    })
}

// ── LLM generation ─────────────────────────────────────────────────

fn clean_json_response(raw: &str) -> &str {
    raw.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
}

fn parse_generated_article_json(raw: &str) -> Result<(String, String), String> {
    let cleaned = clean_json_response(raw);

    if let Ok(result) = serde_json::from_str::<GeneratedArticle>(cleaned) {
        return validate_generated_article(result);
    }

    let start = cleaned.find('{').ok_or_else(|| {
        format!(
            "Failed to parse article JSON: no JSON object found. Raw: {}",
            raw
        )
    })?;
    let end = cleaned.rfind('}').ok_or_else(|| {
        format!(
            "Failed to parse article JSON: response looks truncated. Raw: {}",
            &raw[..raw.len().min(200)]
        )
    })?;
    if end <= start {
        return Err(format!(
            "Failed to parse article JSON: response looks truncated. Raw: {}",
            &raw[..raw.len().min(200)]
        ));
    }

    let slice = &cleaned[start..=end];
    let result: GeneratedArticle = serde_json::from_str(slice).map_err(|e| {
        format!(
            "Failed to parse article JSON: {}. Raw: {}",
            e,
            &raw[..raw.len().min(200)]
        )
    })?;
    validate_generated_article(result)
}

fn validate_generated_article(article: GeneratedArticle) -> Result<(String, String), String> {
    let title = article.title.trim().to_string();
    let body = article.body.trim().to_string();

    if title.is_empty() {
        return Err("AI 返回的文章标题为空，请重试".to_string());
    }
    if body.is_empty() {
        return Err("AI 返回的文章正文为空，请重试".to_string());
    }
    if body.len() < 80 {
        return Err("AI 返回的文章正文过短，可能生成不完整，请重试".to_string());
    }

    Ok((title, body))
}

async fn generate_article_via_llm(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    topic: &str,
    target_lang: &str,
    cefr_level: &str,
    native_lang: &str,
) -> Result<(String, String), String> {
    let messages = build_reading_article_messages(db, topic, target_lang, cefr_level, native_lang);
    let mut last_err = String::new();

    for attempt in 1..=2 {
        let response = llm.chat_for_reading_content(db, messages.clone()).await;
        match response {
            Ok(raw) => match parse_generated_article_json(&raw) {
                Ok(parsed) => return Ok(parsed),
                Err(err) => {
                    log::warn!(
                        "Reading article JSON parse failed (attempt {}): {}",
                        attempt,
                        err
                    );
                    last_err = err;
                }
            },
            Err(err) => {
                log::warn!(
                    "Reading article LLM call failed (attempt {}): {}",
                    attempt,
                    err
                );
                last_err = err;
            }
        }
    }

    Err(if last_err.is_empty() {
        "文章生成失败，请重试".to_string()
    } else {
        last_err
    })
}

fn build_reading_article_messages(
    db: &DatabasePool,
    topic: &str,
    target_lang: &str,
    cefr_level: &str,
    native_lang: &str,
) -> Vec<llm_mod::ChatMessage> {
    let vars = [
        ("TARGET_LANG", target_lang),
        ("CEFR_LEVEL", cefr_level),
        ("TOPIC", topic),
        ("NATIVE_LANG", native_lang),
    ];

    let messages = crate::modules::llm::build_chat_messages(db, "generate-reading-article", &vars);
    if messages.is_empty() {
        let prompt = format!(
            "Generate a short reading passage in {target_lang} for a CEFR {cefr_level} language learner.\n\n\
             Topic: {topic}\nNative language: {native_lang}\n\n\
             Requirements:\n\
             1. Write 150-300 words in {target_lang}\n\
             2. Use vocabulary and grammar appropriate for CEFR {cefr_level}\n\
             3. The passage should be a natural conversation, story, or description about: {topic}\n\
             4. Include a short title (2-8 words)\n\
             5. Output one complete JSON object only; do not truncate the body field\n\n\
             Return strict JSON:\n{{\"title\": \"...\", \"body\": \"...\"}}"
        );
        crate::modules::llm::build_chat_messages_fallback(
            "You are a language learning content creator. Generate a short reading passage. Output only JSON, no extra prose.",
            &prompt,
        )
    } else {
        messages
    }
}

async fn generate_test_via_llm(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    body: &str,
    target_lang: &str,
    cefr_level: &str,
) -> Result<Vec<ReadingQuestion>, String> {
    let vars = [
        ("TARGET_LANG", target_lang),
        ("CEFR_LEVEL", cefr_level),
        ("BODY", body),
    ];

    let messages = crate::modules::llm::build_chat_messages(db, "generate-reading-test", &vars);
    let messages = if messages.is_empty() {
        let prompt = format!(
            "Based on the following {target_lang} reading passage, generate exactly 10 multiple-choice questions: 5 reading and 5 listening.\n\n\
             Article: {body}\n\n\
             Requirements:\n\
             1. Each question has exactly ONE correct answer and 4 options\n\
             2. Difficulty should match CEFR {cefr_level}\n\
             3. Reading questions (type \"reading\"): test comprehension of the article; write question and options in {target_lang}; omit audio_text\n\
             4. Listening questions (type \"listening\"): provide audio_text as a short sentence (1-2 sentences) in {target_lang} related to the article; write question and options in {target_lang}; the correct answer must follow from audio_text alone\n\
             5. Put all 5 reading questions first, then all 5 listening questions\n\n\
             Return strict JSON array:\n\
             [\n  {{\"type\": \"reading\", \"question\": \"...\", \"options\": [\"A\", \"B\", \"C\", \"D\"], \"correct\": 0}},\n\
             {{\"type\": \"listening\", \"audio_text\": \"...\", \"question\": \"...\", \"options\": [\"A\", \"B\", \"C\", \"D\"], \"correct\": 0}},\n  ...\n]"
        );
        crate::modules::llm::build_chat_messages_fallback(
            "You are a language learning assessment creator. Output only JSON, no extra prose.",
            &prompt,
        )
    } else {
        messages
    };

    let response = llm.chat(db, messages).await?;
    let cleaned = response
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let questions: Vec<ReadingQuestion> = serde_json::from_str(cleaned)
        .map_err(|e| format!("Failed to parse test JSON: {}. Raw: {}", e, response))?;

    if questions.len() != 10 {
        return Err(format!("Expected 10 questions, got {}", questions.len()));
    }
    normalize_reading_questions(questions)
}

async fn explain_answer_via_llm(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    body: &str,
    question: &str,
    user_answer: &str,
    correct_answer: &str,
    native_lang: &str,
) -> Result<String, String> {
    let vars = [
        ("BODY", body),
        ("QUESTION", question),
        ("USER_ANSWER", user_answer),
        ("CORRECT_ANSWER", correct_answer),
        ("NATIVE_LANG", native_lang),
    ];

    let messages = crate::modules::llm::build_chat_messages(db, "explain-reading-answer", &vars);
    let messages = if messages.is_empty() {
        let prompt = format!(
            "Explain why the selected answer is wrong, in {native_lang}.\n\n\
             Article: {body}\n\
             Question: {question}\n\
             Your answer: {user_answer}\n\
             Correct answer: {correct_answer}\n\n\
             Keep it concise (2-3 sentences). Focus on the key information from the article that supports the correct answer."
        );
        crate::modules::llm::build_chat_messages_fallback(
            "You are a patient language tutor. Explain wrong answers concisely.",
            &prompt,
        )
    } else {
        messages
    };

    let response = llm.chat(db, messages).await?;
    let explanation = response
        .trim()
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();
    Ok(explanation)
}

// ── High-level public functions ────────────────────────────────────

pub async fn ensure_reading_article(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    cefr_level: &str,
    native_lang: &str,
) -> Result<ReadingArticle, String> {
    let now = chrono::Local::now();
    let local_date = now.format("%Y-%m-%d").to_string();
    let hour: i32 = now.format("%H").to_string().parse().unwrap_or(0);
    let slot = determine_slot(hour);

    if let Some(article) = get_article_for_slot(db, user_id, target_lang, &local_date, slot)? {
        log::info!(
            "Reading article already exists for {}/{} {}",
            local_date,
            slot,
            user_id
        );
        return Ok(article);
    }

    let topic = pick_unused_topic(db, user_id)?;
    log::info!(
        "Generating reading article for {}/{}: topic={}",
        local_date,
        slot,
        topic
    );

    let (title, body) =
        generate_article_via_llm(llm, db, &topic, target_lang, cefr_level, native_lang).await?;
    let article_id = save_reading_article(
        db,
        user_id,
        target_lang,
        cefr_level,
        &local_date,
        slot,
        &topic,
        &title,
        &body,
    )?;

    log::info!(
        "Reading article generated: id={} user={}",
        article_id,
        user_id
    );
    get_reading_article(db, article_id)
}

pub async fn regenerate_reading_article(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    article_id: i64,
    cefr_level: &str,
    native_lang: &str,
) -> Result<ReadingArticle, String> {
    let article = get_reading_article(db, article_id)?;
    let topic = pick_unused_topic(db, &article.user_id)?;
    log::info!(
        "Regenerating reading article id={} user={} topic={}",
        article_id,
        article.user_id,
        topic
    );

    let (title, body) = generate_article_via_llm(
        llm,
        db,
        &topic,
        &article.target_language,
        cefr_level,
        native_lang,
    )
    .await?;

    clear_article_test_data(db, article_id)?;
    update_reading_article_content(db, article_id, &topic, &title, &body, cefr_level)?;

    log::info!("Reading article regenerated: id={}", article_id);
    get_reading_article(db, article_id)
}

pub async fn get_or_generate_reading_test(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    article_id: i64,
    target_lang: &str,
    cefr_level: &str,
) -> Result<Vec<ReadingQuestion>, String> {
    let conn = db.conn()?;
    let cached: Option<String> = conn
        .query_row(
            "SELECT questions_json FROM reading_tests WHERE article_id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .ok();

    if let Some(json) = cached {
        let questions: Vec<ReadingQuestion> = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse cached questions: {}", e))?;
        return normalize_reading_questions(questions);
    }
    drop(conn);

    let article = get_reading_article(db, article_id)?;
    let questions = generate_test_via_llm(llm, db, &article.body, target_lang, cefr_level).await?;
    let questions_json = serde_json::to_string(&questions)
        .map_err(|e| format!("Failed to serialize questions: {}", e))?;

    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO reading_tests (article_id, questions_json) VALUES (?1, ?2)",
        params![article_id, questions_json],
    )
    .map_err(|e| format!("Failed to cache questions: {}", e))?;

    Ok(questions)
}

pub async fn explain_reading_answer(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    article_id: i64,
    question_index: usize,
    question_json: &str,
    user_answer: &str,
    correct_answer: &str,
    _target_lang: &str,
    native_lang: &str,
) -> Result<String, String> {
    let conn = db.conn()?;
    let explanations_json: String = conn
        .query_row(
            "SELECT COALESCE(explanations_json, '[]') FROM reading_tests WHERE article_id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());

    let mut explanations: Vec<String> =
        serde_json::from_str(&explanations_json).unwrap_or_default();
    while explanations.len() <= question_index {
        explanations.push(String::new());
    }
    if !explanations[question_index].is_empty() {
        return Ok(explanations[question_index].clone());
    }
    drop(conn);

    let q: ReadingQuestion =
        serde_json::from_str(question_json).map_err(|e| format!("Invalid question JSON: {}", e))?;
    let article = get_reading_article(db, article_id)?;

    let explanation = explain_answer_via_llm(
        llm,
        db,
        &article.body,
        &q.question,
        user_answer,
        correct_answer,
        native_lang,
    )
    .await?;

    explanations[question_index] = explanation.clone();
    let updated_json = serde_json::to_string(&explanations)
        .map_err(|e| format!("Failed to serialize explanations: {}", e))?;

    let conn = db.conn()?;
    conn.execute(
        "UPDATE reading_tests SET explanations_json = ?1 WHERE article_id = ?2",
        params![updated_json, article_id],
    )
    .ok();

    Ok(explanation)
}

pub fn get_reading_test_explanations(
    db: &DatabasePool,
    article_id: i64,
) -> Result<Vec<String>, String> {
    let conn = db.conn()?;
    let json: String = conn
        .query_row(
            "SELECT COALESCE(explanations_json, '[]') FROM reading_tests WHERE article_id = ?1",
            params![article_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "[]".to_string());
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse explanations: {}", e))
}

pub fn get_completed_reading_count(db: &DatabasePool, user_id: &str) -> Result<i32, String> {
    let conn = db.conn()?;
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM (
                 SELECT id FROM reading_history WHERE user_id = ?1 AND status = 'completed'
                 UNION ALL
                 SELECT id FROM reading_articles WHERE user_id = ?1 AND status = 'completed'
             )",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(count)
}

pub fn get_imported_articles(
    db: &DatabasePool,
    user_id: &str,
    target_language: &str,
) -> Result<Vec<ImportedArticle>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, target_language, source_type, source_url, source_id,
                    title, channel, duration_sec, audio_path, subtitles_json, cefr_level, created_at
             FROM imported_articles
             WHERE user_id = ?1 AND target_language = ?2
             ORDER BY id DESC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let articles = stmt
        .query_map(params![user_id, target_language], |row| {
            Ok(ImportedArticle {
                id: row.get(0)?,
                user_id: row.get(1)?,
                target_language: row.get(2)?,
                source_type: row.get(3)?,
                source_url: row.get(4)?,
                source_id: row.get(5)?,
                title: row.get(6)?,
                channel: row.get(7)?,
                duration_sec: row.get(8)?,
                audio_path: row.get(9)?,
                subtitles_json: row.get(10)?,
                cefr_level: row.get(11)?,
                created_at: row.get(12)?,
            })
        })
        .map_err(|e| format!("Query map error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(articles)
}

pub fn get_imported_article(db: &DatabasePool, id: i64) -> Result<ImportedArticle, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, user_id, target_language, source_type, source_url, source_id,
                title, channel, duration_sec, audio_path, subtitles_json, cefr_level, created_at
         FROM imported_articles WHERE id = ?1",
        params![id],
        |row| {
            Ok(ImportedArticle {
                id: row.get(0)?,
                user_id: row.get(1)?,
                target_language: row.get(2)?,
                source_type: row.get(3)?,
                source_url: row.get(4)?,
                source_id: row.get(5)?,
                title: row.get(6)?,
                channel: row.get(7)?,
                duration_sec: row.get(8)?,
                audio_path: row.get(9)?,
                subtitles_json: row.get(10)?,
                cefr_level: row.get(11)?,
                created_at: row.get(12)?,
            })
        },
    )
    .map_err(|e| format!("Imported article not found: {}", e))
}

pub fn delete_imported_article(db: &DatabasePool, id: i64) -> Result<Option<String>, String> {
    let conn = db.conn()?;
    let audio_path: Option<String> = conn
        .query_row(
            "SELECT audio_path FROM imported_articles WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Article not found: {}", e))?;

    conn.execute("DELETE FROM imported_articles WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete imported article: {}", e))?;

    Ok(audio_path)
}

pub fn save_imported_article(
    db: &DatabasePool,
    user_id: &str,
    target_language: &str,
    source_type: &str,
    source_url: &str,
    source_id: &str,
    title: &str,
    channel: Option<&str>,
    duration_sec: Option<i64>,
    audio_path: Option<&str>,
    subtitles_json: &str,
    cefr_level: Option<&str>,
) -> Result<i64, String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO imported_articles (
            user_id, target_language, source_type, source_url, source_id,
            title, channel, duration_sec, audio_path, subtitles_json, cefr_level
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            user_id,
            target_language,
            source_type,
            source_url,
            source_id,
            title,
            channel,
            duration_sec,
            audio_path,
            subtitles_json,
            cefr_level
        ],
    )
    .map_err(|e| format!("Failed to save imported article: {}", e))?;

    Ok(conn.last_insert_rowid())
}

pub fn archive_reading_article_to_history(
    db: &DatabasePool,
    article_id: i64,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO reading_history (
            user_id, target_language, cefr_level, local_date, slot, topic, title,
            status, test_correct_count, test_total_count, completed_at
         )
         SELECT user_id, target_language, cefr_level, local_date, slot, topic, title,
                CASE WHEN status = 'unread' THEN 'read' ELSE status END,
                test_correct_count, test_total_count, datetime('now')
         FROM reading_articles
         WHERE id = ?1",
        params![article_id],
    )
    .map_err(|e| format!("Failed to archive reading article: {}", e))?;
    Ok(())
}

pub async fn generate_initial_reading_article(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    cefr_level: &str,
    native_lang: &str,
) -> Result<ReadingArticle, String> {
    let now = chrono::Local::now();
    let local_date = now.format("%Y-%m-%d").to_string();
    let hour: i32 = now.format("%H").to_string().parse().unwrap_or(0);
    let slot = determine_slot(hour);

    let topic = pick_unused_topic(db, user_id)?;
    let (title, body) =
        generate_article_via_llm(llm, db, &topic, target_lang, cefr_level, native_lang).await?;

    let new_id = save_reading_article(
        db,
        user_id,
        target_lang,
        cefr_level,
        &local_date,
        slot,
        &topic,
        &title,
        &body,
    )?;

    get_reading_article(db, new_id)
}

pub async fn finish_and_generate_next_reading_article(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    current_article_id: i64,
    cefr_level: &str,
    native_lang: &str,
) -> Result<ReadingArticle, String> {
    let current = get_reading_article(db, current_article_id)?;
    // 1. Archive current article to history
    archive_reading_article_to_history(db, current_article_id)?;

    // 2. Generate new article via LLM
    let now = chrono::Local::now();
    let local_date = now.format("%Y-%m-%d").to_string();
    let hour: i32 = now.format("%H").to_string().parse().unwrap_or(0);
    let slot = determine_slot(hour);

    let topic = pick_unused_topic(db, &current.user_id)?;
    let (title, body) = generate_article_via_llm(
        llm,
        db,
        &topic,
        &current.target_language,
        cefr_level,
        native_lang,
    )
    .await?;

    // 3. Save new article
    let new_id = save_reading_article(
        db,
        &current.user_id,
        &current.target_language,
        cefr_level,
        &local_date,
        slot,
        &topic,
        &title,
        &body,
    )?;

    // 4. Delete old article only after new one is successfully created and saved
    let conn = db.conn()?;
    conn.execute(
        "DELETE FROM reading_articles WHERE id = ?1",
        params![current_article_id],
    )
    .ok();

    get_reading_article(db, new_id)
}

// ── Imported Article Chapters & Courseware ─────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct GeneratedCoursewareResponse {
    #[serde(default)]
    chapter_title: Option<String>,
    slides: Vec<CoursewareSlide>,
}

fn parse_chapter_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ImportedArticleChapter> {
    let slides_json: String = row.get(9)?;
    let slides: Vec<CoursewareSlide> = serde_json::from_str(&slides_json).unwrap_or_default();
    let chapter_index: i64 = row.get(2)?;
    let start_para_idx: i64 = row.get(4)?;
    let end_para_idx: i64 = row.get(5)?;
    let viewed_pages: i64 = row.get(10)?;
    let total_pages: i64 = row.get(11)?;
    Ok(ImportedArticleChapter {
        id: row.get(0)?,
        article_id: row.get(1)?,
        chapter_index: chapter_index.max(0) as usize,
        title: row.get(3)?,
        start_para_idx: start_para_idx.max(0) as usize,
        end_para_idx: end_para_idx.max(0) as usize,
        start_sec: row.get(6)?,
        end_sec: row.get(7)?,
        courseware_status: row.get(8)?,
        slides,
        viewed_pages: viewed_pages.max(0) as usize,
        total_pages: total_pages.max(0) as usize,
        error_message: row.get(12)?,
    })
}

pub fn save_imported_article_chapters(
    db: &DatabasePool,
    article_id: i64,
    chapters: &[ImportedChapterDraft],
) -> Result<Vec<ImportedArticleChapter>, String> {
    let conn = db.conn()?;
    for ch in chapters {
        conn.execute(
            "INSERT OR REPLACE INTO imported_article_chapters (
                article_id, chapter_index, title, start_para_idx, end_para_idx,
                start_sec, end_sec, courseware_status, slides_json, viewed_pages, total_pages
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', '[]', 0, 0)",
            params![
                article_id,
                ch.chapter_index as i64,
                ch.title,
                ch.start_para_idx as i64,
                ch.end_para_idx as i64,
                ch.start_sec,
                ch.end_sec,
            ],
        )
        .map_err(|e| format!("Failed to save chapter {}: {}", ch.chapter_index, e))?;
    }
    drop(conn);
    get_imported_article_chapters(db, article_id)
}

pub fn get_imported_article_chapters(
    db: &DatabasePool,
    article_id: i64,
) -> Result<Vec<ImportedArticleChapter>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, article_id, chapter_index, title, start_para_idx, end_para_idx,
                    start_sec, end_sec, courseware_status, slides_json, viewed_pages, total_pages, error_message
             FROM imported_article_chapters
             WHERE article_id = ?1
             ORDER BY chapter_index ASC",
        )
        .map_err(|e| format!("Failed to query chapters: {}", e))?;

    let rows = stmt
        .query_map(params![article_id], parse_chapter_row)
        .map_err(|e| format!("Failed to map chapters: {}", e))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

pub fn get_imported_article_chapter(
    db: &DatabasePool,
    chapter_id: i64,
) -> Result<ImportedArticleChapter, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, article_id, chapter_index, title, start_para_idx, end_para_idx,
                start_sec, end_sec, courseware_status, slides_json, viewed_pages, total_pages, error_message
         FROM imported_article_chapters
         WHERE id = ?1",
        params![chapter_id],
        parse_chapter_row,
    )
    .map_err(|e| format!("Chapter not found: {}", e))
}

pub fn update_chapter_courseware_progress(
    db: &DatabasePool,
    chapter_id: i64,
    viewed_pages: usize,
) -> Result<ImportedArticleChapter, String> {
    let current = get_imported_article_chapter(db, chapter_id)?;
    let clamped = if current.total_pages > 0 {
        viewed_pages.min(current.total_pages)
    } else {
        viewed_pages
    };
    let next_viewed = current.viewed_pages.max(clamped);

    let conn = db.conn()?;
    conn.execute(
        "UPDATE imported_article_chapters
         SET viewed_pages = ?1, updated_at = datetime('now')
         WHERE id = ?2",
        params![next_viewed as i64, chapter_id],
    )
    .map_err(|e| format!("Failed to update courseware progress: {}", e))?;
    drop(conn);

    get_imported_article_chapter(db, chapter_id)
}

pub fn set_chapter_courseware_status(
    db: &DatabasePool,
    chapter_id: i64,
    status: &str,
    error_message: Option<&str>,
) -> Result<ImportedArticleChapter, String> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE imported_article_chapters
         SET courseware_status = ?1, error_message = ?2, updated_at = datetime('now')
         WHERE id = ?3",
        params![status, error_message, chapter_id],
    )
    .map_err(|e| format!("Failed to update chapter status: {}", e))?;
    drop(conn);
    get_imported_article_chapter(db, chapter_id)
}

fn escape_svg_xml(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    let count = s.chars().count();
    if count <= max_chars {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(max_chars.saturating_sub(1)).collect();
        t.push('…');
        t
    }
}

pub fn sanitize_or_fallback_slide_svg(slide: &CoursewareSlide) -> String {
    let trimmed = slide.svg.trim();
    if let (Some(start), Some(end)) = (trimmed.find("<svg"), trimmed.rfind("</svg>")) {
        if end > start {
            let candidate = &trimmed[start..end + 6];
            let lower = candidate.to_ascii_lowercase();
            if !lower.contains("<script")
                && !lower.contains("javascript:")
                && !lower.contains("onload=")
                && !lower.contains("onerror=")
                && candidate.len() >= 60
            {
                return candidate.to_string();
            }
        }
    }
    synthesize_fallback_slide_svg(slide)
}

pub fn synthesize_fallback_slide_svg(slide: &CoursewareSlide) -> String {
    let term = escape_svg_xml(&truncate_chars(&slide.term, 24));
    let meaning = escape_svg_xml(&truncate_chars(&slide.meaning, 26));
    let note = escape_svg_xml(&truncate_chars(
        if slide.explanation.trim().is_empty() {
            &slide.context_sentence
        } else {
            &slide.explanation
        },
        34,
    ));

    if slide.slide_type == "phrase" {
        format!(
            r##"<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgPhr" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#eef2ff"/>
      <stop offset="100%" stop-color="#e0e7ff"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" rx="16" fill="url(#bgPhr)"/>
  <g transform="translate(18, 26)">
    <rect width="116" height="92" rx="12" fill="#ffffff" stroke="#c7d2fe" stroke-width="1.5"/>
    <text x="58" y="26" text-anchor="middle" font-size="10" fill="#6366f1" font-weight="700">LITERAL / EXPRESSION</text>
    <text x="58" y="56" text-anchor="middle" font-size="13" fill="#1e1b4b" font-weight="700">{term}</text>
    <circle cx="58" cy="76" r="4" fill="#818cf8">
      <animate attributeName="r" values="3;6;3" dur="2.2s" repeatCount="indefinite"/>
    </circle>
  </g>
  <g transform="translate(142, 62)">
    <path d="M0 10 L28 10" stroke="#4f46e5" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 4">
      <animate attributeName="stroke-dashoffset" values="18;0" dur="1.2s" repeatCount="indefinite"/>
    </path>
    <polygon points="26,4 36,10 26,16" fill="#4f46e5">
      <animateTransform attributeName="transform" type="translate" values="0,0;4,0;0,0" dur="1.2s" repeatCount="indefinite"/>
    </polygon>
  </g>
  <g transform="translate(186, 26)">
    <rect width="116" height="92" rx="12" fill="#4f46e5"/>
    <text x="58" y="26" text-anchor="middle" font-size="10" fill="#c7d2fe" font-weight="700">CONTEXT MEANING</text>
    <text x="58" y="56" text-anchor="middle" font-size="13" fill="#ffffff" font-weight="700">{meaning}</text>
    <rect x="28" y="70" width="60" height="4" rx="2" fill="#a5b4fc">
      <animate attributeName="width" values="30;72;30" dur="2.4s" repeatCount="indefinite"/>
      <animate attributeName="x" values="43;22;43" dur="2.4s" repeatCount="indefinite"/>
    </rect>
  </g>
  <rect x="18" y="132" width="284" height="32" rx="8" fill="#ffffff" fill-opacity="0.85"/>
  <text x="160" y="152" text-anchor="middle" font-size="11" fill="#3730a3">{note}</text>
</svg>"##
        )
    } else {
        format!(
            r##"<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgVoc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ecfdf5"/>
      <stop offset="100%" stop-color="#d1fae5"/>
    </linearGradient>
  </defs>
  <rect width="320" height="180" rx="16" fill="url(#bgVoc)"/>
  <circle cx="72" cy="76" r="36" fill="#10b981" fill-opacity="0.15">
    <animate attributeName="r" values="32;42;32" dur="2.6s" repeatCount="indefinite"/>
  </circle>
  <g transform="translate(72, 76)">
    <circle cx="0" cy="0" r="24" fill="#10b981"/>
    <path d="M-8 -4 L8 -4 M-8 4 L4 4" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
    <animateTransform attributeName="transform" type="translate" values="72,76;72,70;72,76" dur="2.6s" repeatCount="indefinite"/>
  </g>
  <g transform="translate(126, 34)">
    <rect width="174" height="84" rx="14" fill="#ffffff" stroke="#a7f3d0" stroke-width="1.5"/>
    <text x="16" y="32" font-size="16" fill="#065f46" font-weight="800">{term}</text>
    <text x="16" y="58" font-size="13" fill="#047857" font-weight="600">{meaning}</text>
    <circle cx="154" cy="24" r="5" fill="#34d399">
      <animate attributeName="opacity" values="0.3;1;0.3" dur="1.8s" repeatCount="indefinite"/>
    </circle>
  </g>
  <rect x="20" y="132" width="280" height="32" rx="8" fill="#ffffff" fill-opacity="0.88"/>
  <text x="160" y="152" text-anchor="middle" font-size="11" fill="#065f46">{note}</text>
</svg>"##
        )
    }
}

fn parse_generated_courseware_json(raw: &str) -> Result<GeneratedCoursewareResponse, String> {
    let trimmed = raw.trim();
    let cleaned = if trimmed.starts_with("```") {
        let without_open = trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```JSON")
            .trim_start_matches("```");
        without_open.trim_end_matches("```").trim()
    } else {
        trimmed
    };

    if let Ok(parsed) = serde_json::from_str::<GeneratedCoursewareResponse>(cleaned) {
        if !parsed.slides.is_empty() {
            return Ok(parsed);
        }
    }

    if let (Some(start), Some(end)) = (cleaned.find('{'), cleaned.rfind('}')) {
        if end > start {
            let slice = &cleaned[start..=end];
            if let Ok(parsed) = serde_json::from_str::<GeneratedCoursewareResponse>(slice) {
                if !parsed.slides.is_empty() {
                    return Ok(parsed);
                }
            }
        }
    }

    if let (Some(start), Some(end)) = (cleaned.find('['), cleaned.rfind(']')) {
        if end > start {
            let slice = &cleaned[start..=end];
            if let Ok(slides) = serde_json::from_str::<Vec<CoursewareSlide>>(slice) {
                if !slides.is_empty() {
                    return Ok(GeneratedCoursewareResponse {
                        chapter_title: None,
                        slides,
                    });
                }
            }
        }
    }

    Err(format!(
        "无法解析课件 JSON 数据: {}",
        &cleaned[..cleaned.len().min(200)]
    ))
}

fn query_user_native_lang(db: &DatabasePool, user_id: &str) -> String {
    let Ok(conn) = db.conn() else {
        return "zh".to_string();
    };
    conn.query_row(
        "SELECT native_language FROM users WHERE id = ?1",
        params![user_id],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| "zh".to_string())
}

fn query_mastered_words_for_user(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
) -> Vec<String> {
    let Ok(conn) = db.conn() else {
        return Vec::new();
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT vb.word
         FROM user_vocab uv
         JOIN vocab_bank vb ON vb.id = uv.word_id
         WHERE uv.user_id = ?1 AND vb.language = ?2 AND uv.mastery >= 2
         LIMIT 200",
    ) else {
        return Vec::new();
    };
    let rows = match stmt.query_map(params![user_id, target_lang], |row| row.get::<_, String>(0)) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    };
    rows
}

pub async fn generate_chapter_courseware(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    chapter_id: i64,
) -> Result<ImportedArticleChapter, String> {
    let chapter = get_imported_article_chapter(db, chapter_id)?;
    let article = get_imported_article(db, chapter.article_id)?;
    let _ = set_chapter_courseware_status(db, chapter_id, "generating", None);

    let paragraphs: Vec<crate::modules::youtube::SubtitleParagraph> =
        serde_json::from_str(&article.subtitles_json).unwrap_or_default();

    if paragraphs.is_empty() || chapter.start_para_idx >= paragraphs.len() {
        let err_msg = "章节字幕段落为空，无法生成课件".to_string();
        let _ = set_chapter_courseware_status(db, chapter_id, "error", Some(&err_msg));
        return Err(err_msg);
    }

    let end_idx = chapter.end_para_idx.min(paragraphs.len() - 1);
    let chapter_paras = &paragraphs[chapter.start_para_idx..=end_idx];

    let mut numbered_transcript = String::new();
    for (offset, p) in chapter_paras.iter().enumerate() {
        let abs_idx = chapter.start_para_idx + offset;
        numbered_transcript.push_str(&format!("[P{}] {}\n", abs_idx, p.text.trim()));
    }

    let cefr = article.cefr_level.as_deref().unwrap_or("A2");
    let native_lang = query_user_native_lang(db, &article.user_id);
    let target_label = llm_mod::lang_name(&article.target_language);
    let native_label = llm_mod::lang_name(&native_lang);
    let mastered = query_mastered_words_for_user(db, &article.user_id, &article.target_language);
    let mastered_hint = if mastered.is_empty() {
        String::new()
    } else {
        format!(
            "\nAvoid selecting these words the learner has already mastered: {}.",
            mastered
                .iter()
                .take(60)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    let system_prompt = format!(
        "You are an expert language teacher and SVG motion designer creating a pre-reading & pre-listening interactive courseware for a {target_label} video chapter (learner level: CEFR {cefr}, native language: {native_label}).\n\
         Return ONLY valid JSON without markdown code fences."
    );

    let user_prompt = format!(
        "Analyze the following {target_label} video chapter transcript and create a 5 to 8 slide pre-study courseware so the learner can clear out (1) unfamiliar vocabulary and (2) difficult phrases/idioms/spoken expressions BEFORE reading and listening.\n\
         {mastered_hint}\n\
         Requirements:\n\
         1. Select 3 to 4 key unfamiliar vocabulary words (`slide_type`: \"vocab\") suitable for a CEFR {cefr} learner, followed by 2 to 4 difficult phrases, idioms, collocations, or colloquial expressions (`slide_type`: \"phrase\") from the transcript.\n\
         2. Explain `meaning`, `explanation`, and `context_translation` in {native_label}.\n\
            - For \"vocab\": `explanation` gives a vivid memory cue, collocation, or usage tip in {native_label}.\n\
            - For \"phrase\": `explanation` contrasts the literal word-by-word meaning with the actual contextual meaning in {native_label}.\n\
         3. `para_idx` MUST be the integer paragraph number from `[P<num>]` where the item appears.\n\
         4. For EACH slide, create a custom, vivid, self-contained animated SVG (`svg` field, `<svg viewBox='0 0 320 180' xmlns='http://www.w3.org/2000/svg'>...</svg>`):\n\
            - Use single quotes `'` for XML attributes inside `svg` so JSON remains valid.\n\
            - Smart style adaptation:\n\
              * Concrete vocabulary (`vocab`): Scene/Action micro-theater animation (场景/动作小剧场动画) with colorful flat-vector shapes, characters or objects, and continuous `<animate>` / `<animateTransform>` motion depicting the word's action or scene.\n\
              * Abstract words & phrases (`phrase`): Literal vs. Contextual visual contrast or step-by-step animated diagram (字面义 → 语境义视觉对比或分步图解动画) with cards, arrows, speech bubbles, and `<animate>` / `<animateTransform>` transitions.\n\
            - Keep each SVG concise (under 1100 characters), visually appealing, with readable labels and smooth infinite loop animations.\n\n\
         Output strict JSON format:\n\
         {{\n\
           \"chapter_title\": \"<short 2-5 word topic summary in {native_label}>\",\n\
           \"slides\": [\n\
             {{\n\
               \"slide_type\": \"vocab\",\n\
               \"term\": \"...\",\n\
               \"lemma\": \"...\",\n\
               \"pos\": \"n./v./adj./phrase/idiom\",\n\
               \"pronunciation\": \"...\",\n\
               \"meaning\": \"...\",\n\
               \"explanation\": \"...\",\n\
               \"context_sentence\": \"...\",\n\
               \"context_translation\": \"...\",\n\
               \"para_idx\": {start_p},\n\
               \"svg\": \"<svg viewBox='0 0 320 180' xmlns='http://www.w3.org/2000/svg'>...</svg>\"\n\
             }}\n\
           ]\n\
         }}\n\n\
         Chapter Transcript:\n\
         {transcript}",
        start_p = chapter.start_para_idx,
        transcript = numbered_transcript
    );

    let messages = vec![
        llm_mod::ChatMessage {
            role: "system".to_string(),
            content: system_prompt,
        },
        llm_mod::ChatMessage {
            role: "user".to_string(),
            content: user_prompt,
        },
    ];

    let raw_resp = match llm.chat_for_reading_content(db, messages).await {
        Ok(r) => r,
        Err(e) => {
            let _ = set_chapter_courseware_status(db, chapter_id, "error", Some(&e));
            return Err(e);
        }
    };

    let parsed = match parse_generated_courseware_json(&raw_resp) {
        Ok(p) => p,
        Err(e) => {
            let _ = set_chapter_courseware_status(db, chapter_id, "error", Some(&e));
            return Err(e);
        }
    };

    let mut finalized_slides: Vec<CoursewareSlide> = Vec::with_capacity(parsed.slides.len());
    for mut slide in parsed.slides.into_iter().take(10) {
        if slide.slide_type != "vocab" && slide.slide_type != "phrase" {
            slide.slide_type = "vocab".to_string();
        }
        // Match paragraph index and audio timestamps
        let matched_idx = slide
            .para_idx
            .filter(|&idx| idx >= chapter.start_para_idx && idx <= end_idx)
            .or_else(|| {
                let term_lower = slide.term.to_lowercase();
                chapter_paras
                    .iter()
                    .position(|p| p.text.to_lowercase().contains(&term_lower))
                    .map(|off| chapter.start_para_idx + off)
            })
            .unwrap_or(chapter.start_para_idx);

        slide.para_idx = Some(matched_idx);
        if let Some(p) = paragraphs.get(matched_idx) {
            slide.start_sec = Some(p.start);
            slide.end_sec = Some(p.end);
            if slide.context_sentence.trim().is_empty() {
                slide.context_sentence = p.text.clone();
            }
        }
        slide.svg = sanitize_or_fallback_slide_svg(&slide);
        finalized_slides.push(slide);
    }

    let updated_title = if let Some(ref sub_title) = parsed.chapter_title {
        let clean_sub = sub_title.trim();
        if !clean_sub.is_empty()
            && !chapter.title.contains('·')
            && (chapter.title.starts_with("Chapter ") || chapter.title.starts_with("第 "))
        {
            format!("{} · {}", chapter.title, clean_sub)
        } else {
            chapter.title.clone()
        }
    } else {
        chapter.title.clone()
    };

    let slides_json = serde_json::to_string(&finalized_slides)
        .map_err(|e| format!("Failed to serialize slides: {}", e))?;
    let total_pages = finalized_slides.len();

    let conn = db.conn()?;
    conn.execute(
        "UPDATE imported_article_chapters
         SET title = ?1, courseware_status = 'ready', slides_json = ?2,
             total_pages = ?3, error_message = NULL, updated_at = datetime('now')
         WHERE id = ?4",
        params![updated_title, slides_json, total_pages as i64, chapter_id],
    )
    .map_err(|e| format!("Failed to save chapter courseware: {}", e))?;
    drop(conn);

    get_imported_article_chapter(db, chapter_id)
}

// Archived with the card UI; retained for the internal rollback path.
#[allow(dead_code)]
pub fn spawn_article_courseware_generation(
    app: tauri::AppHandle,
    db: DatabasePool,
    llm: llm_mod::LlmClient,
    article_id: i64,
) {
    use tauri::Emitter;
    tauri::async_runtime::spawn(async move {
        let Ok(chapters) = get_imported_article_chapters(&db, article_id) else {
            return;
        };
        for ch in chapters {
            if ch.courseware_status == "ready" {
                continue;
            }
            if let Ok(gen_state) = set_chapter_courseware_status(&db, ch.id, "generating", None) {
                let _ = app.emit("chapter-courseware-updated", gen_state);
            }
            match generate_chapter_courseware(&llm, &db, ch.id).await {
                Ok(ready_chapter) => {
                    let _ = app.emit("chapter-courseware-updated", ready_chapter);
                }
                Err(err) => {
                    log::warn!(
                        "Failed to generate courseware for chapter {} (article {}): {}",
                        ch.id,
                        article_id,
                        err
                    );
                    if let Ok(err_chapter) = get_imported_article_chapter(&db, ch.id) {
                        let _ = app.emit("chapter-courseware-updated", err_chapter);
                    }
                }
            }
        }
    });
}
