use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;
use log;

use super::migrations;

pub struct DatabasePool {
    pub conn: Mutex<Connection>,
}

impl DatabasePool {
    pub fn new() -> Self {
        let db_path = Self::db_path();
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).expect("Failed to create database directory");
        }

        let conn = Connection::open(&db_path)
            .expect("Failed to open database connection");

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .expect("Failed to set database pragmas");

        log::info!("Database opened at: {:?}", db_path);

        let pool = Self {
            conn: Mutex::new(conn),
        };
        pool.run_migrations();
        pool
    }

    fn db_path() -> PathBuf {
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
            );"
        ).expect("Failed to create schema_version table");

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
                        ).expect("Failed to record migration version");

                        conn.execute_batch("COMMIT").expect("Failed to commit migration");
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
