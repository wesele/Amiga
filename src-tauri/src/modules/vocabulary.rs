use crate::modules::database::DatabasePool;
use log;
use rusqlite::{params, types::ToSql};
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    fn create_test_user(conn: &Connection) -> String {
        let id = "test-user-id";
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES (?1, 'TestUser')",
            params![id],
        )
        .unwrap();
        id.to_string()
    }

    fn insert_test_word(conn: &Connection, word: &str, level: &str, lang: &str) -> i32 {
        conn.execute(
            "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
             VALUES (?1, ?2, 'noun', ?3, ?4, 100)",
            params![word, word, level, lang],
        )
        .unwrap();
        conn.last_insert_rowid() as i32
    }

    #[test]
    fn test_import_vocab_bank_returns_count() {
        let pool = test_pool();
        let result = import_vocab_bank(&pool);
        assert!(result.is_ok());
        let count = result.unwrap();
        assert!(count > 0, "Should import at least some vocab words");
    }

    #[test]
    fn test_import_vocab_bank_is_idempotent() {
        let pool = test_pool();
        let first = import_vocab_bank(&pool).unwrap();
        let second = import_vocab_bank(&pool).unwrap();
        // First call inserts new rows; second call inserts nothing because
        // the unique index turns INSERT OR IGNORE into a no-op.
        assert!(first > 0, "First import should insert rows");
        assert_eq!(second, 0, "Second import should insert 0 new rows");
    }

    #[test]
    fn test_import_vocab_bank_includes_all_three_languages() {
        let pool = test_pool();
        import_vocab_bank(&pool).unwrap();

        let conn = pool.conn().unwrap();
        let mut stmt = conn
            .prepare("SELECT language, COUNT(*) FROM vocab_bank GROUP BY language")
            .unwrap();
        let counts: std::collections::HashMap<String, i32> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
            })
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        // Every known language in vocabulary.json must end up under the
        // canonical short code (es/zh/en), not the localized label.
        assert!(
            counts.contains_key("es") && counts["es"] > 0,
            "Spanish (es) should be imported, got {:?}",
            counts
        );
        assert!(
            counts.contains_key("zh") && counts["zh"] > 0,
            "Chinese (zh) should be imported, got {:?}",
            counts
        );
        assert!(
            counts.contains_key("en") && counts["en"] > 0,
            "English (en) should be imported, got {:?}",
            counts
        );
        // No rows should be stored under the localized label.
        assert!(
            !counts.contains_key("Espanol")
                && !counts.contains_key("中文")
                && !counts.contains_key("English"),
            "Languages should be normalized to codes, got {:?}",
            counts
        );
    }

    #[test]
    fn test_import_vocab_bank_chinese_a1_present() {
        let pool = test_pool();
        import_vocab_bank(&pool).unwrap();

        let conn = pool.conn().unwrap();
        // 的 is the most common Chinese character; it must end up in zh A1.
        let present: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM vocab_bank WHERE word = '的' AND cefr_level = 'A1' AND language = 'zh'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(present, "Chinese A1 should include 的");
    }

    #[test]
    fn test_import_vocab_bank_english_a1_present() {
        let pool = test_pool();
        import_vocab_bank(&pool).unwrap();

        let conn = pool.conn().unwrap();
        // "the" is the most common English word; it must end up in en A1.
        let present: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM vocab_bank WHERE word = 'the' AND cefr_level = 'A1' AND language = 'en'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(present, "English A1 should include 'the'");
    }

    #[test]
    fn test_reimport_vocab_bank_wipes_then_refills() {
        let pool = test_pool();
        import_vocab_bank(&pool).unwrap();

        // Mutate the bank to confirm reimport really wipes it.
        let conn = pool.conn().unwrap();
        conn.execute("DELETE FROM user_vocab", []).unwrap();
        conn.execute(
            "INSERT INTO vocab_bank (word, lemma, cefr_level, language) VALUES ('zzz_test', 'zzz_test', 'A1', 'es')",
            [],
        ).unwrap();
        let before: i32 = conn
            .query_row("SELECT COUNT(*) FROM vocab_bank", [], |row| row.get(0))
            .unwrap();
        drop(conn);

        reimport_vocab_bank(&pool).unwrap();

        let conn = pool.conn().unwrap();
        let still_dirty: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM vocab_bank WHERE word = 'zzz_test'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!still_dirty, "Reimport should have removed the dirty row");
        let after: i32 = conn
            .query_row("SELECT COUNT(*) FROM vocab_bank", [], |row| row.get(0))
            .unwrap();
        assert!(after > 0, "Reimport should refill vocab_bank");
        assert!(
            after < before,
            "Reimport may drop custom rows but keep the JSON size"
        );
    }

    #[test]
    fn test_init_user_vocab_no_op_does_not_insert_records() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        insert_test_word(&conn, "hola", "A1", "es");
        drop(conn);

        init_user_vocab(&pool, &uid, "A1").unwrap();

        let conn = pool.conn().unwrap();
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_vocab uv
                 JOIN vocab_bank vb ON uv.word_id = vb.id
                 WHERE uv.user_id = ?1 AND vb.word = 'hola'",
                params![uid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 0,
            "No user_vocab record should exist (all words start as unseen)"
        );
    }

    #[test]
    fn test_init_user_vocab_empty_level() {
        let pool = test_pool();
        let result = init_user_vocab(&pool, "user-1", "");
        assert!(result.is_ok());
    }

    #[test]
    fn test_update_word_mastery_inserts_new_record() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let wid = insert_test_word(&conn, "adios", "A1", "es");
        drop(conn);

        update_word_mastery(&pool, &uid, wid, 1, "test").unwrap();

        let conn = pool.conn().unwrap();
        let mastery: i32 = conn
            .query_row(
                "SELECT mastery FROM user_vocab WHERE user_id = ?1 AND word_id = ?2",
                params![uid, wid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(mastery, 1);
    }

    #[test]
    fn test_update_word_mastery_updates_existing() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let wid = insert_test_word(&conn, "gracias", "A1", "es");
        drop(conn);

        update_word_mastery(&pool, &uid, wid, 1, "test").unwrap();
        update_word_mastery(&pool, &uid, wid, 2, "exercise").unwrap();

        let conn = pool.conn().unwrap();
        let mastery: i32 = conn
            .query_row(
                "SELECT mastery FROM user_vocab WHERE user_id = ?1 AND word_id = ?2",
                params![uid, wid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(mastery, 2);
    }

    #[test]
    fn test_get_unknown_words_returns_unmastered() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let known = insert_test_word(&conn, "casa", "A1", "es");
        let unknown = insert_test_word(&conn, "perro", "A1", "es");
        // An English word should be ignored when we filter to Spanish.
        let _en_word = insert_test_word(&conn, "house", "A1", "en");
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source)
             VALUES (?1, ?2, 2, 'init')",
            params![uid, known],
        )
        .unwrap();
        drop(conn);

        let words = get_unknown_words(&pool, &uid, "A2", 10, "es").unwrap();
        let ids: Vec<i32> = words.iter().map(|w| w.id).collect();
        assert!(
            !ids.contains(&known),
            "Known word should not appear in unknown"
        );
        assert!(
            ids.contains(&unknown),
            "Unmastered word should appear as unknown"
        );
        assert!(
            words.iter().all(|w| w.language == "es"),
            "Should only return words in the target language"
        );
    }

    #[test]
    fn test_get_unknown_words_respects_limit() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        for i in 0..5 {
            insert_test_word(&conn, &format!("word{}", i), "A1", "es");
        }
        drop(conn);

        let words = get_unknown_words(&pool, &uid, "A2", 3, "es").unwrap();
        assert!(words.len() <= 3, "Should return at most 3 words");
    }

    #[test]
    fn test_get_user_vocab_by_level_returns_all_level_words() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        insert_test_word(&conn, "hola", "A1", "es");
        insert_test_word(&conn, "adios", "A1", "es");
        insert_test_word(&conn, "casa", "A2", "es");
        drop(conn);

        let a1 = get_user_vocab_by_level(&pool, &uid, "es", "A1").unwrap();
        assert_eq!(a1.len(), 2);
        assert!(a1.iter().all(|w| w.cefr_level == "A1"));
    }

    #[test]
    fn test_get_user_vocab_by_level_mastery_status() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let wid = insert_test_word(&conn, "hola", "A1", "es");
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 2, 'test')",
            params![uid, wid],
        )
        .unwrap();
        drop(conn);

        let words = get_user_vocab_by_level(&pool, &uid, "es", "A1").unwrap();
        assert_eq!(words.len(), 1);
        assert_eq!(words[0].mastery, Some(2));
    }

    #[test]
    fn test_get_user_vocab_by_level_empty_language() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        insert_test_word(&conn, "hola", "A1", "es");
        drop(conn);

        let words = get_user_vocab_by_level(&pool, &uid, "fr", "A1").unwrap();
        assert!(words.is_empty(), "Should be empty for unknown language");
    }

    #[test]
    fn test_get_user_vocab_stats_by_level_groups_correctly() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let w1 = insert_test_word(&conn, "uno", "A1", "es");
        let w2 = insert_test_word(&conn, "dos", "A1", "es");
        let _w3 = insert_test_word(&conn, "tres", "A2", "es");

        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 2, 'test')",
            params![uid, w1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 1, 'test')",
            params![uid, w2],
        )
        .unwrap();
        // w3 has no user_vocab record → unseen
        drop(conn);

        let stats = get_user_vocab_stats_by_level(&pool, &uid, "es").unwrap();
        assert_eq!(stats.len(), 3, "Should have 3 levels (A1, A2, D)");

        let a1 = stats.iter().find(|s| s.level == "A1").unwrap();
        assert_eq!(a1.total, 2);
        assert_eq!(a1.mastered, 1);
        assert_eq!(a1.seen, 1);
        assert_eq!(a1.unseen, 0);

        let a2 = stats.iter().find(|s| s.level == "A2").unwrap();
        assert_eq!(a2.total, 1);
        assert_eq!(a2.unseen, 1);
        assert_eq!(a2.seen, 0);
        assert_eq!(a2.mastered, 0);
    }

    #[test]
    fn test_mark_words_seen_inserts_new_records() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let w1 = insert_test_word(&conn, "hola", "A1", "es");
        let w2 = insert_test_word(&conn, "adios", "A1", "es");
        drop(conn);

        mark_words_seen(&pool, &uid, &[w1, w2]).unwrap();

        let conn = pool.conn().unwrap();
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1 AND mastery = 1 AND source = 'news_reading'",
                params![uid],
                |row| row.get(0),
            ).unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_mark_words_seen_does_not_overwrite_existing() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let w1 = insert_test_word(&conn, "hola", "A1", "es");
        let w2 = insert_test_word(&conn, "adios", "A1", "es");

        // Pre-insert a known word (mastery=2)
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 2, 'wizard_init')",
            params![uid, w1],
        ).unwrap();
        drop(conn);

        mark_words_seen(&pool, &uid, &[w1, w2]).unwrap();

        let conn = pool.conn().unwrap();
        let m1: i32 = conn
            .query_row(
                "SELECT mastery FROM user_vocab WHERE user_id = ?1 AND word_id = ?2",
                params![uid, w1],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(m1, 2, "Existing mastery=2 should not be overwritten");

        let m2: i32 = conn
            .query_row(
                "SELECT mastery FROM user_vocab WHERE user_id = ?1 AND word_id = ?2",
                params![uid, w2],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(m2, 1, "New word should be marked as seen (mastery=1)");
    }

    #[test]
    fn test_mark_words_seen_empty_list() {
        let pool = test_pool();
        let result = mark_words_seen(&pool, "user-1", &[]);
        assert!(result.is_ok());
    }

    #[test]
    fn test_lookup_word_ids_finds_exact_matches() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let _w1 = insert_test_word(&conn, "hola", "A1", "es");
        let _w2 = insert_test_word(&conn, "adios", "A1", "es");
        drop(conn);

        let ids = lookup_word_ids(
            &pool,
            &[
                "hola".to_string(),
                "adios".to_string(),
                "unknown".to_string(),
            ],
            "es",
        )
        .unwrap();

        assert_eq!(ids.len(), 2, "Should find 2 of 3 words");
    }

    #[test]
    fn test_lookup_word_ids_case_insensitive() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let _w1 = insert_test_word(&conn, "Hola", "A1", "es");
        drop(conn);

        let ids = lookup_word_ids(&pool, &["hola".to_string()], "es").unwrap();
        assert_eq!(ids.len(), 1, "Should match case-insensitively");
    }

    #[test]
    fn test_get_user_vocab_stats() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let w1 = insert_test_word(&conn, "uno", "A1", "es");
        let w2 = insert_test_word(&conn, "dos", "A1", "es");
        let _w3 = insert_test_word(&conn, "tres", "A1", "es");
        // A French word should not count toward the Spanish total.
        let _fr = insert_test_word(&conn, "un", "A1", "fr");

        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 2, 'test')",
            params![uid, w1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 1, 'test')",
            params![uid, w2],
        )
        .unwrap();
        // w3 has no user_vocab record → unseen (not in known/learning counts)
        drop(conn);

        let stats = get_user_vocab_stats(&pool, &uid, "es").unwrap();
        assert_eq!(stats.total_known, 1);
        assert_eq!(stats.total_learning, 1);
        assert!(stats.total >= 3, "Should count at least 3 Spanish words");
    }

    #[test]
    fn test_add_discovered_word_creates_d_level_entry() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        drop(conn);

        let wid =
            add_discovered_word(&pool, &uid, "mariposa", "es", Some("la mariposa vuela")).unwrap();
        assert!(wid > 0);

        let conn = pool.conn().unwrap();
        let level: String = conn
            .query_row(
                "SELECT cefr_level FROM vocab_bank WHERE id = ?1",
                params![wid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(level, "D");

        let mastery: i32 = conn
            .query_row(
                "SELECT mastery FROM user_vocab WHERE user_id = ?1 AND word_id = ?2",
                params![uid, wid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(mastery, 1);
    }

    #[test]
    fn test_add_discovered_word_returns_existing_if_present() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let existing_wid = insert_test_word(&conn, "casa", "A1", "es");
        drop(conn);

        let wid = add_discovered_word(&pool, &uid, "casa", "es", None).unwrap();
        assert_eq!(
            wid, existing_wid,
            "Should return existing word ID, not create a new D entry"
        );
    }

    #[test]
    fn test_add_discovered_word_does_not_overwrite_existing_mastery() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let wid = insert_test_word(&conn, "hola", "A1", "es");
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 2, 'test')",
            params![uid, wid],
        )
        .unwrap();
        drop(conn);

        add_discovered_word(&pool, &uid, "hola", "es", None).unwrap();

        let conn = pool.conn().unwrap();
        let mastery: i32 = conn
            .query_row(
                "SELECT mastery FROM user_vocab WHERE user_id = ?1 AND word_id = ?2",
                params![uid, wid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(mastery, 2, "Existing mastery=2 should not be downgraded");
    }

    #[test]
    fn test_add_discovered_word_shows_in_d_level_stats() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        drop(conn);

        add_discovered_word(&pool, &uid, "mariposa", "es", None).unwrap();
        add_discovered_word(&pool, &uid, "libelula", "es", None).unwrap();

        let stats = get_user_vocab_stats_by_level(&pool, &uid, "es").unwrap();
        let d_stats = stats.iter().find(|s| s.level == "D");
        assert!(d_stats.is_some(), "D level should appear in stats");
        assert_eq!(d_stats.unwrap().total, 2);
        assert_eq!(d_stats.unwrap().seen, 2);
    }

    #[test]
    fn test_add_discovered_word_case_insensitive_duplicate() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        drop(conn);

        let w1 = add_discovered_word(&pool, &uid, "Mariposa", "es", None).unwrap();
        let w2 = add_discovered_word(&pool, &uid, "mariposa", "es", None).unwrap();
        assert_eq!(
            w1, w2,
            "Same word with different case should return same ID"
        );
    }

    #[test]
    fn test_ensure_words_seen_marks_existing_and_adds_new() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        insert_test_word(&conn, "hola", "A1", "es");
        insert_test_word(&conn, "gato", "A2", "es");
        drop(conn);

        ensure_words_seen(&pool, &uid, &["hola".into(), "gato".into()], "es").unwrap();

        let conn = pool.conn().unwrap();
        let seen_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1 AND mastery >= 1",
                params![uid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(seen_count, 2);
    }

    #[test]
    fn test_ensure_words_seen_adds_discovered_for_missing_words() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        insert_test_word(&conn, "hola", "A1", "es");
        drop(conn);

        ensure_words_seen(&pool, &uid, &["hola".into(), "desconocido".into()], "es").unwrap();

        let conn = pool.conn().unwrap();
        let d_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM vocab_bank WHERE cefr_level = 'D' AND language = 'es' AND LOWER(word) = LOWER('desconocido')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(d_count, 1);

        let seen_count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1 AND word_id IN (SELECT id FROM vocab_bank WHERE cefr_level = 'D')",
                params![uid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(seen_count, 1, "Discovered word should also be marked seen");
    }
}

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
    pub total: i32,
}

/// Import vocabulary bank from embedded JSON. Idempotent: uses
/// `INSERT OR IGNORE` against the `idx_vocab_bank_unique` index, so calling
/// this repeatedly only inserts words that aren't already present.
///
/// This is invoked on every startup so that updating the JSON source
/// (e.g. adding a new graded list) propagates to existing databases on the
/// next launch. The function tolerates new top-level language keys — any
/// language not in `language_label_to_code` is stored verbatim.
pub fn import_vocab_bank(db: &DatabasePool) -> Result<i32, String> {
    let conn = db.conn()?;

    // Parse embedded vocabulary JSON
    let vocab_json: serde_json::Value =
        serde_json::from_str(include_str!("../../../content-studio/data/vocabulary.json"))
            .map_err(|e| format!("Failed to parse vocabulary JSON: {}", e))?;

    let mut total_inserted = 0i32;

    let data = vocab_json
        .get("data")
        .ok_or("No 'data' field in vocabulary JSON")?;

    for (language, levels) in data.as_object().ok_or("Invalid data structure")? {
        let lang_code = match language.as_str() {
            "Espanol" => "es",
            "中文" => "zh",
            "English" => "en",
            _ => language.as_str(),
        };

        for (level, words_str) in levels.as_object().ok_or("Invalid levels structure")? {
            let words_text = words_str.as_str().ok_or("Invalid words value")?;
            let words: Vec<&str> = words_text
                .split(',')
                .map(|w| w.trim())
                .filter(|w| !w.is_empty())
                .collect();

            for (idx, word) in words.iter().enumerate() {
                let inserted = conn
                    .execute(
                        "INSERT OR IGNORE INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
                         VALUES (?1, ?2, NULL, ?3, ?4, ?5)",
                        params![word, word, level, lang_code, (words.len() as i32 - idx as i32)],
                    )
                    .map_err(|e| format!("Failed to insert vocab word '{}': {}", word, e))?;
                total_inserted += inserted as i32;
            }
        }
    }

    let total_in_db: i32 = conn
        .query_row("SELECT COUNT(*) FROM vocab_bank", [], |row| row.get(0))
        .unwrap_or(0);

    log::info!(
        "Vocab bank import: inserted {} new, total in DB {}",
        total_inserted,
        total_in_db
    );
    Ok(total_inserted)
}

/// Wipe `vocab_bank` (and the dependent `user_vocab` rows) and re-run the
/// default import. Used when the JSON source changes in a way that can't
/// be expressed as a pure-additive diff (e.g. relabelling a level).
pub fn reimport_vocab_bank(db: &DatabasePool) -> Result<i32, String> {
    let conn = db.conn()?;

    conn.execute("DELETE FROM user_vocab", [])
        .map_err(|e| format!("Failed to clear user_vocab: {}", e))?;
    let cleared = conn
        .execute("DELETE FROM vocab_bank", [])
        .map_err(|e| format!("Failed to clear vocab_bank: {}", e))?;
    log::info!("Reimport: cleared {} existing vocab rows", cleared);

    // Release the lock before re-importing (import_vocab_bank will re-acquire it).
    drop(conn);
    import_vocab_bank(db)
}

/// Initialize user vocabulary based on CEFR level from wizard
pub fn init_user_vocab(
    _db: &DatabasePool,
    _user_id: &str,
    _cefr_level: &str,
) -> Result<(), String> {
    log::info!("init_user_vocab is a no-op: all words start as unseen");
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
    let conn = db.conn()?;
    let familiarity = if mastery >= 2 { 3 } else { 1 };
    let next_review = if mastery >= 2 { "+7 days" } else { "+1 day" };

    conn.execute(
        "INSERT INTO user_vocab
            (user_id, word_id, mastery, source, familiarity, last_reviewed, next_review, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now', ?6), datetime('now'))
         ON CONFLICT(user_id, word_id) DO UPDATE SET
         mastery = ?3,
         source = ?4,
         familiarity = ?5,
         last_reviewed = datetime('now'),
         next_review = datetime('now', ?6),
         updated_at = datetime('now')",
        params![user_id, word_id, mastery, source, familiarity, next_review],
    )
    .map_err(|e| format!("Failed to update word mastery: {}", e))?;

    log::debug!(
        "Word mastery updated: user={} word={} mastery={} source={}",
        user_id,
        word_id,
        mastery,
        source
    );
    Ok(())
}

/// Get unknown words for AI rewriting selection
pub fn get_unknown_words(
    db: &DatabasePool,
    user_id: &str,
    cefr_level: &str,
    limit: i32,
    target_lang: &str,
) -> Result<Vec<VocabWord>, String> {
    let conn = db.conn()?;

    let mut stmt = conn
        .prepare(
            "SELECT v.id, v.word, v.lemma, v.pos, v.cefr_level, v.language,
                v.definition_zh, v.definition_es, v.example, v.frequency
         FROM vocab_bank v
         LEFT JOIN user_vocab uv ON v.id = uv.word_id AND uv.user_id = ?1
         WHERE (uv.mastery IS NULL OR uv.mastery < 2)
           AND v.cefr_level <= ?2
           AND v.language = ?4
         ORDER BY v.frequency DESC
         LIMIT ?3",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let words: Vec<VocabWord> = stmt
        .query_map(params![user_id, cefr_level, limit, target_lang], |row| {
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

/// Get vocabulary statistics for a user, scoped to the given target language.
pub fn get_user_vocab_stats(
    db: &DatabasePool,
    user_id: &str,
    target_lang: &str,
) -> Result<VocabStats, String> {
    let conn = db.conn()?;

    let total: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM vocab_bank WHERE language = ?1",
            params![target_lang],
            |row| row.get(0),
        )
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

    Ok(VocabStats {
        total_known: known,
        total_learning: learning,
        total,
    })
}

// ─── New structures for Vocab module ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserVocabWord {
    pub id: i32,
    pub word: String,
    pub lemma: Option<String>,
    pub pos: Option<String>,
    pub cefr_level: String,
    pub mastery: Option<i32>,
    pub source: Option<String>,
    pub updated_at: Option<String>,
    pub familiarity: Option<i32>,
    pub last_reviewed: Option<String>,
    pub next_review: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LevelStats {
    pub level: String,
    pub total: i32,
    pub unseen: i32,
    pub seen: i32,
    pub mastered: i32,
}

/// Get user vocab words by level with mastery status
pub fn get_user_vocab_by_level(
    db: &DatabasePool,
    user_id: &str,
    language: &str,
    cefr_level: &str,
) -> Result<Vec<UserVocabWord>, String> {
    let conn = db.conn()?;

    let mut stmt = conn
        .prepare(
            "SELECT vb.id, vb.word, vb.lemma, vb.pos, vb.cefr_level,
                uv.mastery, uv.source, uv.updated_at,
                uv.familiarity, uv.last_reviewed, uv.next_review
         FROM vocab_bank vb
         LEFT JOIN user_vocab uv ON vb.id = uv.word_id AND uv.user_id = ?1
         WHERE vb.language = ?2 AND vb.cefr_level = ?3
         ORDER BY vb.frequency DESC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let words: Vec<UserVocabWord> = stmt
        .query_map(params![user_id, language, cefr_level], |row| {
            Ok(UserVocabWord {
                id: row.get(0)?,
                word: row.get(1)?,
                lemma: row.get(2)?,
                pos: row.get(3)?,
                cefr_level: row.get(4)?,
                mastery: row.get(5)?,
                source: row.get(6)?,
                updated_at: row.get(7)?,
                familiarity: row.get(8)?,
                last_reviewed: row.get(9)?,
                next_review: row.get(10)?,
            })
        })
        .map_err(|e| format!("Failed to query user vocab: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(words)
}

/// Get vocabulary statistics grouped by CEFR level
pub fn get_user_vocab_stats_by_level(
    db: &DatabasePool,
    user_id: &str,
    language: &str,
) -> Result<Vec<LevelStats>, String> {
    let conn = db.conn()?;

    let mut stmt = conn
        .prepare(
            "SELECT vb.cefr_level,
                COUNT(*) as total,
                COUNT(*) - COUNT(uv.mastery) as unseen,
                SUM(CASE WHEN uv.mastery = 1 THEN 1 ELSE 0 END) as seen,
                SUM(CASE WHEN uv.mastery >= 2 THEN 1 ELSE 0 END) as mastered
         FROM vocab_bank vb
         LEFT JOIN user_vocab uv ON vb.id = uv.word_id AND uv.user_id = ?1
         WHERE vb.language = ?2
         GROUP BY vb.cefr_level
         ORDER BY vb.cefr_level",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let mut stats: Vec<LevelStats> = stmt
        .query_map(params![user_id, language], |row| {
            Ok(LevelStats {
                level: row.get(0)?,
                total: row.get(1)?,
                unseen: row.get(2)?,
                seen: row.get(3)?,
                mastered: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query level stats: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Always show the D (Discovered) level card, even when it has zero words,
    // so the user knows the collection exists.
    if !stats.iter().any(|s| s.level == "D") {
        stats.push(LevelStats {
            level: "D".to_string(),
            total: 0,
            unseen: 0,
            seen: 0,
            mastered: 0,
        });
    }

    Ok(stats)
}

/// Mark words as seen (mastery=1) when they appear in a read article.
/// Only inserts if no user_vocab record exists yet (respects existing user choices).
pub fn mark_words_seen(db: &DatabasePool, user_id: &str, word_ids: &[i32]) -> Result<(), String> {
    if word_ids.is_empty() {
        return Ok(());
    }

    let conn = db.conn()?;

    let placeholders: Vec<String> = (0..word_ids.len()).map(|i| format!("?{}", i + 2)).collect();
    let sql = format!(
        "INSERT OR IGNORE INTO user_vocab (user_id, word_id, mastery, source, updated_at)
         SELECT ?1, id, 1, 'news_reading', datetime('now')
         FROM vocab_bank WHERE id IN ({})",
        placeholders.join(",")
    );

    let mut params_vec: Vec<Box<dyn ToSql>> = vec![Box::new(user_id.to_string())];
    for wid in word_ids {
        params_vec.push(Box::new(*wid));
    }
    let param_refs: Vec<&dyn ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| format!("Failed to mark words seen: {}", e))?;

    log::debug!(
        "Marked {} words as seen for user {}",
        word_ids.len(),
        user_id
    );
    Ok(())
}

/// Look up word IDs by text (case-insensitive) for a given language
pub fn lookup_word_ids(
    db: &DatabasePool,
    words: &[String],
    language: &str,
) -> Result<Vec<i32>, String> {
    if words.is_empty() {
        return Ok(vec![]);
    }

    let conn = db.conn()?;

    let placeholders: Vec<String> = (0..words.len()).map(|i| format!("?{}", i + 2)).collect();
    let sql = format!(
        "SELECT DISTINCT v.id FROM vocab_bank v
         WHERE LOWER(v.word) IN ({}) AND v.language = ?1",
        placeholders.join(",")
    );

    let mut params_vec: Vec<Box<dyn ToSql>> = vec![Box::new(language.to_string())];
    for w in words {
        params_vec.push(Box::new(w.to_lowercase()));
    }
    let param_refs: Vec<&dyn ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Query error: {}", e))?;

    let ids: Vec<i32> = stmt
        .query_map(param_refs.as_slice(), |row| row.get(0))
        .map_err(|e| format!("Failed to lookup word IDs: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(ids)
}

/// Add a word that is not in the pre-imported graded vocabulary to the
/// "D" (Discovered) level of `vocab_bank`, then mark it as seen
/// (mastery=1, source='news_reading') in `user_vocab`.  If the word
/// already exists in `vocab_bank` (at *any* level, not just D), this
/// is a no-op — it simply returns the existing `word_id`.
///
/// Returns the `vocab_bank.id` of the (existing or new) row.
pub fn add_discovered_word(
    db: &DatabasePool,
    user_id: &str,
    word: &str,
    language: &str,
    context: Option<&str>,
) -> Result<i32, String> {
    let conn = db.conn()?;

    // Check if the word already exists in vocab_bank (any level).
    let existing_id: Option<i32> = conn
        .query_row(
            "SELECT id FROM vocab_bank WHERE LOWER(word) = LOWER(?1) AND language = ?2 LIMIT 1",
            params![word, language],
            |row| row.get(0),
        )
        .ok();

    let word_id = if let Some(id) = existing_id {
        id
    } else {
        conn.execute(
            "INSERT OR IGNORE INTO vocab_bank (word, lemma, cefr_level, language, frequency, example)
             VALUES (?1, ?1, 'D', ?2, 0, ?3)",
            params![word, language, context.unwrap_or("")],
        )
        .map_err(|e| format!("Failed to insert discovered word '{}': {}", word, e))?;

        // If INSERT OR IGNORE was a no-op due to a concurrent insert under a
        // different case form, fall back to querying the id.
        conn.query_row(
            "SELECT id FROM vocab_bank WHERE LOWER(word) = LOWER(?1) AND language = ?2 AND cefr_level = 'D' LIMIT 1",
            params![word, language],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to get id for discovered word '{}': {}", word, e))?
    };

    // Mark as seen (mastery=1) with INSERT OR IGNORE so we never
    // downgrade an existing mastery level.
    conn.execute(
        "INSERT OR IGNORE INTO user_vocab (user_id, word_id, mastery, source, updated_at)
         VALUES (?1, ?2, 1, 'news_reading', datetime('now'))",
        params![user_id, word_id],
    )
    .map_err(|e| {
        format!(
            "Failed to set mastery for discovered word '{}': {}",
            word, e
        )
    })?;

    log::debug!(
        "Discovered word: user={} word={} language={} id={}",
        user_id,
        word,
        language,
        word_id
    );

    Ok(word_id)
}

/// Ensure every word in `words` is tracked for the user:
/// - If the word already exists in `vocab_bank` (any level), mark it as
///   seen (mastery=1) via `INSERT OR IGNORE` (never downgrades).
/// - If the word does NOT exist in `vocab_bank`, insert it into the "D"
///   (Discovered) level, then mark it seen.
///
/// This is the batch equivalent of `mark_words_seen` + `add_discovered_word`,
/// called automatically after an article is rewritten so that *all* words
/// — including those outside the pre-imported CEFR-graded vocabulary — are
/// captured in one pass, without requiring the user to manually tap each
/// unknown word.
pub fn ensure_words_seen(
    db: &DatabasePool,
    user_id: &str,
    words: &[String],
    language: &str,
) -> Result<(), String> {
    if words.is_empty() {
        return Ok(());
    }

    let conn = db.conn()?;

    for word in words {
        let existing_id: Option<i32> = conn
            .query_row(
                "SELECT id FROM vocab_bank
                 WHERE LOWER(word) = LOWER(?1) AND language = ?2
                 LIMIT 1",
                params![word, language],
                |row| row.get(0),
            )
            .ok();

        let word_id = if let Some(id) = existing_id {
            id
        } else {
            conn.execute(
                "INSERT OR IGNORE INTO vocab_bank
                    (word, lemma, cefr_level, language, frequency)
                 VALUES (?1, ?1, 'D', ?2, 0)",
                params![word, language],
            )
            .map_err(|e| format!("Failed to insert discovered word '{}': {}", word, e))?;

            conn.query_row(
                "SELECT id FROM vocab_bank
                 WHERE LOWER(word) = LOWER(?1) AND language = ?2 AND cefr_level = 'D'
                 LIMIT 1",
                params![word, language],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to get id for discovered word '{}': {}", word, e))?
        };

        conn.execute(
            "INSERT OR IGNORE INTO user_vocab (user_id, word_id, mastery, source, updated_at)
             VALUES (?1, ?2, 1, 'news_reading', datetime('now'))",
            params![user_id, word_id],
        )
        .map_err(|e| format!("Failed to mark word '{}' seen: {}", word, e))?;
    }

    log::debug!(
        "ensure_words_seen: processed {} words for user {} ({})",
        words.len(),
        user_id,
        language
    );

    Ok(())
}

/// Reset all user_vocab records for a given level back to unseen
pub fn reset_user_vocab_by_level(
    db: &DatabasePool,
    user_id: &str,
    language: &str,
    cefr_level: &str,
) -> Result<(), String> {
    let conn = db.conn()?;

    let deleted = conn
        .execute(
            "DELETE FROM user_vocab WHERE user_id = ?1 AND word_id IN (
                SELECT id FROM vocab_bank WHERE language = ?2 AND cefr_level = ?3
            )",
            params![user_id, language, cefr_level],
        )
        .map_err(|e| format!("Failed to reset vocab: {}", e))?;

    log::info!(
        "Reset {} user_vocab records for {} {} {}",
        deleted,
        user_id,
        language,
        cefr_level
    );
    Ok(())
}

#[cfg(test)]
mod reset_tests {
    use super::*;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    fn create_test_user(conn: &rusqlite::Connection) -> String {
        let id = "test-user-id";
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES (?1, 'TestUser')",
            params![id],
        )
        .unwrap();
        id.to_string()
    }

    fn insert_test_word(conn: &rusqlite::Connection, word: &str, level: &str, lang: &str) -> i32 {
        conn.execute(
            "INSERT INTO vocab_bank (word, lemma, pos, cefr_level, language, frequency)
             VALUES (?1, ?2, 'noun', ?3, ?4, 100)",
            params![word, word, level, lang],
        )
        .unwrap();
        conn.last_insert_rowid() as i32
    }

    #[test]
    fn test_reset_deletes_user_vocab_records() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let w1 = insert_test_word(&conn, "hola", "A1", "es");
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 2, 'test')",
            params![uid, w1],
        )
        .unwrap();
        drop(conn);

        reset_user_vocab_by_level(&pool, &uid, "es", "A1").unwrap();

        let conn = pool.conn().unwrap();
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1",
                params![uid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0, "All user_vocab records for A1 should be deleted");
    }

    #[test]
    fn test_reset_only_deletes_specified_level() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        let w1 = insert_test_word(&conn, "hola", "A1", "es");
        let w2 = insert_test_word(&conn, "adios", "A2", "es");
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 2, 'test')",
            params![uid, w1],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES (?1, ?2, 1, 'test')",
            params![uid, w2],
        )
        .unwrap();
        drop(conn);

        reset_user_vocab_by_level(&pool, &uid, "es", "A1").unwrap();

        let conn = pool.conn().unwrap();
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_vocab WHERE user_id = ?1",
                params![uid],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "A2 record should remain");
    }

    #[test]
    fn test_reset_idempotent() {
        let pool = test_pool();
        let conn = pool.conn().unwrap();
        let uid = create_test_user(&conn);
        drop(conn);

        let r1 = reset_user_vocab_by_level(&pool, &uid, "es", "A1");
        let r2 = reset_user_vocab_by_level(&pool, &uid, "es", "A1");
        assert!(r1.is_ok());
        assert!(r2.is_ok());
    }
}
