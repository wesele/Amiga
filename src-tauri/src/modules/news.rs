use crate::modules::database::DatabasePool;
use log;
use rusqlite::params;
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
                    for entry in feed.entries.iter().take(limit - raw_entries.len() as usize) {
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

    // Acquire DB connection
    let guard = match db.conn() {
        Ok(g) => g,
        Err(e) => {
            log::error!("DB pool error in fetch_news: {}", e);
            return Vec::new();
        }
    };

    // Delete old unread articles for this region only (preserve read articles + reading history)
    if let Err(e) = guard.execute(
        "DELETE FROM news_articles WHERE region = ?1 AND id NOT IN (SELECT DISTINCT article_id FROM news_reading_log)",
        params![region],
    ) {
        log::error!("Failed to clear old articles: {}", e);
        return Vec::new();
    }
    log::info!(
        "Cleared old unread articles for region {}, inserting {} new",
        region,
        raw_entries.len()
    );

    // Insert new articles
    let mut articles = Vec::new();
    for (title, summary, image_url, feed_source, r) in &raw_entries {
        match guard.execute(
            "INSERT INTO news_articles (original_title, original_body, source, image_url, region, hot_rank)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![title, summary, feed_source, image_url, region, r],
        ) {
            Ok(_) => {
                let id = guard.last_insert_rowid() as i32;
                articles.push(Article {
                    id: Some(id),
                    original_title: title.clone(),
                    original_body: Some(summary.clone()),
                    rewritten_body: None,
                    rewrite_level: None,
                    source: Some(feed_source.clone()),
                    image_url: image_url.clone(),
                    region: Some(region.to_string()),
                    hot_rank: Some(*r),
                    new_words: None,
                    fetched_at: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                });
            }
            Err(e) => {
                log::error!("Failed to insert article '{}': {}", title, e);
            }
        }
    }
    drop(guard);

    log::info!("Fetched {} articles for region {}", articles.len(), region);
    articles
}

/// Get cached articles
pub fn get_articles(db: &DatabasePool, region: &str) -> Result<Vec<Article>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, original_title, original_body, rewritten_body, rewrite_level,
                source, image_url, region, hot_rank, new_words, fetched_at
         FROM news_articles
         WHERE region = ?1 OR region IS NULL
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
    conn.execute(
        "INSERT INTO news_reading_log (user_id, article_id, words_looked_up, words_known, words_unknown, reading_time_sec, completed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            log_entry.user_id,
            log_entry.article_id,
            log_entry.words_looked_up,
            log_entry.words_known,
            log_entry.words_unknown,
            log_entry.reading_time_sec,
            log_entry.completed as i32,
        ],
    ).map_err(|e| format!("Failed to save reading log: {}", e))?;

    // Update streak record
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    conn.execute(
        "INSERT INTO streak_records (user_id, date, articles_read)
         VALUES (?1, ?2, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET articles_read = articles_read + 1",
        params![log_entry.user_id, today],
    )
    .ok();

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
