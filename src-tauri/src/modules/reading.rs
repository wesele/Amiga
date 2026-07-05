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
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [],
        ).ok();
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
    fn test_save_and_get_article() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        let aid = save_reading_article(
            &pool, "u1", "es", "A2", "2025-07-05", "AM", "Test topic",
            "Test Title", "Test body content here",
        ).unwrap();

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
            &pool, "u1", "es", "A2", "2025-07-05", "AM", "Topic", "Title", "Body",
        ).unwrap();
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
            &pool, "u1", "es", "A2", "2025-07-05", "AM", "Topic", "Title", "Body",
        ).unwrap();
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
            &pool, "u1", "es", "A2", "2025-07-04", "AM", "Topic A", "Old", "Body",
        ).unwrap();
        let a2 = save_reading_article(
            &pool, "u1", "es", "A2", "2025-07-05", "AM", "Topic B", "New", "Body",
        ).unwrap();

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

        save_reading_article(&pool, "u1", "es", "A1", "2025-07-05", "AM", "T1", "ES", "Body").unwrap();
        save_reading_article(&pool, "u1", "en", "A1", "2025-07-05", "AM", "T2", "EN", "Body").unwrap();

        assert_eq!(get_reading_articles(&pool, "u1", "es").unwrap().len(), 1);
    }

    #[test]
    fn test_get_article_for_slot() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        insert_user(&conn);
        drop(conn);

        save_reading_article(
            &pool, "u1", "es", "A2", "2025-07-05", "AM", "Topic", "Title", "Body",
        ).unwrap();

        assert!(get_article_for_slot(&pool, "u1", "es", "2025-07-05", "AM").unwrap().is_some());
        assert!(get_article_for_slot(&pool, "u1", "es", "2025-07-05", "PM").unwrap().is_none());
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadingQuestion {
    pub question: String,
    pub options: Vec<String>,
    #[serde(rename = "correct")]
    pub correct_index: usize,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeneratedArticle {
    title: String,
    body: String,
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
            log::error!("Failed to get DB connection for ensure_default_topics: {}", e);
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
    if hour < 12 { "AM" } else { "PM" }
}

pub fn get_reading_articles(
    db: &DatabasePool,
    user_id: &str,
    target_language: &str,
) -> Result<Vec<ReadingArticle>, String> {
    let conn = db.conn()?;
    let mut stmt = conn.prepare(
        "SELECT id, user_id, target_language, cefr_level, local_date, slot,
                topic, title, body, status, test_correct_count, test_total_count, generated_at
         FROM reading_articles
         WHERE user_id = ?1 AND target_language = ?2
         ORDER BY local_date DESC, slot DESC, id DESC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let articles = stmt.query_map(params![user_id, target_language], |row| {
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
    }).map_err(|e| format!("Query map error: {}", e))?
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
        |row| Ok(ReadingArticle {
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
        }),
    ).map_err(|e| format!("Article not found: {}", e))
}

pub fn get_article_for_slot(
    db: &DatabasePool,
    user_id: &str,
    target_language: &str,
    local_date: &str,
    slot: &str,
) -> Result<Option<ReadingArticle>, String> {
    let conn = db.conn()?;
    let result = conn.query_row(
        "SELECT id, user_id, target_language, cefr_level, local_date, slot,
                topic, title, body, status, test_correct_count, test_total_count, generated_at
         FROM reading_articles
         WHERE user_id = ?1 AND target_language = ?2 AND local_date = ?3 AND slot = ?4",
        params![user_id, target_language, local_date, slot],
        |row| Ok(ReadingArticle {
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
        }),
    ).ok();
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
        params![user_id, target_language, cefr_level, local_date, slot, topic, title, body],
    ).map_err(|e| format!("Failed to save reading article: {}", e))?;
    Ok(conn.last_insert_rowid())
}

pub fn mark_article_read(db: &DatabasePool, article_id: i64) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE reading_articles SET status = 'read' WHERE id = ?1 AND status = 'unread'",
        params![article_id],
    ).map_err(|e| format!("Failed to mark article read: {}", e))?;
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
    ).map_err(|e| format!("Failed to update article after test: {}", e))?;

    log::info!("Reading test submitted: article={} user={} score={}/{}", article_id, user_id, correct_count, total_count);
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
    ).or_else(|_| {
        conn.query_row(
            "SELECT topic FROM reading_topics WHERE enabled = 1 ORDER BY RANDOM() LIMIT 1",
            [],
            |row| row.get(0),
        ).map_err(|e| format!("No enabled reading topics: {}", e))
    })
}

// ── LLM generation ─────────────────────────────────────────────────

async fn generate_article_via_llm(
    llm: &llm_mod::LlmClient,
    db: &DatabasePool,
    topic: &str,
    target_lang: &str,
    cefr_level: &str,
    native_lang: &str,
) -> Result<(String, String), String> {
    let vars = [
        ("TARGET_LANG", target_lang),
        ("CEFR_LEVEL", cefr_level),
        ("TOPIC", topic),
        ("NATIVE_LANG", native_lang),
    ];

    let messages = crate::modules::llm::build_chat_messages(db, "generate-reading-article", &vars);
    let messages = if messages.is_empty() {
        let prompt = format!(
            "Generate a short reading passage in {target_lang} for a CEFR {cefr_level} language learner.\n\n\
             Topic: {topic}\nNative language: {native_lang}\n\n\
             Requirements:\n\
             1. Write 150-300 words in {target_lang}\n\
             2. Use vocabulary and grammar appropriate for CEFR {cefr_level}\n\
             3. The passage should be a natural conversation, story, or description about: {topic}\n\
             4. Include a short title (2-8 words)\n\n\
             Return strict JSON:\n{{\"title\": \"...\", \"body\": \"...\"}}"
        );
        crate::modules::llm::build_chat_messages_fallback(
            "You are a language learning content creator. Generate a short reading passage. Output only JSON, no extra prose.",
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

    let result: GeneratedArticle = serde_json::from_str(cleaned)
        .map_err(|e| format!("Failed to parse article JSON: {}. Raw: {}", e, response))?;
    Ok((result.title, result.body))
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
            "Based on the following {target_lang} reading passage, generate 10 multiple-choice questions.\n\n\
             Article: {body}\n\n\
             Requirements:\n\
             1. Each question tests comprehension of the article content\n\
             2. Each question has exactly ONE correct answer\n\
             3. Provide 4 options per question\n\
             4. Write questions and options in {target_lang}\n\
             5. Difficulty should match CEFR {cefr_level}\n\n\
             Return strict JSON array:\n\
             [\n  {{\"question\": \"...\", \"options\": [\"A\", \"B\", \"C\", \"D\"], \"correct\": 0}},\n  ...\n]"
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
    Ok(questions)
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
        log::info!("Reading article already exists for {}/{} {}", local_date, slot, user_id);
        return Ok(article);
    }

    let topic = pick_unused_topic(db, user_id)?;
    log::info!("Generating reading article for {}/{}: topic={}", local_date, slot, topic);

    let (title, body) = generate_article_via_llm(llm, db, &topic, target_lang, cefr_level, native_lang).await?;
    let article_id = save_reading_article(db, user_id, target_lang, cefr_level, &local_date, slot, &topic, &title, &body)?;

    log::info!("Reading article generated: id={} user={}", article_id, user_id);
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
        return serde_json::from_str(&json).map_err(|e| format!("Failed to parse cached questions: {}", e));
    }
    drop(conn);

    let article = get_reading_article(db, article_id)?;
    let questions = generate_test_via_llm(llm, db, &article.body, target_lang, cefr_level).await?;
    let questions_json = serde_json::to_string(&questions).map_err(|e| format!("Failed to serialize questions: {}", e))?;

    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO reading_tests (article_id, questions_json) VALUES (?1, ?2)",
        params![article_id, questions_json],
    ).map_err(|e| format!("Failed to cache questions: {}", e))?;

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

    let mut explanations: Vec<String> = serde_json::from_str(&explanations_json).unwrap_or_default();
    while explanations.len() <= question_index {
        explanations.push(String::new());
    }
    if !explanations[question_index].is_empty() {
        return Ok(explanations[question_index].clone());
    }
    drop(conn);

    let q: ReadingQuestion = serde_json::from_str(question_json)
        .map_err(|e| format!("Invalid question JSON: {}", e))?;
    let article = get_reading_article(db, article_id)?;

    let explanation = explain_answer_via_llm(
        llm, db, &article.body, &q.question, user_answer, correct_answer, native_lang,
    ).await?;

    explanations[question_index] = explanation.clone();
    let updated_json = serde_json::to_string(&explanations)
        .map_err(|e| format!("Failed to serialize explanations: {}", e))?;

    let conn = db.conn()?;
    conn.execute(
        "UPDATE reading_tests SET explanations_json = ?1 WHERE article_id = ?2",
        params![updated_json, article_id],
    ).ok();

    Ok(explanation)
}

pub fn get_reading_test_explanations(db: &DatabasePool, article_id: i64) -> Result<Vec<String>, String> {
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
