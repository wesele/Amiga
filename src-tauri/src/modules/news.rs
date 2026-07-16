use crate::modules::database::DatabasePool;
use log;
use rusqlite::{params, Connection, Transaction};
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
            },
        )
        .unwrap();
        assert_eq!(get_read_article_count(&pool, "user-r").unwrap(), 1);

        // re-read a1 (same article) — distinct count should stay 1
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
            },
        )
        .unwrap();
        assert_eq!(get_read_article_count(&pool, "user-r").unwrap(), 1);
        let reread_log_count: i64 = pool
            .conn()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM news_reading_log WHERE user_id = ?1 AND article_id = ?2",
                params!["user-r", a1],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(reread_log_count, 2);

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

    #[test]
    fn test_sync_refresh_clears_ai_caches_when_no_new_articles() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO news_articles
                (original_title, original_body, rewritten_body, rewrite_level, new_words, source, region, hot_rank, is_current)
             VALUES
                ('Existing', 'Old body', 'Cached rewrite', 'A2', '[\"hola\"]', 'https://example.com/current', 'ES', 1, 1)",
            [],
        )
        .unwrap();
        let existing_id = conn.last_insert_rowid() as i32;
        conn.execute(
            "INSERT INTO news_bilingual_cache (article_id, native_lang, paragraphs_json)
             VALUES (?1, 'zh', '[\"缓存翻译\"]')",
            params![existing_id],
        )
        .unwrap();
        drop(conn);

        let synced = sync_articles(
            &pool,
            "ES",
            vec![(
                "Existing updated".to_string(),
                "New body".to_string(),
                None,
                "https://example.com/current".to_string(),
                1,
            )],
        )
        .unwrap();

        assert_eq!(synced.len(), 1);
        assert_eq!(synced[0].id, Some(existing_id));
        assert!(synced[0].rewritten_body.is_none());
        assert!(synced[0].rewrite_level.is_none());
        assert!(synced[0].new_words.is_none());

        let article = get_article(&pool, existing_id).unwrap();
        assert!(article.rewritten_body.is_none());
        assert!(article.rewrite_level.is_none());
        assert!(article.new_words.is_none());
        assert!(get_bilingual_cache(&pool, existing_id, "zh")
            .unwrap()
            .is_none());
    }

    fn insert_test_word(conn: &Connection, word: &str, lang: &str) -> i64 {
        conn.execute(
            "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
             VALUES (?1, ?2, 'noun', 'A1', ?3, 100)",
            params![word, word, lang],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn test_get_learning_days_zero_when_no_activity() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        drop(conn);
        assert_eq!(get_learning_days(&pool, "user-1").unwrap(), 0);
    }

    #[test]
    fn test_get_learning_days_counts_distinct_read_dates() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let aid = insert_test_article(&conn, "Article A", "world");
        let aid2 = insert_test_article(&conn, "Article B", "world");
        // Two articles read on the same day → counts as 1 day.
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, completed, read_at)
             VALUES ('user-1', ?1, 1, '2024-05-01 10:00:00')",
            params![aid],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, completed, read_at)
             VALUES ('user-1', ?1, 1, '2024-05-01 18:00:00')",
            params![aid2],
        )
        .unwrap();
        drop(conn);
        assert_eq!(get_learning_days(&pool, "user-1").unwrap(), 1);
    }

    #[test]
    fn test_get_learning_days_unions_reading_and_vocab_days() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let aid = insert_test_article(&conn, "Article A", "world");
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, completed, read_at)
             VALUES ('user-1', ?1, 1, '2024-05-01 10:00:00')",
            params![aid],
        )
        .unwrap();
        let w1 = insert_test_word(&conn, "hola", "es");
        let w2 = insert_test_word(&conn, "mundo", "es");
        // A word learned on a DIFFERENT day than the article read.
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
             VALUES ('user-1', ?1, 2, 'news_reading', '2024-05-02 09:00:00')",
            params![w1],
        )
        .unwrap();
        // A word learned on the SAME day as the article read → must not double-count.
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
             VALUES ('user-1', ?1, 1, 'news_reading', '2024-05-01 12:00:00')",
            params![w2],
        )
        .unwrap();
        drop(conn);
        assert_eq!(get_learning_days(&pool, "user-1").unwrap(), 2);
    }

    #[test]
    fn test_get_learning_days_ignores_wizard_init_and_unseen() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('user-1', 'Test')",
            [],
        )
        .unwrap();
        let w1 = insert_test_word(&conn, "hola", "es");
        let w2 = insert_test_word(&conn, "mundo", "es");
        // wizard_init mastery 2 should be ignored (bulk seed).
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
             VALUES ('user-1', ?1, 2, 'wizard_init', '2024-05-02 09:00:00')",
            params![w1],
        )
        .unwrap();
        // mastery 0 (unseen) should be ignored.
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
             VALUES ('user-1', ?1, 0, 'news_reading', '2024-05-03 09:00:00')",
            params![w2],
        )
        .unwrap();
        drop(conn);
        assert_eq!(get_learning_days(&pool, "user-1").unwrap(), 0);
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

#[derive(Debug, Deserialize)]
pub struct ReadingLog {
    pub user_id: String,
    pub article_id: i32,
    pub words_looked_up: Option<String>,
    pub words_known: Option<String>,
    pub words_unknown: Option<String>,
    pub reading_time_sec: i32,
    pub completed: bool,
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
    let mut has_new_articles = false;
    for (title, summary, image_url, feed_source, rank) in raw_entries {
        let existed = tx
            .query_row(
                "SELECT 1 FROM news_articles WHERE source = ?1 LIMIT 1",
                params![feed_source],
                |_| Ok(()),
            )
            .is_ok();
        if !existed {
            has_new_articles = true;
        }

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

    if !has_new_articles {
        clear_current_article_ai_caches(&tx, region)?;
        for article in &mut articles {
            article.rewritten_body = None;
            article.rewrite_level = None;
            article.new_words = None;
        }
        log::info!(
            "No new articles for region {}; cleared AI rewrite and bilingual caches",
            region
        );
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit news sync transaction: {}", e))?;
    Ok(articles)
}

fn clear_current_article_ai_caches(tx: &Transaction<'_>, region: &str) -> Result<(), String> {
    tx.execute(
        "UPDATE news_articles
         SET rewritten_body = NULL,
             rewrite_level = NULL,
             new_words = NULL
         WHERE region = ?1
           AND is_current = 1",
        params![region],
    )
    .map_err(|e| format!("Failed to clear article rewrite cache: {}", e))?;

    tx.execute(
        "DELETE FROM news_bilingual_cache
         WHERE article_id IN (
             SELECT id FROM news_articles
             WHERE region = ?1
               AND is_current = 1
         )",
        params![region],
    )
    .map_err(|e| format!("Failed to clear article bilingual cache: {}", e))?;

    Ok(())
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

/// Save reading log
pub fn save_reading_log(db: &DatabasePool, log_entry: &ReadingLog) -> Result<(), String> {
    let conn = db.conn()?;
    let read_at = chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S%.9f")
        .to_string();
    conn.execute(
        "INSERT INTO news_reading_log (user_id, article_id, words_looked_up, words_known, words_unknown, reading_time_sec, completed, read_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            log_entry.user_id,
            log_entry.article_id,
            log_entry.words_looked_up,
            log_entry.words_known,
            log_entry.words_unknown,
            log_entry.reading_time_sec,
            log_entry.completed as i32,
            read_at,
        ],
    ).map_err(|e| format!("Failed to save reading log: {}", e))?;

    // Update streak record
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    if let Err(e) = conn.execute(
        "INSERT INTO streak_records (user_id, date, articles_read)
         VALUES (?1, ?2, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET articles_read = articles_read + 1",
        params![log_entry.user_id, today],
    ) {
        log::warn!(
            "Failed to update streak record for user {}: {}",
            log_entry.user_id,
            e
        );
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

/// Count the total number of distinct days the user has learned anything.
/// A day counts as a learning day if the user read at least one article on that
/// day, or marked at least one word as known/learning (excluding the wizard's
/// initial bulk-insert seed records).
pub fn get_learning_days(db: &DatabasePool, user_id: &str) -> Result<i32, String> {
    let conn = db.conn()?;
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM (
                SELECT DISTINCT date(read_at) AS d FROM news_reading_log
                 WHERE user_id = ?1 AND read_at IS NOT NULL
                UNION
                SELECT DISTINCT date(updated_at) AS d FROM user_vocab
                 WHERE user_id = ?1
                   AND mastery >= 1
                   AND COALESCE(source, '') <> 'wizard_init'
            )",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(count)
}
