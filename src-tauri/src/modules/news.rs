use crate::modules::database::DatabasePool;
use log;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    fn insert_test_article(conn: &Connection, title: &str, region: &str) -> i32 {
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, region, hot_rank)
             VALUES (?1, ?2, ?3, 1)",
            params![title, "Test body content for ", region],
        )
        .unwrap();
        conn.last_insert_rowid() as i32
    }

    #[test]
    fn test_get_articles_returns_empty_when_no_articles() {
        let pool = test_pool();
        let articles = get_articles(&pool, "world").unwrap();
        assert!(articles.is_empty());
    }

    #[test]
    fn test_get_article_not_found() {
        let pool = test_pool();
        let result = get_article(&pool, 999);
        assert!(result.is_err());
    }

    #[test]
    fn test_insert_and_get_article() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let id = insert_test_article(&conn, "Test Headline", "world");
        drop(conn);

        let article = get_article(&pool, id).unwrap();
        assert_eq!(article.original_title, "Test Headline");
        assert_eq!(article.id, Some(id));
    }

    #[test]
    fn test_get_articles_filters_by_region() {
        let pool = test_pool();
        {
            let conn = pool.conn().unwrap();
            insert_test_article(&conn, "World News", "world");
            insert_test_article(&conn, "Tech News", "tech");
            insert_test_article(&conn, "Sports News", "sports");
        }

        let world_articles = get_articles(&pool, "world").unwrap();
        assert!(world_articles
            .iter()
            .any(|a| a.region == Some("world".to_string())));

        let tech_articles = get_articles(&pool, "tech").unwrap();
        assert!(tech_articles
            .iter()
            .any(|a| a.region == Some("tech".to_string())));
    }

    #[test]
    fn test_get_articles_ignores_non_current_rows() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, source, region, hot_rank, is_current)
             VALUES ('Hidden News', 'Body', 'https://example.com/hidden', 'world', 1, 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, source, region, hot_rank, is_current)
             VALUES ('Visible News', 'Body', 'https://example.com/visible', 'world', 2, 1)",
            [],
        )
        .unwrap();
        drop(conn);

        let articles = get_articles(&pool, "world").unwrap();
        assert_eq!(articles.len(), 1);
        assert_eq!(articles[0].original_title, "Visible News");
    }

    #[test]
    fn test_comprehension_cache_round_trip() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let aid = insert_test_article(&conn, "Quiz Article", "world");
        drop(conn);

        let quiz_json = r#"{"questions":[{"id":"main-idea","kind":"main_idea","prompt_native":"主题？","options":[{"id":"a","text_native":"A"},{"id":"b","text_native":"B"},{"id":"c","text_native":"C"}],"correct_option_id":"b","evidence_sentence":"Test body content for","explanation_native":"解释"},{"id":"detail","kind":"detail","prompt_native":"细节？","options":[{"id":"a","text_native":"A"},{"id":"b","text_native":"B"},{"id":"c","text_native":"C"}],"correct_option_id":"a","evidence_sentence":"Test body content for","explanation_native":"解释2"}]}"#;
        save_comprehension_cache(&pool, aid, "A2", quiz_json).unwrap();
        let cached = get_comprehension_cache(&pool, aid, "A2").unwrap();
        assert_eq!(cached.as_deref(), Some(quiz_json));
        let quiz = parse_comprehension_quiz(quiz_json, true).unwrap();
        assert_eq!(quiz.questions.len(), 2);
        assert!(quiz.from_cache);
    }

    #[test]
    fn test_save_and_get_reading_log() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();

        // Create a user and an article
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let aid = insert_test_article(&conn, "Readable Article", "world");
        drop(conn);

        let log_entry = ReadingLog {
            user_id: "user-1".to_string(),
            article_id: aid,
            words_looked_up: Some(r#"["hola","mundo"]"#.to_string()),
            words_known: Some(r#"["sol"]"#.to_string()),
            words_unknown: Some(r#"["playa"]"#.to_string()),
            reading_time_sec: 120,
            completed: true,
            scroll_pct: 100,
            comprehension_score: None,
            comprehension_skipped: false,
            comprehension_answers_json: None,
        };

        save_reading_log(&pool, &log_entry).unwrap();

        let conn = pool.conn().unwrap();
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM news_reading_log", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_reading_log_updates_streak() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let aid = insert_test_article(&conn, "Streak Article", "world");
        drop(conn);

        let log_entry = ReadingLog {
            user_id: "user-1".to_string(),
            article_id: aid,
            words_looked_up: None,
            words_known: None,
            words_unknown: None,
            reading_time_sec: 60,
            completed: true,
            scroll_pct: 100,
            comprehension_score: None,
            comprehension_skipped: false,
            comprehension_answers_json: None,
        };
        save_reading_log(&pool, &log_entry).unwrap();

        let conn = pool.conn().unwrap();
        let articles_read: i32 = conn
            .query_row(
                "SELECT articles_read FROM streak_records WHERE user_id = 'user-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(articles_read, 1, "Streak should be incremented");
    }

    #[test]
    fn test_save_rewritten_article() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let aid = insert_test_article(&conn, "Rewrite Test", "world");
        drop(conn);

        save_rewritten_article(
            &pool,
            aid,
            "Rewritten body here",
            "A2",
            r#"["word1","word2"]"#,
        )
        .unwrap();

        let article = get_article(&pool, aid).unwrap();
        assert_eq!(
            article.rewritten_body,
            Some("Rewritten body here".to_string())
        );
        assert_eq!(article.rewrite_level, Some("A2".to_string()));
        assert_eq!(article.new_words, Some(r#"["word1","word2"]"#.to_string()));
    }

    #[test]
    fn test_bilingual_cache_roundtrip() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let aid = insert_test_article(&conn, "Bilingual Test", "world");
        drop(conn);

        // initially empty
        let cache = get_bilingual_cache(&pool, aid, "zh").unwrap();
        assert!(cache.is_none());

        // save and retrieve for one native language
        save_bilingual_cache(&pool, aid, "zh", r#"["你好世界","再见"]"#).unwrap();
        let cache = get_bilingual_cache(&pool, aid, "zh").unwrap();
        assert_eq!(cache, Some(r#"["你好世界","再见"]"#.to_string()));

        // the same article should have a separate slot for another native_lang
        assert!(get_bilingual_cache(&pool, aid, "en").unwrap().is_none());
        save_bilingual_cache(&pool, aid, "en", r#"["Hello world","Bye"]"#).unwrap();
        let en = get_bilingual_cache(&pool, aid, "en").unwrap();
        assert_eq!(en, Some(r#"["Hello world","Bye"]"#.to_string()));
        // zh slot is still its own value
        let zh = get_bilingual_cache(&pool, aid, "zh").unwrap();
        assert_eq!(zh, Some(r#"["你好世界","再见"]"#.to_string()));
    }

    #[test]
    fn test_get_read_article_count() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-r', 'Reader')",
            [],
        )
        .unwrap();
        let a1 = insert_test_article(&conn, "Read Count A", "world");
        let a2 = insert_test_article(&conn, "Read Count B", "world");
        let a3 = insert_test_article(&conn, "Read Count C", "world");
        drop(conn);

        // no reads yet
        assert_eq!(get_read_article_count(&pool, "user-r").unwrap(), 0);

        // first completed read of a1
        save_reading_log(
            &pool,
            &ReadingLog {
                user_id: "user-r".to_string(),
                article_id: a1,
                words_looked_up: None,
                words_known: None,
                words_unknown: None,
                reading_time_sec: 30,
                completed: true,
                scroll_pct: 100,
                comprehension_score: None,
                comprehension_skipped: false,
                comprehension_answers_json: None,
            },
        )
        .unwrap();
        assert_eq!(get_read_article_count(&pool, "user-r").unwrap(), 1);

        // re-read a1 (same article) — distinct count should stay 1
        std::thread::sleep(std::time::Duration::from_millis(5));
        save_reading_log(
            &pool,
            &ReadingLog {
                user_id: "user-r".to_string(),
                article_id: a1,
                words_looked_up: None,
                words_known: None,
                words_unknown: None,
                reading_time_sec: 25,
                completed: true,
                scroll_pct: 100,
                comprehension_score: None,
                comprehension_skipped: false,
                comprehension_answers_json: None,
            },
        )
        .unwrap();
        assert_eq!(get_read_article_count(&pool, "user-r").unwrap(), 1);

        // completed a2
        save_reading_log(
            &pool,
            &ReadingLog {
                user_id: "user-r".to_string(),
                article_id: a2,
                words_looked_up: None,
                words_known: None,
                words_unknown: None,
                reading_time_sec: 60,
                completed: true,
                scroll_pct: 100,
                comprehension_score: None,
                comprehension_skipped: false,
                comprehension_answers_json: None,
            },
        )
        .unwrap();
        assert_eq!(get_read_article_count(&pool, "user-r").unwrap(), 2);

        // non-completed read of a3 should not count
        save_reading_log(
            &pool,
            &ReadingLog {
                user_id: "user-r".to_string(),
                article_id: a3,
                words_looked_up: None,
                words_known: None,
                words_unknown: None,
                reading_time_sec: 5,
                completed: false,
                scroll_pct: 10,
                comprehension_score: None,
                comprehension_skipped: false,
                comprehension_answers_json: None,
            },
        )
        .unwrap();
        assert_eq!(get_read_article_count(&pool, "user-r").unwrap(), 2);

        // other user has no reads
        assert_eq!(get_read_article_count(&pool, "other-user").unwrap(), 0);
    }

    #[test]
    fn test_sync_refresh_hides_old_batch_and_upserts_current_rows() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Reader')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, source, region, hot_rank)
             VALUES ('Old title', 'Old body', 'https://example.com/a', 'ES', 1)",
            [],
        )
        .unwrap();
        let article_id = conn.last_insert_rowid() as i32;
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, reading_time_sec, completed)
             VALUES ('user-1', ?1, 60, 1)",
            params![article_id],
        )
        .unwrap();
        drop(conn);

        let synced = sync_articles(
            &pool,
            "ES",
            vec![(
                "Fresh title".to_string(),
                "Fresh body".to_string(),
                None,
                "https://example.com/a".to_string(),
                1,
            )],
        )
        .unwrap();

        assert_eq!(synced.len(), 1);
        assert_eq!(synced[0].id, Some(article_id));
        assert_eq!(synced[0].original_title, "Fresh title");

        let conn = pool.conn().unwrap();
        let stored: (i32, String, String, i32) = conn
            .query_row(
                "SELECT id, original_title, region, hot_rank
                 FROM news_articles
                 WHERE source = 'https://example.com/a'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(stored.0, article_id);
        assert_eq!(stored.1, "Fresh title");
        assert_eq!(stored.2, "ES");
        assert_eq!(stored.3, 1);
    }

    #[test]
    fn test_sync_refresh_marks_unread_stale_articles_not_current() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, source, region, hot_rank)
             VALUES ('Stale', 'Old body', 'https://example.com/stale', 'ES', 9)",
            [],
        )
        .unwrap();
        let stale_id = conn.last_insert_rowid() as i32;
        drop(conn);

        let synced = sync_articles(
            &pool,
            "ES",
            vec![(
                "Latest".to_string(),
                "Latest body".to_string(),
                None,
                "https://example.com/latest".to_string(),
                1,
            )],
        )
        .unwrap();

        assert_eq!(synced.len(), 1);

        let conn = pool.conn().unwrap();
        let stale_state: i32 = conn
            .query_row(
                "SELECT is_current FROM news_articles WHERE id = ?1",
                params![stale_id],
                |row| row.get(0),
            )
            .unwrap();
        let latest_state: i32 = conn
            .query_row(
                "SELECT is_current FROM news_articles WHERE source = 'https://example.com/latest'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stale_state, 0);
        assert_eq!(latest_state, 1);
    }

    #[test]
    fn test_get_articles_reading_status_empty_ids() {
        let pool = test_pool();
        let statuses = get_articles_reading_status(&pool, "user-1", &[]).unwrap();
        assert!(statuses.is_empty());
    }

    #[test]
    fn test_get_articles_reading_status_no_records() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let aid = insert_test_article(&conn, "Unread Article", "world");
        drop(conn);

        let statuses = get_articles_reading_status(&pool, "user-1", &[aid]).unwrap();
        assert!(statuses.is_empty());
    }

    #[test]
    fn test_get_articles_reading_status_uses_latest_log() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let aid = insert_test_article(&conn, "Re-read Article", "world");
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, words_unknown, reading_time_sec, completed, read_at)
             VALUES ('user-1', ?1, '[\"viejo\"]', 30, 1, '2026-01-01 10:00:00.000')",
            params![aid],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, words_unknown, words_known, reading_time_sec, completed, read_at)
             VALUES ('user-1', ?1, '[\"nuevo\",\"nuevo\"]', '[\"sol\"]', 45, 1, '2026-06-15 12:00:00.000')",
            params![aid],
        )
        .unwrap();
        drop(conn);

        let statuses = get_articles_reading_status(&pool, "user-1", &[aid]).unwrap();
        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].article_id, aid);
        assert_eq!(statuses[0].unknown_count, 1);
        assert_eq!(statuses[0].known_count, 1);
        assert_eq!(statuses[0].reading_time_sec, Some(45));
        assert_eq!(
            statuses[0].read_at.as_deref(),
            Some("2026-06-15 12:00:00.000")
        );
        assert!(!statuses[0].read_today);
        assert!(statuses[0].completed);
        assert_eq!(statuses[0].scroll_pct, 0);
        assert_eq!(
            statuses[0].words_unknown.as_deref(),
            Some("[\"nuevo\",\"nuevo\"]")
        );
    }

    #[test]
    fn test_get_articles_reading_status_returns_in_progress_fields() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let aid = insert_test_article(&conn, "Partial Read", "world");
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, reading_time_sec, completed, scroll_pct, read_at)
             VALUES ('user-1', ?1, 20, 0, 55, datetime('now'))",
            params![aid],
        )
        .unwrap();
        drop(conn);

        let statuses = get_articles_reading_status(&pool, "user-1", &[aid]).unwrap();
        assert_eq!(statuses.len(), 1);
        assert!(!statuses[0].completed);
        assert_eq!(statuses[0].scroll_pct, 55);
        assert!(!statuses[0].read_today);
    }

    #[test]
    fn test_count_unique_json_words_supports_object_entries() {
        let legacy = r#"["inflación","tasa"]"#;
        assert_eq!(count_unique_json_words(Some(legacy)), 2);

        let with_context = r#"[{"word":"inflación","context":"La inflación subió."},{"word":"tasa","context":"El banco subió la tasa."}]"#;
        assert_eq!(count_unique_json_words(Some(with_context)), 2);

        let mixed = r#"[{"word":"casa","context":"Mi casa."},"casa",{"word":"perro","context":"Un perro."}]"#;
        assert_eq!(count_unique_json_words(Some(mixed)), 2);
    }

    #[test]
    fn test_get_articles_reading_status_invalid_json_counts_zero() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let aid = insert_test_article(&conn, "Bad JSON Article", "world");
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, words_unknown, reading_time_sec, completed, read_at)
             VALUES ('user-1', ?1, 'not-json', 10, 1, datetime('now'))",
            params![aid],
        )
        .unwrap();
        drop(conn);

        let statuses = get_articles_reading_status(&pool, "user-1", &[aid]).unwrap();
        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].unknown_count, 0);
    }

    #[test]
    fn test_sync_refresh_clears_visible_batch_when_feed_returns_empty() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, source, region, hot_rank)
             VALUES ('Existing', 'Body', 'https://example.com/current', 'ES', 1)",
            [],
        )
        .unwrap();
        let existing_id = conn.last_insert_rowid() as i32;
        drop(conn);

        let synced = sync_articles(&pool, "ES", Vec::new()).unwrap();
        assert!(synced.is_empty());

        let conn = pool.conn().unwrap();
        let state: i32 = conn
            .query_row(
                "SELECT is_current FROM news_articles WHERE id = ?1",
                params![existing_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(state, 0);
        drop(conn);
        assert!(get_articles(&pool, "ES").unwrap().is_empty());
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Article {
    pub id: Option<i32>,
    pub original_title: String,
    pub original_body: Option<String>,
    pub rewritten_body: Option<String>,
    pub rewrite_level: Option<String>,
    pub source: Option<String>,
    pub image_url: Option<String>,
    pub region: Option<String>,
    pub hot_rank: Option<i32>,
    pub new_words: Option<String>,
    pub fetched_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArticleReadingStatus {
    pub article_id: i32,
    pub read_at: Option<String>,
    pub reading_time_sec: Option<i32>,
    pub unknown_count: i32,
    pub known_count: i32,
    pub read_today: bool,
    pub words_unknown: Option<String>,
    pub completed: bool,
    pub scroll_pct: i32,
}

#[derive(Debug, Deserialize)]
pub struct ReadingLog {
    pub user_id: String,
    pub article_id: i32,
    pub words_looked_up: Option<String>,
    pub words_known: Option<String>,
    pub words_unknown: Option<String>,
    pub reading_time_sec: i32,
    pub completed: bool,
    #[serde(default)]
    pub scroll_pct: i32,
    #[serde(default)]
    pub comprehension_score: Option<i32>,
    #[serde(default)]
    pub comprehension_skipped: bool,
    #[serde(default)]
    pub comprehension_answers_json: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ComprehensionQuiz {
    pub questions: Vec<crate::modules::llm::ComprehensionQuestion>,
    #[serde(default)]
    pub from_cache: bool,
}

/// RSS feed sources by region (target language → news language)
fn get_rss_feeds(region: &str, target_lang: &str) -> Vec<&'static str> {
    match (region, target_lang) {
        // Spanish news
        (_, "es") => vec![
            "https://www.rtve.es/rss/tag_noticias.xml",
            "https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml",
            "https://www.abc.es/rss/2.xml",
        ],
        // Chinese news
        (_, "zh") => vec![
            "https://www.chinadaily.com.cn/rss/world_rss.xml",
            "https://www.cgtn.com/subscribe.rss",
        ],
        // English news
        (_, "en") => vec![
            "https://feeds.npr.org/1001/rss.xml",
            "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
        ],
        _ => vec![
            "https://www.rtve.es/rss/tag_noticias.xml",
            "https://feeds.npr.org/1001/rss.xml",
        ],
    }
}

fn sync_articles(
    db: &DatabasePool,
    region: &str,
    raw_entries: Vec<(String, String, Option<String>, String, i32)>,
) -> Result<Vec<Article>, String> {
    let guard = db.conn()?;
    sync_articles_with_conn(&guard, region, &raw_entries)
}

fn sync_articles_with_conn(
    conn: &Connection,
    region: &str,
    raw_entries: &[(String, String, Option<String>, String, i32)],
) -> Result<Vec<Article>, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to start news sync transaction: {}", e))?;

    tx.execute(
        "UPDATE news_articles
         SET is_current = 0
         WHERE region = ?1",
        params![region],
    )
    .map_err(|e| format!("Failed to hide current articles: {}", e))?;

    log::info!(
        "Cleared visible articles for region {}, syncing {} entries",
        region,
        raw_entries.len()
    );

    if raw_entries.is_empty() {
        tx.commit()
            .map_err(|e| format!("Failed to commit empty news refresh: {}", e))?;
        log::warn!(
            "No RSS entries fetched for region {}, visible list cleared",
            region
        );
        return Ok(Vec::new());
    }

    let mut articles = Vec::new();
    for (title, summary, image_url, feed_source, rank) in raw_entries {
        tx.execute(
            "INSERT INTO news_articles (original_title, original_body, source, image_url, region, hot_rank, is_current)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
             ON CONFLICT(source) DO UPDATE SET
                 original_title = excluded.original_title,
                 original_body = excluded.original_body,
                 image_url = excluded.image_url,
                 region = excluded.region,
                 hot_rank = excluded.hot_rank,
                 is_current = 1,
                 fetched_at = datetime('now')",
            params![title, summary, feed_source, image_url, region, rank],
        )
        .map_err(|e| format!("Failed to upsert article '{}': {}", title, e))?;

        let article = tx
            .query_row(
                "SELECT id, original_title, original_body, rewritten_body, rewrite_level,
                        source, image_url, region, hot_rank, new_words, fetched_at
                 FROM news_articles
                 WHERE source = ?1",
                params![feed_source],
                |row| {
                    Ok(Article {
                        id: Some(row.get(0)?),
                        original_title: row.get(1)?,
                        original_body: row.get(2)?,
                        rewritten_body: row.get(3)?,
                        rewrite_level: row.get(4)?,
                        source: row.get(5)?,
                        image_url: row.get(6)?,
                        region: row.get(7)?,
                        hot_rank: row.get(8)?,
                        new_words: row.get(9)?,
                        fetched_at: row.get(10)?,
                    })
                },
            )
            .map_err(|e| format!("Failed to reload synced article '{}': {}", title, e))?;
        articles.push(article);
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit news sync transaction: {}", e))?;
    Ok(articles)
}

/// Fetch news from RSS feeds
pub async fn fetch_news(db: &DatabasePool, region: &str, target_lang: &str) -> Vec<Article> {
    let feeds = get_rss_feeds(region, target_lang);

    // Read configured article limit (default 5)
    let limit: usize = match db.conn() {
        Ok(guard) => {
            match guard.query_row(
                "SELECT value FROM app_settings WHERE key = 'news_fetch_limit'",
                [],
                |row| row.get::<_, String>(0),
            ) {
                Ok(v) => v.parse::<usize>().unwrap_or(5),
                Err(_) => 5,
            }
        }
        Err(e) => {
            log::warn!("DB pool error reading fetch limit: {}, using default 5", e);
            5
        }
    };
    log::info!("News fetch limit configured as {}", limit);

    // Build HTTP client
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Idioma/0.1 (Language Learning App)")
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to create HTTP client: {}", e);
            return Vec::new();
        }
    };

    // Collect raw article data from RSS (no DB lock needed yet)
    let mut raw_entries: Vec<(String, String, Option<String>, String, i32)> = Vec::new();
    let mut rank = 1i32;

    for feed_url in &feeds {
        if raw_entries.len() >= limit {
            break;
        }

        log::info!("Fetching RSS: {}", feed_url);

        if let Ok(response) = client.get(*feed_url).send().await {
            if response.status().is_success() {
                let body = response.text().await.unwrap_or_default();
                if let Ok(feed) = feed_rs::parser::parse(body.as_bytes()) {
                    for entry in feed.entries.iter().take(limit - raw_entries.len()) {
                        let title = entry
                            .title
                            .as_ref()
                            .map(|t| t.content.clone())
                            .unwrap_or_else(|| "Untitled".to_string());
                        let summary = entry
                            .summary
                            .as_ref()
                            .map(|s| s.content.clone())
                            .or_else(|| entry.content.as_ref().and_then(|c| c.body.clone()))
                            .unwrap_or_default();
                        let image_url = entry
                            .media
                            .iter()
                            .filter_map(|m| m.thumbnails.first())
                            .map(|t| t.image.uri.to_string())
                            .next();
                        let article_url = entry
                            .links
                            .first()
                            .map(|l| l.href.clone())
                            .unwrap_or_else(|| feed_url.to_string());
                        raw_entries.push((title, summary, image_url, article_url, rank));
                        rank += 1;
                    }
                } else {
                    log::warn!("Failed to parse RSS from {}", feed_url);
                }
            } else {
                log::warn!("RSS {} returned HTTP {}", feed_url, response.status());
            }
        } else {
            log::warn!("Failed to fetch RSS from {}", feed_url);
        }
    }

    match sync_articles(db, region, raw_entries) {
        Ok(articles) => {
            log::info!("Fetched {} articles for region {}", articles.len(), region);
            articles
        }
        Err(e) => {
            log::error!("Failed to sync articles for region {}: {}", region, e);
            Vec::new()
        }
    }
}

/// Get cached articles
pub fn get_articles(db: &DatabasePool, region: &str) -> Result<Vec<Article>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, original_title, original_body, rewritten_body, rewrite_level,
                source, image_url, region, hot_rank, new_words, fetched_at
         FROM news_articles
         WHERE (region = ?1 OR region IS NULL)
           AND COALESCE(is_current, 1) = 1
         ORDER BY hot_rank ASC, fetched_at DESC
         LIMIT 10",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let articles: Vec<Article> = stmt
        .query_map(params![region], |row| {
            Ok(Article {
                id: Some(row.get(0)?),
                original_title: row.get(1)?,
                original_body: row.get(2)?,
                rewritten_body: row.get(3)?,
                rewrite_level: row.get(4)?,
                source: row.get(5)?,
                image_url: row.get(6)?,
                region: row.get(7)?,
                hot_rank: row.get(8)?,
                new_words: row.get(9)?,
                fetched_at: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query articles: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(articles)
}

/// Get single article
pub fn get_article(db: &DatabasePool, article_id: i32) -> Result<Article, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, original_title, original_body, rewritten_body, rewrite_level,
                source, image_url, region, hot_rank, new_words, fetched_at
         FROM news_articles WHERE id = ?1",
        params![article_id],
        |row| {
            Ok(Article {
                id: Some(row.get(0)?),
                original_title: row.get(1)?,
                original_body: row.get(2)?,
                rewritten_body: row.get(3)?,
                rewrite_level: row.get(4)?,
                source: row.get(5)?,
                image_url: row.get(6)?,
                region: row.get(7)?,
                hot_rank: row.get(8)?,
                new_words: row.get(9)?,
                fetched_at: row.get(10)?,
            })
        },
    )
    .map_err(|e| format!("Article not found: {}", e))
}

/// Save rewritten article body
pub fn save_rewritten_article(
    db: &DatabasePool,
    article_id: i32,
    rewritten_body: &str,
    level: &str,
    new_words_json: &str,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "UPDATE news_articles SET rewritten_body = ?1, rewrite_level = ?2, new_words = ?3 WHERE id = ?4",
        params![rewritten_body, level, new_words_json, article_id],
    ).map_err(|e| format!("Failed to save rewritten article: {}", e))?;
    log::info!("Article {} rewritten at level {}", article_id, level);
    Ok(())
}

fn should_count_reading_for_streak(log_entry: &ReadingLog) -> bool {
    if log_entry.completed {
        return true;
    }
    if log_entry.scroll_pct < 50 {
        return false;
    }
    if log_entry.reading_time_sec >= 30 {
        return true;
    }
    count_unique_json_words(log_entry.words_unknown.as_deref()) > 0
        || count_unique_json_words(log_entry.words_known.as_deref()) > 0
        || count_unique_json_words(log_entry.words_looked_up.as_deref()) > 0
}

/// Save reading log
pub fn save_reading_log(db: &DatabasePool, log_entry: &ReadingLog) -> Result<(), String> {
    let conn = db.conn()?;
    let read_at = chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S%.3f")
        .to_string();
    conn.execute(
        "INSERT INTO news_reading_log (user_id, article_id, words_looked_up, words_known, words_unknown, reading_time_sec, completed, scroll_pct, comprehension_score, comprehension_skipped, comprehension_answers_json, read_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            log_entry.user_id,
            log_entry.article_id,
            log_entry.words_looked_up,
            log_entry.words_known,
            log_entry.words_unknown,
            log_entry.reading_time_sec,
            log_entry.completed as i32,
            log_entry.scroll_pct,
            log_entry.comprehension_score,
            log_entry.comprehension_skipped as i32,
            log_entry.comprehension_answers_json,
            read_at,
        ],
    ).map_err(|e| format!("Failed to save reading log: {}", e))?;

    drop(conn);
    if should_count_reading_for_streak(log_entry) {
        if let Err(e) = crate::modules::streak::record_article_read(db, &log_entry.user_id) {
            log::warn!("Failed to update streak for article read: {}", e);
        }
    }

    log::info!(
        "Reading log saved: user={} article={}",
        log_entry.user_id,
        log_entry.article_id
    );
    Ok(())
}

/// Get bilingual cache for an article, scoped to the user's native language.
/// Returns the cached paragraphs JSON if present.
pub fn get_bilingual_cache(
    db: &DatabasePool,
    article_id: i32,
    native_lang: &str,
) -> Result<Option<String>, String> {
    let conn = db.conn()?;
    let result = conn
        .query_row(
            "SELECT paragraphs_json FROM news_bilingual_cache
             WHERE article_id = ?1 AND native_lang = ?2",
            params![article_id, native_lang],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    Ok(result)
}

/// Save bilingual cache for an article, scoped to the user's native language.
/// Overwrites any existing row for the same (article_id, native_lang) pair.
pub fn save_bilingual_cache(
    db: &DatabasePool,
    article_id: i32,
    native_lang: &str,
    cache_json: &str,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO news_bilingual_cache (article_id, native_lang, paragraphs_json, fetched_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(article_id, native_lang) DO UPDATE SET
         paragraphs_json = excluded.paragraphs_json,
         fetched_at = datetime('now')",
        params![article_id, native_lang, cache_json],
    )
    .map_err(|e| format!("Failed to save bilingual cache: {}", e))?;
    log::debug!(
        "Bilingual cache saved for article {} (native_lang={})",
        article_id,
        native_lang
    );
    Ok(())
}

/// Rewrite an article for a user at the given CEFR level, using unknown vocab as new-word hints.
pub async fn rewrite_article_for_user(
    llm: &crate::modules::llm::LlmClient,
    db: &DatabasePool,
    article_id: i32,
    cefr_level: &str,
    user_id: &str,
    target_lang: &str,
) -> Result<Article, String> {
    use crate::modules::llm as llm_mod;
    use crate::modules::vocabulary as vocab_mod;

    let article = get_article(db, article_id)?;
    let original = article.original_body.unwrap_or_default();

    // Scoped to the article's target language so an English learner gets English words.
    let unknown_words = vocab_mod::get_unknown_words(db, user_id, cefr_level, 20, target_lang)?;
    let new_words: Vec<String> = unknown_words.iter().map(|w| w.word.clone()).collect();

    let result = llm_mod::rewrite_article(
        llm,
        db,
        &original,
        &article.original_title,
        cefr_level,
        &new_words,
        target_lang,
    )
    .await?;

    let new_words_json = serde_json::to_string(&result.new_words_used).unwrap_or_default();
    save_rewritten_article(
        db,
        article_id,
        &result.rewritten,
        cefr_level,
        &new_words_json,
    )?;

    get_article(db, article_id)
}

fn count_unique_json_words(json: Option<&str>) -> i32 {
    count_unique_json_word_list(json).len() as i32
}

fn count_unique_json_word_list(json: Option<&str>) -> Vec<String> {
    let Some(raw) = json else {
        return Vec::new();
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) else {
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    let mut seen = std::collections::HashSet::new();
    let mut words = Vec::new();
    for item in items {
        let word = if let Some(s) = item.as_str() {
            s.trim().to_string()
        } else if let Some(obj) = item.as_object() {
            obj.get("word")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .unwrap_or_default()
        } else {
            continue;
        };
        if word.is_empty() {
            continue;
        }
        let key = word.to_lowercase();
        if seen.insert(key) {
            words.push(word);
        }
    }
    words
}

fn is_read_today(read_at: &str) -> bool {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    read_at.starts_with(&today)
}

/// Batch reading status for a list of articles (latest log per article).
pub fn get_articles_reading_status(
    db: &DatabasePool,
    user_id: &str,
    article_ids: &[i32],
) -> Result<Vec<ArticleReadingStatus>, String> {
    if article_ids.is_empty() {
        return Ok(Vec::new());
    }

    let conn = db.conn()?;
    let placeholders: Vec<String> = (0..article_ids.len())
        .map(|i| format!("?{}", i + 2))
        .collect();
    let sql = format!(
        "SELECT l.article_id, l.words_unknown, l.words_known, l.reading_time_sec, l.read_at,
                l.completed, l.scroll_pct
         FROM news_reading_log l
         INNER JOIN (
             SELECT article_id, MAX(read_at) AS max_read_at
             FROM news_reading_log
             WHERE user_id = ?1 AND article_id IN ({})
             GROUP BY article_id
         ) latest ON l.article_id = latest.article_id AND l.read_at = latest.max_read_at
         WHERE l.user_id = ?1",
        placeholders.join(", ")
    );

    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(user_id.to_string())];
    for id in article_ids {
        params_vec.push(Box::new(*id));
    }
    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        params_vec.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query error: {}", e))?;

    let statuses: Vec<ArticleReadingStatus> = stmt
        .query_map(param_refs.as_slice(), |row| {
            let words_unknown: Option<String> = row.get(1)?;
            let words_known: Option<String> = row.get(2)?;
            let read_at: String = row.get(4)?;
            let completed: i32 = row.get(5)?;
            Ok(ArticleReadingStatus {
                article_id: row.get(0)?,
                read_at: Some(read_at.clone()),
                reading_time_sec: row.get(3)?,
                unknown_count: count_unique_json_words(words_unknown.as_deref()),
                known_count: count_unique_json_words(words_known.as_deref()),
                read_today: is_read_today(&read_at) && completed != 0,
                words_unknown,
                completed: completed != 0,
                scroll_pct: row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to query reading status: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(statuses)
}

pub fn get_comprehension_cache(
    db: &DatabasePool,
    article_id: i32,
    cefr_level: &str,
) -> Result<Option<String>, String> {
    let conn = db.conn()?;
    let row: Option<String> = conn
        .query_row(
            "SELECT questions_json FROM news_comprehension_cache
             WHERE article_id = ?1 AND cefr_level = ?2",
            params![article_id, cefr_level],
            |row| row.get(0),
        )
        .ok();
    Ok(row)
}

pub fn save_comprehension_cache(
    db: &DatabasePool,
    article_id: i32,
    cefr_level: &str,
    questions_json: &str,
) -> Result<(), String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO news_comprehension_cache (article_id, cefr_level, questions_json, generated_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(article_id, cefr_level) DO UPDATE SET
             questions_json = excluded.questions_json,
             generated_at = datetime('now')",
        params![article_id, cefr_level, questions_json],
    )
    .map_err(|e| format!("Failed to save comprehension cache: {}", e))?;
    Ok(())
}

fn parse_comprehension_quiz(json: &str, from_cache: bool) -> Result<ComprehensionQuiz, String> {
    let payload: crate::modules::llm::ComprehensionQuizPayload =
        serde_json::from_str(json).map_err(|e| format!("Invalid comprehension cache: {}", e))?;
    Ok(ComprehensionQuiz {
        questions: payload.questions,
        from_cache,
    })
}

/// Fetch cached comprehension quiz or generate via LLM. Returns None when unavailable.
pub async fn get_or_generate_comprehension_quiz(
    llm: &crate::modules::llm::LlmClient,
    db: &DatabasePool,
    article_id: i32,
    cefr_level: &str,
    native_lang: &str,
    target_lang: &str,
) -> Result<Option<ComprehensionQuiz>, String> {
    if let Some(cached) = get_comprehension_cache(db, article_id, cefr_level)? {
        return parse_comprehension_quiz(&cached, true).map(Some);
    }

    let article = get_article(db, article_id)?;
    let body = article
        .rewritten_body
        .as_deref()
        .or(article.original_body.as_deref())
        .unwrap_or("")
        .trim();
    if body.is_empty() {
        return Ok(None);
    }

    match crate::modules::llm::generate_reading_comprehension(
        llm,
        db,
        body,
        &article.original_title,
        cefr_level,
        native_lang,
        target_lang,
    )
    .await
    {
        Ok(payload) => {
            let json = serde_json::to_string(&payload)
                .map_err(|e| format!("Failed to serialize comprehension quiz: {}", e))?;
            save_comprehension_cache(db, article_id, cefr_level, &json)?;
            parse_comprehension_quiz(&json, false).map(Some)
        }
        Err(e) => {
            log::warn!(
                "Comprehension quiz generation failed for article {}: {}",
                article_id,
                e
            );
            Ok(None)
        }
    }
}

/// Count distinct articles a user has completed reading.
/// Re-reads of the same article count as one; non-completed reads are excluded.
pub fn get_read_article_count(db: &DatabasePool, user_id: &str) -> Result<i32, String> {
    let conn = db.conn()?;
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(DISTINCT article_id) FROM news_reading_log
             WHERE user_id = ?1 AND completed = 1",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(count)
}
