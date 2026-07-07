use crate::modules::database::DatabasePool;
use crate::modules::sync::settings::is_sensitive_setting;
use crate::modules::sync::types::*;
use crate::modules::user::get_or_create_user;
use log;
use rusqlite::{params, Transaction};
use std::collections::HashSet;

pub fn export_sync_payload(db: &DatabasePool) -> Result<SyncPayload, String> {
    let user = get_or_create_user(db)?;
    let conn = db.conn()?;
    let user_id = user.id.clone();

    let users = vec![SyncUserRow {
        nickname: user.nickname,
        avatar: user.avatar,
        native_language: user.native_language,
        country: user.country,
        gender: user.gender,
        birth_year: user.birth_year,
        age_range: user.age_range,
        wizard_completed: user.wizard_completed,
        created_at: user.created_at,
        last_active_date: user.last_active_date,
    }];

    let mut stmt = conn
        .prepare(
            "SELECT target_language, cefr_level, daily_minutes, objective, created_at
             FROM learning_goals WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let learning_goals = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncLearningGoalRow {
                target_language: row.get(0)?,
                cefr_level: row.get(1)?,
                daily_minutes: row.get(2)?,
                objective: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT uv.word_id, uv.mastery, uv.source, uv.updated_at,
                    vb.word, vb.cefr_level, vb.language
             FROM user_vocab uv
             JOIN vocab_bank vb ON vb.id = uv.word_id
             WHERE uv.user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let user_vocab = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncUserVocabRow {
                word_id: row.get(0)?,
                mastery: row.get(1)?,
                source: row.get(2)?,
                updated_at: row.get(3)?,
                word: Some(row.get(4)?),
                cefr_level: Some(row.get(5)?),
                language: Some(row.get(6)?),
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT a.source, l.words_looked_up, l.words_known, l.words_unknown,
                    l.reading_time_sec, l.completed, l.read_at
             FROM news_reading_log l
             LEFT JOIN news_articles a ON a.id = l.article_id
             WHERE l.user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let news_reading_log = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncReadingLogRow {
                article_source: row.get(0)?,
                words_looked_up: row.get(1)?,
                words_known: row.get(2)?,
                words_unknown: row.get(3)?,
                reading_time_sec: row.get(4)?,
                completed: row.get::<_, i32>(5)? != 0,
                read_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT date, articles_read, words_learned
             FROM streak_records WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let streak_records = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncStreakRow {
                date: row.get(0)?,
                articles_read: row.get(1)?,
                words_learned: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT id, title, user_profile_json, conversation_summary, message_count,
                    contact_type, target_language, last_message, created_at, updated_at
             FROM chat_sessions WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let chat_sessions: Vec<SyncChatSessionRow> = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncChatSessionRow {
                id: row.get(0)?,
                title: row.get(1)?,
                user_profile_json: row.get(2)?,
                conversation_summary: row.get(3)?,
                message_count: row.get(4)?,
                contact_type: row.get(5)?,
                target_language: row.get(6)?,
                last_message: row.get(7)?,
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let session_ids: Vec<String> = chat_sessions.iter().map(|s| s.id.clone()).collect();
    let chat_messages = if session_ids.is_empty() {
        Vec::new()
    } else {
        let placeholders = session_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT session_id, role, content, created_at
             FROM chat_messages WHERE session_id IN ({placeholders})
             ORDER BY created_at ASC"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params: Vec<&dyn rusqlite::ToSql> = session_ids
            .iter()
            .map(|id| id as &dyn rusqlite::ToSql)
            .collect();
        let rows = stmt
            .query_map(params.as_slice(), |row| {
                Ok(SyncChatMessageRow {
                    session_id: row.get(0)?,
                    role: row.get(1)?,
                    content: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut stmt = conn
        .prepare("SELECT key, value FROM app_settings")
        .map_err(|e| e.to_string())?;
    let app_settings = stmt
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter(|(key, _)| !is_sensitive_setting(key))
        .map(|(key, value)| SyncSettingRow { key, value })
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT key, name, category, system_prompt, user_prompt_template, updated_at
             FROM prompts",
        )
        .map_err(|e| e.to_string())?;
    let prompts = stmt
        .query_map([], |row| {
            Ok(SyncPromptRow {
                key: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                system_prompt: row.get(3)?,
                user_prompt_template: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT pair_key, section_id, stars, best_score, attempts, completed_at, updated_at
             FROM path_section_progress WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let path_section_progress = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncPathProgressRow {
                pair_key: row.get(0)?,
                section_id: row.get(1)?,
                stars: row.get(2)?,
                best_score: row.get(3)?,
                attempts: row.get(4)?,
                completed_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(SyncPayload {
        version: 3,
        users,
        learning_goals,
        user_vocab,
        news_reading_log,
        streak_records,
        chat_sessions,
        chat_messages,
        app_settings,
        prompts,
        path_section_progress,
    })
}

pub fn import_sync_payload(db: &DatabasePool, payload: &SyncPayload) -> Result<(), String> {
    let conn = db.conn()?;
    // Ensure the built-in vocab bank exists before resolving user_vocab rows.
    drop(conn);
    if let Err(e) = crate::modules::vocabulary::import_vocab_bank(db) {
        log::warn!(
            "Vocab bank import before sync restore failed (continuing): {}",
            e
        );
    }

    let mut conn = db.conn()?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start sync import transaction: {}", e))?;
    // Belt-and-suspenders: row-level resolution should prevent FK violations,
    // but never abort an entire restore because of one stale reference.
    tx.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| format!("Failed to relax foreign keys for sync import: {}", e))?;
    import_sync_payload_tx(&tx, payload)?;
    tx.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to re-enable foreign keys after sync import: {}", e))?;
    tx.commit()
        .map_err(|e| format!("Failed to commit sync import: {}", e))
}

fn resolve_vocab_word_id_tx(tx: &Transaction<'_>, row: &SyncUserVocabRow) -> Option<i32> {
    if let (Some(word), Some(cefr_level), Some(language)) = (
        row.word.as_deref().filter(|s| !s.is_empty()),
        row.cefr_level.as_deref().filter(|s| !s.is_empty()),
        row.language.as_deref().filter(|s| !s.is_empty()),
    ) {
        let lookup_exact = |w: &str| {
            tx.query_row(
                "SELECT id FROM vocab_bank WHERE word = ?1 AND cefr_level = ?2 AND language = ?3 LIMIT 1",
                params![w, cefr_level, language],
                |r| r.get(0),
            )
            .ok()
        };
        let lookup_insensitive = |w: &str| {
            tx.query_row(
                "SELECT id FROM vocab_bank WHERE LOWER(word) = LOWER(?1) AND cefr_level = ?2 AND language = ?3 LIMIT 1",
                params![w, cefr_level, language],
                |r| r.get(0),
            )
            .ok()
        };
        let lookup_any_level = |w: &str| {
            tx.query_row(
                "SELECT id FROM vocab_bank WHERE LOWER(word) = LOWER(?1) AND language = ?2
                 ORDER BY CASE WHEN cefr_level = ?3 THEN 0 ELSE 1 END, id
                 LIMIT 1",
                params![w, language, cefr_level],
                |r| r.get(0),
            )
            .ok()
        };
        let lookup_discovered = |w: &str| {
            tx.query_row(
                "SELECT id FROM vocab_bank WHERE LOWER(word) = LOWER(?1) AND language = ?2 AND cefr_level = 'D' LIMIT 1",
                params![w, language],
                |r| r.get(0),
            )
            .ok()
        };

        if let Some(id) = lookup_exact(word).or_else(|| lookup_insensitive(word)) {
            return Some(id);
        }

        if cefr_level == "D" {
            if let Some(id) = lookup_discovered(word) {
                return Some(id);
            }
        } else if let Some(id) = lookup_any_level(word) {
            return Some(id);
        }

        if tx
            .execute(
                "INSERT OR IGNORE INTO vocab_bank (word, lemma, cefr_level, language, frequency)
                 VALUES (?1, ?1, ?2, ?3, 0)",
                params![word, cefr_level, language],
            )
            .is_err()
        {
            return None;
        }

        return lookup_exact(word)
            .or_else(|| lookup_insensitive(word))
            .or_else(|| {
                if cefr_level == "D" {
                    lookup_discovered(word)
                } else {
                    lookup_any_level(word)
                }
            });
    }

    tx.query_row(
        "SELECT id FROM vocab_bank WHERE id = ?1",
        params![row.word_id],
        |r| r.get(0),
    )
    .ok()
}

fn import_sync_payload_tx(tx: &Transaction<'_>, payload: &SyncPayload) -> Result<(), String> {
    let local_user_id: String = tx
        .query_row("SELECT id FROM users LIMIT 1", [], |row| row.get(0))
        .map_err(|e| format!("No local user for sync import: {}", e))?;

    if let Some(remote_user) = payload.users.first() {
        tx.execute(
            "UPDATE users SET nickname = ?1, avatar = ?2, native_language = ?3, country = ?4,
             gender = ?5, birth_year = ?6, age_range = ?7, wizard_completed = ?8,
             last_active_date = ?9 WHERE id = ?10",
            params![
                remote_user.nickname,
                remote_user.avatar,
                remote_user.native_language,
                remote_user.country,
                remote_user.gender,
                remote_user.birth_year,
                remote_user.age_range,
                if remote_user.wizard_completed { 1 } else { 0 },
                remote_user.last_active_date,
                local_user_id,
            ],
        )
        .map_err(|e| format!("Failed to import user profile: {}", e))?;
    }

    tx.execute(
        "DELETE FROM learning_goals WHERE user_id = ?1",
        params![local_user_id],
    )
    .ok();
    for goal in &payload.learning_goals {
        tx.execute(
            "INSERT INTO learning_goals (user_id, target_language, cefr_level, daily_minutes, objective, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                local_user_id,
                goal.target_language,
                goal.cefr_level,
                goal.daily_minutes,
                goal.objective,
                goal.created_at,
            ],
        )
        .map_err(|e| format!("Failed to import learning goal: {}", e))?;
    }

    let mut vocab_imported = 0usize;
    let mut vocab_skipped = 0usize;
    for row in &payload.user_vocab {
        let Some(local_word_id) = resolve_vocab_word_id_tx(tx, row) else {
            vocab_skipped += 1;
            continue;
        };
        match tx.execute(
            "INSERT INTO user_vocab (user_id, word_id, mastery, source, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(user_id, word_id) DO UPDATE SET
               mastery = excluded.mastery,
               source = excluded.source,
               updated_at = excluded.updated_at
             WHERE excluded.updated_at >= user_vocab.updated_at",
            params![
                local_user_id,
                local_word_id,
                row.mastery,
                row.source,
                row.updated_at,
            ],
        ) {
            Ok(_) => vocab_imported += 1,
            Err(e) => {
                vocab_skipped += 1;
                log::warn!("Skipped user_vocab row during sync import: {}", e);
            }
        }
    }
    if vocab_skipped > 0 {
        log::warn!(
            "Sync import user_vocab: imported={}, skipped={}",
            vocab_imported,
            vocab_skipped
        );
    }

    for row in &payload.news_reading_log {
        let Some(source) = row.article_source.as_deref().filter(|s| !s.is_empty()) else {
            continue;
        };
        let article_id: Option<i32> = tx
            .query_row(
                "SELECT id FROM news_articles WHERE source = ?1 LIMIT 1",
                params![source],
                |row| row.get(0),
            )
            .ok();
        let Some(article_id) = article_id else {
            continue;
        };
        tx.execute(
            "INSERT INTO news_reading_log (user_id, article_id, words_looked_up, words_known,
             words_unknown, reading_time_sec, completed, read_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(user_id, article_id, read_at) DO NOTHING",
            params![
                local_user_id,
                article_id,
                row.words_looked_up,
                row.words_known,
                row.words_unknown,
                row.reading_time_sec,
                if row.completed { 1 } else { 0 },
                row.read_at,
            ],
        )
        .map_err(|e| format!("Failed to import news reading log: {}", e))?;
    }

    for row in &payload.streak_records {
        tx.execute(
            "INSERT INTO streak_records (user_id, date, articles_read, words_learned)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, date) DO UPDATE SET
               articles_read = excluded.articles_read,
               words_learned = excluded.words_learned",
            params![
                local_user_id,
                row.date,
                row.articles_read,
                row.words_learned,
            ],
        )
        .map_err(|e| format!("Failed to import streak record: {}", e))?;
    }

    for row in &payload.path_section_progress {
        tx.execute(
            "INSERT INTO path_section_progress
                (user_id, pair_key, section_id, stars, best_score, attempts, completed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(user_id, pair_key, section_id) DO UPDATE SET
               stars = MAX(path_section_progress.stars, excluded.stars),
               best_score = MAX(path_section_progress.best_score, excluded.best_score),
               attempts = MAX(path_section_progress.attempts, excluded.attempts),
               completed_at = COALESCE(path_section_progress.completed_at, excluded.completed_at),
               updated_at = excluded.updated_at
             WHERE excluded.updated_at >= path_section_progress.updated_at",
            params![
                local_user_id,
                row.pair_key,
                row.section_id,
                row.stars,
                row.best_score,
                row.attempts,
                row.completed_at,
                row.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to import path progress: {}", e))?;
    }

    let remote_session_ids: HashSet<String> =
        payload.chat_sessions.iter().map(|s| s.id.clone()).collect();
    if !remote_session_ids.is_empty() {
        let placeholders = remote_session_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let params: Vec<&dyn rusqlite::ToSql> = remote_session_ids
            .iter()
            .map(|id| id as &dyn rusqlite::ToSql)
            .collect();
        let delete_messages =
            format!("DELETE FROM chat_messages WHERE session_id IN ({placeholders})");
        tx.execute(&delete_messages, params.as_slice()).ok();
        let delete_sessions = format!("DELETE FROM chat_sessions WHERE id IN ({placeholders})");
        tx.execute(&delete_sessions, params.as_slice()).ok();
    }

    for session in &payload.chat_sessions {
        tx.execute(
            "INSERT INTO chat_sessions (id, user_id, title, user_profile_json, conversation_summary,
             message_count, contact_type, target_language, last_message, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                session.id,
                local_user_id,
                session.title,
                session.user_profile_json,
                session.conversation_summary,
                session.message_count,
                session.contact_type,
                session.target_language,
                session.last_message,
                session.created_at,
                session.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to import chat session: {}", e))?;
    }

    for message in &payload.chat_messages {
        if !remote_session_ids.contains(&message.session_id) {
            continue;
        }
        tx.execute(
            "INSERT INTO chat_messages (session_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                message.session_id,
                message.role,
                message.content,
                message.created_at,
            ],
        )
        .ok();
    }

    for setting in &payload.app_settings {
        if is_sensitive_setting(&setting.key) {
            continue;
        }
        tx.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![setting.key, setting.value],
        )
        .ok();
    }

    for prompt in &payload.prompts {
        tx.execute(
            "INSERT INTO prompts (key, name, category, system_prompt, user_prompt_template, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(key) DO UPDATE SET
               name = excluded.name,
               category = excluded.category,
               system_prompt = excluded.system_prompt,
               user_prompt_template = excluded.user_prompt_template,
               updated_at = excluded.updated_at",
            params![
                prompt.key,
                prompt.name,
                prompt.category,
                prompt.system_prompt,
                prompt.user_prompt_template,
                prompt.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to import prompt: {}", e))?;
    }

    Ok(())
}
