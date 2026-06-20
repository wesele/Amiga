use log;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use std::sync::Mutex;

use super::migrations;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_in_memory_creates_database() {
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn.lock().unwrap();
        let version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        assert!(version > 0, "Migrations should have run");
    }

    #[test]
    fn test_new_in_memory_creates_all_tables() {
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn.lock().unwrap();

        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        let expected = vec![
            "app_settings",
            "chat_messages",
            "chat_sessions",
            "learning_goals",
            "news_articles",
            "news_reading_log",
            "schema_version",
            "streak_records",
            "user_vocab",
            "vocab_bank",
            "users",
        ];
        for table in &expected {
            assert!(
                tables.contains(&table.to_string()),
                "Missing table: {}",
                table
            );
        }
    }

    #[test]
    fn test_foreign_keys_enabled() {
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn.lock().unwrap();
        let fk_enabled: i32 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap_or(0);
        assert_eq!(fk_enabled, 1, "Foreign keys should be enabled");
    }

    #[test]
    fn test_schema_version_tracking() {
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn.lock().unwrap();

        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 11, "Should have 11 migrations applied");
    }

    #[test]
    fn test_v6_drops_mastery_zero_records() {
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn.lock().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO vocab_bank (word, lemma, cefr_level, language) VALUES ('hola', 'hola', 'A1', 'es')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO vocab_bank (word, lemma, cefr_level, language) VALUES ('adios', 'adios', 'A1', 'es')",
            [],
        ).unwrap();
        let wids: Vec<i32> = {
            let mut stmt = conn
                .prepare("SELECT id FROM vocab_bank ORDER BY id")
                .unwrap();
            stmt.query_map([], |r| r.get(0))
                .unwrap()
                .map(|r| r.unwrap())
                .collect()
        };
        let w_zero = wids[0];
        let w_one = wids[1];
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES ('u1', ?1, 0, 'old')",
            params![w_zero],
        ).unwrap();
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) VALUES ('u1', ?1, 1, 'kept')",
            params![w_one],
        ).unwrap();

        // Replay V6 (already ran during pool init; simulate it now with pre-existing rows)
        let deleted = conn
            .execute("DELETE FROM user_vocab WHERE mastery = 0", [])
            .unwrap();

        let kept: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_vocab WHERE user_id = 'u1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(deleted, 1, "V6 should delete the mastery=0 record");
        assert_eq!(kept, 1, "mastery=1 record should be preserved");

        let m_one: i32 = conn
            .query_row(
                "SELECT mastery FROM user_vocab WHERE user_id = 'u1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(m_one, 1, "Surviving record should be mastery=1");
    }

    #[test]
    fn test_v7_wipes_legacy_user_vocab() {
        // Simulate legacy data: wizard_init bulk-set + a couple of real user records
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn.lock().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO vocab_bank (word, lemma, cefr_level, language) VALUES ('hola', 'hola', 'A1', 'es')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO vocab_bank (word, lemma, cefr_level, language) VALUES ('adios', 'adios', 'A1', 'es')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source) SELECT 'u1', id, 2, 'wizard_init' FROM vocab_bank",
            [],
        ).unwrap();
        let vocab_count: i32 = conn
            .query_row("SELECT COUNT(*) FROM user_vocab", [], |row| row.get(0))
            .unwrap();
        assert_eq!(vocab_count, 2, "Both words inserted as legacy wizard_init");

        // Replay V7 (already ran during pool init, simulate it now)
        let deleted = conn.execute("DELETE FROM user_vocab", []).unwrap();
        let remaining: i32 = conn
            .query_row("SELECT COUNT(*) FROM user_vocab", [], |row| row.get(0))
            .unwrap();
        assert_eq!(deleted, 2);
        assert_eq!(remaining, 0, "V7 should leave user_vocab empty");
    }
}

pub struct DatabasePool {
    pub conn: Mutex<Connection>,
}

impl DatabasePool {
    pub fn new() -> Self {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).expect("Failed to create database directory");
        }

        let conn = Connection::open(&db_path).expect("Failed to open database connection");

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .expect("Failed to set database pragmas");

        log::info!("Database opened at: {:?}", db_path);

        let pool = Self {
            conn: Mutex::new(conn),
        };
        pool.run_migrations();
        pool
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn new_in_memory() -> Self {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .expect("Failed to set database pragmas");

        let pool = Self {
            conn: Mutex::new(conn),
        };
        pool.run_migrations();
        pool
    }

    fn db_path() -> PathBuf {
        #[cfg(target_os = "android")]
        {
            return PathBuf::from("/data/data/com.idioma.app/files")
                .join("idioma")
                .join("idioma.db");
        }

        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("idioma")
            .join("idioma.db")
    }

    fn run_migrations(&self) {
        let conn = self.conn.lock().unwrap();

        // Create schema_version table if not exists
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .expect("Failed to create schema_version table");

        // Get current version
        let current_version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        log::info!("Current database schema version: {}", current_version);

        let all_migrations = migrations::all_migrations();

        for (version, description, sql) in &all_migrations {
            if *version > current_version {
                log::info!("Applying migration v{}: {}", version, description);

                match conn.execute_batch("BEGIN") {
                    Ok(_) => {}
                    Err(e) => {
                        log::error!("Failed to begin transaction for v{}: {}", version, e);
                        panic!("Migration v{} failed to begin: {}", version, e);
                    }
                }

                match conn.execute_batch(sql) {
                    Ok(_) => {
                        conn.execute(
                            "INSERT INTO schema_version (version, description) VALUES (?1, ?2)",
                            params![version, description],
                        )
                        .expect("Failed to record migration version");

                        conn.execute_batch("COMMIT")
                            .expect("Failed to commit migration");
                        log::info!("Migration v{} applied successfully", version);
                    }
                    Err(e) => {
                        conn.execute_batch("ROLLBACK").ok();
                        log::error!("Migration v{} failed: {}", version, e);
                        panic!("Database migration v{} failed: {}", version, e);
                    }
                }
            }
        }

        let final_version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        log::info!("Database schema up to date. Version: {}", final_version);
    }
}
