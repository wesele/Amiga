use log;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use super::migrations;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_in_memory_creates_database() {
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn().unwrap();
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
        let conn = pool.conn().unwrap();

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
        let conn = pool.conn().unwrap();
        let fk_enabled: i32 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap_or(0);
        assert_eq!(fk_enabled, 1, "Foreign keys should be enabled");
    }

    #[test]
    fn test_schema_version_tracking() {
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn().unwrap();

        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM schema_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 13, "Should have 13 migrations applied");
    }

    #[test]
    fn test_v6_drops_mastery_zero_records() {
        let pool = DatabasePool::new_in_memory();
        let conn = pool.conn().unwrap();
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
        let conn = pool.conn().unwrap();
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
    pool: Pool<SqliteConnectionManager>,
    compatible: AtomicBool,
}

impl DatabasePool {
    pub fn new() -> Result<Self, String> {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).expect("Failed to create database directory");
        }

        let manager = SqliteConnectionManager::file(&db_path).with_init(|c| {
            c.execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
            )
        });
        let pool = Pool::builder()
            .max_size(8)
            .build(manager)
            .map_err(|e| format!("Failed to create database pool: {}", e))?;

        log::info!("Database opened at: {:?}", db_path);

        let db = Self { pool, compatible: AtomicBool::new(true) };
        db.run_migrations()?;
        Ok(db)
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn new_in_memory() -> Self {
        let manager = SqliteConnectionManager::memory()
            .with_init(|c| c.execute_batch("PRAGMA foreign_keys=ON;"));
        let pool = Pool::builder()
            .max_size(1)
            .build(manager)
            .expect("Failed to create in-memory database pool");

        let db = Self { pool, compatible: AtomicBool::new(true) };
        db.run_migrations()
            .expect("In-memory migrations should not fail");
        db
    }

    /// Returns `true` if the current database schema is compatible with
    /// this app version (all applied migration versions are known).
    pub fn is_schema_compatible(&self) -> bool {
        self.compatible.load(Ordering::SeqCst)
    }

    /// Internal check: reads all applied schema versions and compares
    /// them against the latest known migration version. If any applied
    /// version exceeds the latest known, the schema is incompatible
    /// (e.g. the database was written by a newer app version and
    /// downgraded).
    fn check_schema_compatible_internal(&self) -> Result<(), String> {
        let conn = self.conn()?;

        let max_applied: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let all_migrations = migrations::all_migrations();
        let latest_known = all_migrations
            .last()
            .map(|(v, _, _)| *v)
            .unwrap_or(0);

        if max_applied > latest_known {
            log::warn!(
                "Schema incompatible: database has v{} but app only knows up to v{}",
                max_applied,
                latest_known,
            );
            self.compatible.store(false, Ordering::SeqCst);
        }
        Ok(())
    }

    /// Deletes all user data and re-runs migrations from scratch.
    /// Drops every table (except `schema_version`), clears the version
    /// tracking, then replays all migrations.
    pub fn reset_database(&self) -> Result<(), String> {
        let conn = self.conn()?;

        // Disable foreign keys temporarily so DROP TABLE won't fail on
        // reference constraints.
        conn.execute_batch("PRAGMA foreign_keys = OFF;")
            .map_err(|e| format!("Failed to disable foreign keys: {}", e))?;

        let tables: Vec<String> = {
            let mut stmt = conn
                .prepare(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name != 'schema_version'",
                )
                .map_err(|e| format!("Failed to list tables: {}", e))?;
            let rows = stmt
                .query_map([], |row| row.get(0))
                .map_err(|e| format!("Failed to query tables: {}", e))?
                .filter_map(|r| r.ok())
                .collect::<Vec<String>>();
            rows
        };

        for table in &tables {
            conn.execute_batch(&format!("DROP TABLE IF EXISTS \"{}\"", table))
                .map_err(|e| format!("Failed to drop table {}: {}", table, e))?;
        }

        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|e| format!("Failed to re-enable foreign keys: {}", e))?;

        // Clear migration history
        conn.execute("DELETE FROM schema_version", [])
            .map_err(|e| format!("Failed to clear schema_version: {}", e))?;

        // Re-run all migrations
        self.run_migrations()?;
        self.compatible.store(true, Ordering::SeqCst);
        log::info!("Database has been reset to factory state");

        Ok(())
    }

    pub fn conn(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>, String> {
        self.pool.get().map_err(|e| format!("DB pool error: {}", e))
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

    fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn()?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .map_err(|e| format!("Failed to create schema_version table: {}", e))?;

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

                conn.execute_batch("BEGIN")
                    .map_err(|e| format!("Migration v{} failed to begin: {}", version, e))?;

                match conn.execute_batch(sql) {
                    Ok(_) => {
                        conn.execute(
                            "INSERT INTO schema_version (version, description) VALUES (?1, ?2)",
                            params![version, description],
                        )
                        .map_err(|e| format!("Failed to record migration v{}: {}", version, e))?;

                        conn.execute_batch("COMMIT").map_err(|e| {
                            format!("Failed to commit migration v{}: {}", version, e)
                        })?;
                        log::info!("Migration v{} applied successfully", version);
                    }
                    Err(e) => {
                        conn.execute_batch("ROLLBACK").ok();
                        log::error!("Migration v{} failed: {}", version, e);
                        return Err(format!("Database migration v{} failed: {}", version, e));
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

        // After normal migration, check whether the database came from
        // a newer app version (incompatible schema).
        self.check_schema_compatible_internal()?;

        Ok(())
    }
}
