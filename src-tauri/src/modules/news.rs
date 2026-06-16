use rusqlite::params;
use serde::{Deserialize, Serialize};
use log;
use crate::modules::database::DatabasePool;

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

/// RSS feed sources by region
fn get_rss_feeds(region: &str, target_lang: &str) -> Vec<&'static str> {
    match (region, target_lang) {
        // Spanish news for various regions
        (_, "es") => vec![
            "https://feeds.bbci.co.uk/mundo/rss.xml",
            "https://rss.elpais.com/rss/tags/ultimas_noticias.xml",
        ],
        // Chinese news
        (_, "zh") => vec![
            "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml",
        ],
        // English news
        (_, "en") => vec![
            "https://feeds.bbci.co.uk/news/rss.xml",
        ],
        _ => vec![
            "https://feeds.bbci.co.uk/mundo/rss.xml",
        ],
    }
}

/// Fetch news from RSS feeds
pub async fn fetch_news(db: &DatabasePool, region: &str, target_lang: &str) -> Result<Vec<Article>, String> {
    let feeds = get_rss_feeds(region, target_lang);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Idioma/0.1 (Language Learning App)")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut articles = Vec::new();
    let mut rank = 1i32;

    for feed_url in &feeds {
        if articles.len() >= 3 {
            break;
        }

        log::info!("Fetching RSS: {}", feed_url);

        match client.get(*feed_url).send().await {
            Ok(response) => {
                let body = response.text().await.unwrap_or_default();
                match feed_rs::parser::parse(body.as_bytes()) {
                    Ok(feed) => {
                        for entry in feed.entries.iter().take(3 - articles.len() as usize) {
                            let title = entry.title.as_ref()
                                .map(|t| t.content.clone())
                                .unwrap_or_else(|| "Untitled".to_string());

                            // Check if already exists
                            let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
                            let exists: bool = conn
                                .query_row(
                                    "SELECT COUNT(*) > 0 FROM news_articles WHERE original_title = ?1",
                                    params![title],
                                    |row| row.get(0),
                                )
                                .unwrap_or(false);

                            if exists {
                                log::debug!("Article already exists: {}", title);
                                continue;
                            }

                            let summary = entry.summary.as_ref()
                                .map(|s| s.content.clone())
                                .or_else(|| entry.content.as_ref().and_then(|c| c.body.clone()))
                                .unwrap_or_default();

                            let image_url = entry.media.iter()
                                .filter_map(|m| m.thumbnails.first())
                                .map(|t| t.image.uri.to_string())
                                .next();

                            conn.execute(
                                "INSERT INTO news_articles (original_title, original_body, source, image_url, region, hot_rank)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                                params![
                                    title,
                                    summary,
                                    feed_url,
                                    image_url,
                                    region,
                                    rank,
                                ],
                            ).map_err(|e| format!("Failed to insert article: {}", e))?;

                            let id = conn.last_insert_rowid() as i32;

                            articles.push(Article {
                                id: Some(id),
                                original_title: title,
                                original_body: Some(summary),
                                rewritten_body: None,
                                rewrite_level: None,
                                source: Some(feed_url.to_string()),
                                image_url,
                                region: Some(region.to_string()),
                                hot_rank: Some(rank),
                                new_words: None,
                                fetched_at: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                            });

                            rank += 1;
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to parse RSS from {}: {}", feed_url, e);
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to fetch RSS from {}: {}", feed_url, e);
            }
        }
    }

    // If no articles from RSS, insert sample data for demo
    if articles.is_empty() {
        log::info!("No RSS articles fetched, inserting sample data");
        let samples = get_sample_articles(region);
        let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;

        for (i, sample) in samples.iter().enumerate() {
            let exists: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM news_articles WHERE original_title = ?1",
                    params![sample.original_title],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !exists {
                conn.execute(
                    "INSERT INTO news_articles (original_title, original_body, source, region, hot_rank)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        sample.original_title,
                        sample.original_body,
                        "sample",
                        region,
                        (i as i32 + 1),
                    ],
                ).map_err(|e| format!("Failed to insert sample: {}", e))?;

                let id = conn.last_insert_rowid() as i32;
                articles.push(Article {
                    id: Some(id),
                    ..sample.clone()
                });
            }
        }
    }

    // Clean up articles older than 7 days
    let conn = db.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
    conn.execute(
        "DELETE FROM news_articles WHERE fetched_at < datetime('now', '-7 days')",
        [],
    ).ok();

    log::info!("Fetched {} articles for region {}", articles.len(), region);
    Ok(articles)
}

/// Get cached articles
pub fn get_articles(db: &DatabasePool, region: &str) -> Result<Vec<Article>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn.prepare(
        "SELECT id, original_title, original_body, rewritten_body, rewrite_level,
                source, image_url, region, hot_rank, new_words, fetched_at
         FROM news_articles
         WHERE region = ?1 OR region IS NULL
         ORDER BY hot_rank ASC, fetched_at DESC
         LIMIT 10"
    ).map_err(|e| format!("Query error: {}", e))?;

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
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
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
    ).map_err(|e| format!("Article not found: {}", e))
}

/// Save rewritten article body
pub fn save_rewritten_article(
    db: &DatabasePool,
    article_id: i32,
    rewritten_body: &str,
    level: &str,
    new_words_json: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "UPDATE news_articles SET rewritten_body = ?1, rewrite_level = ?2, new_words = ?3 WHERE id = ?4",
        params![rewritten_body, level, new_words_json, article_id],
    ).map_err(|e| format!("Failed to save rewritten article: {}", e))?;
    log::info!("Article {} rewritten at level {}", article_id, level);
    Ok(())
}

/// Save reading log
pub fn save_reading_log(db: &DatabasePool, log_entry: &ReadingLog) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
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
    ).ok();

    log::info!("Reading log saved: user={} article={}", log_entry.user_id, log_entry.article_id);
    Ok(())
}

/// Get bilingual cache for an article
pub fn get_bilingual_cache(db: &DatabasePool, article_id: i32) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let result = conn.query_row(
        "SELECT bilingual_cache FROM news_articles WHERE id = ?1",
        params![article_id],
        |row| row.get(0),
    ).ok().flatten();
    Ok(result)
}

/// Save bilingual cache for an article
pub fn save_bilingual_cache(db: &DatabasePool, article_id: i32, cache_json: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute(
        "UPDATE news_articles SET bilingual_cache = ?1 WHERE id = ?2",
        params![cache_json, article_id],
    ).map_err(|e| format!("Failed to save bilingual cache: {}", e))?;
    log::debug!("Bilingual cache saved for article {}", article_id);
    Ok(())
}

/// Sample articles for demo when RSS fails
fn get_sample_articles(region: &str) -> Vec<Article> {
    vec![
        Article {
            id: None,
            original_title: "El gobierno anuncia nuevas medidas económicas".to_string(),
            original_body: Some("El gobierno de España anunció ayer un paquete de nuevas medidas económicas destinadas a impulsar el crecimiento y reducir el desempleo. Las medidas incluyen incentivos fiscales para pequeñas empresas, aumentos en el gasto público para infraestructura y programas de formación profesional para jóvenes. El ministro de Economía presentó el plan en una rueda de prensa en Madrid, destacando que estas iniciativas beneficiarán a millones de ciudadanos.".to_string()),
            rewritten_body: None,
            rewrite_level: None,
            source: Some("sample".to_string()),
            image_url: None,
            region: Some(region.to_string()),
            hot_rank: Some(1),
            new_words: None,
            fetched_at: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        },
        Article {
            id: None,
            original_title: "Descubren nueva especie en el Amazonas".to_string(),
            original_body: Some("Un equipo de científicos internacionales ha descubierto una nueva especie de rana en la selva amazónica de Perú. La rana, que mide apenas dos centímetros, tiene colores brillantes y un canto único. Los investigadores creen que esta especie podría ser clave para entender la biodiversidad de la región. El hallazgo fue publicado en la revista científica Nature.".to_string()),
            rewritten_body: None,
            rewrite_level: None,
            source: Some("sample".to_string()),
            image_url: None,
            region: Some(region.to_string()),
            hot_rank: Some(2),
            new_words: None,
            fetched_at: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        },
        Article {
            id: None,
            original_title: "El Real Madrid gana la Champions League".to_string(),
            original_body: Some("El Real Madrid conquistó su decimoquinta Liga de Campeones al vencer al Manchester City en la final disputada en el estadio de Wembley. El partido terminó 2-1 con goles de Vinícius Junior y Jude Bellingham. El entrenador Carlo Ancelotti celebró su quinto título de Champions, convirtiéndose en el técnico más exitoso en la historia de la competición.".to_string()),
            rewritten_body: None,
            rewrite_level: None,
            source: Some("sample".to_string()),
            image_url: None,
            region: Some(region.to_string()),
            hot_rank: Some(3),
            new_words: None,
            fetched_at: Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()),
        },
    ]
}
