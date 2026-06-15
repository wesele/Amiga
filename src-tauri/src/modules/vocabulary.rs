use rusqlite::params;
use serde::{Deserialize, Serialize};
use log;
use crate::modules::database::DatabasePool;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VocabWord {
    pub id: i32,
    pub word: String,
    pub lemma: Option<String>,
    pub pos: Option<String>,
    pub cefr_level: String,
    pub language: String,
    pub definition_zh: Option<String>,
    pub definition_es: Option<String>,
    pub example: Option<String>,
    pub frequency: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VocabStats {
    pub total_known: i32,
    pub total_learning: i32,
    pub total_unknown: i32,
    pub total: i32,
}

/// Import vocabulary bank from embedded JSON
pub fn import_vocab_bank(db: &DatabasePool) -> Result<i32, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Check if already imported
    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM vocab_bank", [], |row| row.get(0))
        .unwrap_or(0);

    if count > 0 {
        log::info!("Vocab bank already imported ({} words), skipping", count);
        return Ok(count);
    }

    // Parse embedded vocabulary JSON
    let vocab_json: serde_json::Value = serde_json::from_str(include_str!("../../../content-studio/data/vocabulary.json"))
        .map_err(|e| format!("Failed to parse vocabulary JSON: {}", e))?;

    let mut total = 0i32;

    let data = vocab_json.get("data").ok_or("No 'data' field in vocabulary JSON")?;

    for (language, levels) in data.as_object().ok_or("Invalid data structure")? {
        let lang_code = match language.as_str() {
            "Espanol" => "es",
            "中文" => "zh",
            _ => language.as_str(),
        };

        for (level, words_str) in levels.as_object().ok_or("Invalid levels structure")? {
            let words_text = words_str.as_str().ok_or("Invalid words value")?;
            let words: Vec<&str> = words_text.split(',').map(|w| w.trim()).filter(|w| !w.is_empty()).collect();

            for (idx, word) in words.iter().enumerate() {
                conn.execute(
                    "INSERT OR IGNORE INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
                     VALUES (?1, ?2, NULL, ?3, ?4, ?5)",
                    params![word, word, level, lang_code, (words.len() as i32 - idx as i32)],
                ).map_err(|e| format!("Failed to insert vocab word '{}': {}", word, e))?;
                total += 1;
            }
            log::info!("Imported {} words for {} {}", words.len(), lang_code, level);
        }
    }

    log::info!("Vocabulary bank imported: {} total words", total);
    Ok(total)
}

/// Initialize user vocabulary based on CEFR level from wizard
pub fn init_user_vocab(db: &DatabasePool, user_id: &str, cefr_level: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Determine which levels to mark as known
    let levels: Vec<&str> = match cefr_level {
        "A1" => vec!["A1"],
        "A2" => vec!["A1", "A2"],
        "B1" => vec!["A1", "A2", "B1"],
        "B2" => vec!["A1", "A2", "B1", "B2"],
        "C1" => vec!["A1", "A2", "B1", "B2", "C1"],
        _ => vec![], // Zero-based: no pre-loaded words
    };

    if levels.is_empty() {
        log::info!("CEFR level is zero-based, no vocab initialization");
        return Ok(());
    }

    // Get all word IDs for these levels
    let placeholders: Vec<String> = levels.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
    let query = format!(
        "SELECT id FROM vocab_bank WHERE cefr_level IN ({})",
        placeholders.join(",")
    );

    let mut stmt = conn.prepare(&query).map_err(|e| format!("Query error: {}", e))?;
    let params_vec: Vec<&dyn rusqlite::types::ToSql> = levels.iter().map(|l| l as &dyn rusqlite::types::ToSql).collect();

    let word_ids: Vec<i32> = stmt
        .query_map(params_vec.as_slice(), |row| row.get(0))
        .map_err(|e| format!("Failed to query vocab words: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Batch insert user_vocab records
    for word_id in &word_ids {
        conn.execute(
            "INSERT OR REPLACE INTO user_vocab (user_id, word_id, mastery, source, updated_at)
             VALUES (?1, ?2, 2, 'wizard_init', datetime('now'))",
            params![user_id, word_id],
        ).map_err(|e| format!("Failed to insert user vocab: {}", e))?;
    }

    log::info!("Initialized {} words for user {} at level {:?}", word_ids.len(), user_id, levels);
    Ok(())
}

/// Update word mastery level
pub fn update_word_mastery(
    db: &DatabasePool,
    user_id: &str,
    word_id: i32,
    mastery: i32,
    source: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    conn.execute(
        "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(user_id, word_id) DO UPDATE SET
         mastery = ?3, source = ?4, updated_at = datetime('now')",
        params![user_id, word_id, mastery, source],
    ).map_err(|e| format!("Failed to update word mastery: {}", e))?;

    log::debug!("Word mastery updated: user={} word={} mastery={} source={}", user_id, word_id, mastery, source);
    Ok(())
}

/// Get unknown words for AI rewriting selection
pub fn get_unknown_words(
    db: &DatabasePool,
    user_id: &str,
    cefr_level: &str,
    limit: i32,
) -> Result<Vec<VocabWord>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT v.id, v.word, v.lemma, v.pos, v.cefr_level, v.language,
                v.definition_zh, v.definition_es, v.example, v.frequency
         FROM vocab_bank v
         LEFT JOIN user_vocab uv ON v.id = uv.word_id AND uv.user_id = ?1
         WHERE (uv.mastery IS NULL OR uv.mastery = 0)
           AND v.cefr_level <= ?2
           AND v.language = 'es'
         ORDER BY v.frequency DESC
         LIMIT ?3"
    ).map_err(|e| format!("Query error: {}", e))?;

    let words: Vec<VocabWord> = stmt
        .query_map(params![user_id, cefr_level, limit], |row| {
            Ok(VocabWord {
                id: row.get(0)?,
                word: row.get(1)?,
                lemma: row.get(2)?,
                pos: row.get(3)?,
                cefr_level: row.get(4)?,
                language: row.get(5)?,
                definition_zh: row.get(6)?,
                definition_es: row.get(7)?,
                example: row.get(8)?,
                frequency: row.get(9)?,
            })
        })
        .map_err(|e| format!("Failed to query unknown words: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(words)
}

/// Get vocabulary statistics for a user
pub fn get_user_vocab_stats(db: &DatabasePool, user_id: &str) -> Result<VocabStats, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let total: i32 = conn
        .query_row("SELECT COUNT(*) FROM vocab_bank WHERE language = 'es'", [], |row| row.get(0))
        .unwrap_or(0);

    let known: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1 AND mastery >= 2",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let learning: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1 AND mastery = 1",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let unknown: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1 AND mastery = 0",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(VocabStats {
        total_known: known,
        total_learning: learning,
        total_unknown: unknown,
        total,
    })
}
