use crate::modules::database::DatabasePool;
use crate::modules::sync::settings::is_sensitive_setting;
use crate::modules::sync::types::*;
use crate::modules::user::get_or_create_user;
use log;
use rusqlite::{params, Transaction};
use std::collections::{HashMap, HashSet};

fn now_sql_timestamp() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

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

    let mut stmt = conn
        .prepare(
            "SELECT id, target_language, cefr_level, local_date, slot, topic, title, body,
                    status, test_correct_count, test_total_count, generated_at
             FROM reading_articles WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let reading_articles: Vec<SyncReadingArticleRow> = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncReadingArticleRow {
                id: row.get(0)?,
                target_language: row.get(1)?,
                cefr_level: row.get(2)?,
                local_date: row.get(3)?,
                slot: row.get(4)?,
                topic: row.get(5)?,
                title: row.get(6)?,
                body: row.get(7)?,
                status: row.get(8)?,
                test_correct_count: row.get(9)?,
                test_total_count: row.get(10)?,
                generated_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let reading_article_ids: HashSet<i64> = reading_articles.iter().map(|row| row.id).collect();
    let mut stmt = conn
        .prepare(
            "SELECT t.article_id, t.questions_json, t.explanations_json, t.created_at
             FROM reading_tests t
             JOIN reading_articles a ON a.id = t.article_id
             WHERE a.user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let reading_tests = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncReadingTestRow {
                article_id: row.get(0)?,
                questions_json: row.get(1)?,
                explanations_json: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|row| reading_article_ids.contains(&row.article_id))
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT a.article_id, a.answers_json, a.correct_count, a.total_count, a.completed_at
             FROM reading_test_attempts a
             JOIN reading_articles r ON r.id = a.article_id
             WHERE r.user_id = ?1 AND a.user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let reading_test_attempts = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncReadingTestAttemptRow {
                article_id: row.get(0)?,
                answers_json: row.get(1)?,
                correct_count: row.get(2)?,
                total_count: row.get(3)?,
                completed_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|row| reading_article_ids.contains(&row.article_id))
        .collect();

    let mut stmt = conn
        .prepare(
            "SELECT id, topic_id, target_lang, native_lang, cefr_level, current_turn,
                    current_ai_text, status, total_turns, retry_count, created_at, completed_at
             FROM speaking_sessions WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let speaking_sessions: Vec<SyncSpeakingSessionRow> = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncSpeakingSessionRow {
                id: row.get(0)?,
                topic_id: row.get(1)?,
                target_lang: row.get(2)?,
                native_lang: row.get(3)?,
                cefr_level: row.get(4)?,
                current_turn: row.get(5)?,
                current_ai_text: row.get(6)?,
                status: row.get(7)?,
                total_turns: row.get(8)?,
                retry_count: row.get(9)?,
                created_at: row.get(10)?,
                completed_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    let speaking_session_ids: HashSet<&str> = speaking_sessions
        .iter()
        .map(|row| row.id.as_str())
        .collect();
    let mut stmt = conn
        .prepare(
            "SELECT t.session_id, t.turn_number, t.ai_text, t.user_transcript, t.scores_json,
                    t.total_score, t.used_hint, t.attempt_count, t.created_at
             FROM speaking_turns t
             JOIN speaking_sessions s ON s.id = t.session_id
             WHERE s.user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let speaking_turns = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncSpeakingTurnRow {
                session_id: row.get(0)?,
                turn_number: row.get(1)?,
                ai_text: row.get(2)?,
                user_transcript: row.get(3)?,
                scores_json: row.get(4)?,
                total_score: row.get(5)?,
                used_hint: row.get::<_, i32>(6)? != 0,
                attempt_count: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|row| speaking_session_ids.contains(row.session_id.as_str()))
        .collect();

    Ok(SyncPayload {
        version: 4,
        users,
        learning_goals,
        user_vocab,
        news_reading_log: Vec::new(),
        streak_records,
        chat_sessions,
        chat_messages,
        app_settings,
        prompts,
        path_section_progress,
        reading_articles,
        reading_tests,
        reading_test_attempts,
        speaking_sessions,
        speaking_turns,
    })
}

pub fn import_sync_payload(
    db: &DatabasePool,
    payload: &SyncPayload,
) -> Result<SyncImportReport, String> {
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
    let report = import_sync_payload_tx(&tx, payload)?;
    tx.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to re-enable foreign keys after sync import: {}", e))?;
    tx.commit()
        .map_err(|e| format!("Failed to commit sync import: {}", e))?;
    Ok(report)
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

fn import_sync_payload_tx(
    tx: &Transaction<'_>,
    payload: &SyncPayload,
) -> Result<SyncImportReport, String> {
    let mut report = SyncImportReport::default();
    let local_user_id: String = tx
        .query_row("SELECT id FROM users LIMIT 1", [], |row| row.get(0))
        .map_err(|e| format!("No local user for sync import: {}", e))?;

    if let Some(remote_user) = payload.users.first() {
        if remote_user.nickname.trim().is_empty() {
            report.skipped();
        } else {
            match tx.execute(
                "UPDATE users SET nickname = ?1, avatar = ?2, native_language = ?3, country = ?4,
                 gender = ?5, birth_year = ?6, age_range = ?7, wizard_completed = ?8,
                 last_active_date = ?9 WHERE id = ?10",
                params![
                    remote_user.nickname,
                    if remote_user.avatar.is_empty() {
                        "😊"
                    } else {
                        &remote_user.avatar
                    },
                    if remote_user.native_language.is_empty() {
                        "zh"
                    } else {
                        &remote_user.native_language
                    },
                    if remote_user.country.is_empty() {
                        "CN"
                    } else {
                        &remote_user.country
                    },
                    remote_user.gender,
                    remote_user.birth_year,
                    remote_user.age_range,
                    if remote_user.wizard_completed { 1 } else { 0 },
                    remote_user.last_active_date,
                    local_user_id,
                ],
            ) {
                Ok(_) => report.imported(),
                Err(e) => {
                    report.skipped();
                    log::warn!("Skipped user profile during sync import: {}", e);
                }
            }
        }
    }

    if !payload.learning_goals.is_empty() {
        tx.execute(
            "DELETE FROM learning_goals WHERE user_id = ?1",
            params![local_user_id],
        )
        .ok();
    }
    for goal in &payload.learning_goals {
        if goal.target_language.trim().is_empty() || goal.cefr_level.trim().is_empty() {
            report.skipped();
            continue;
        }
        match tx.execute(
            "INSERT INTO learning_goals (user_id, target_language, cefr_level, daily_minutes, objective, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                local_user_id,
                goal.target_language,
                goal.cefr_level,
                if goal.daily_minutes > 0 { goal.daily_minutes } else { 15 },
                if goal.objective.is_empty() { "daily_conversation" } else { &goal.objective },
                if goal.created_at.is_empty() { now_sql_timestamp() } else { goal.created_at.clone() },
            ],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped learning goal during sync import: {}", e);
            }
        }
    }

    let mut vocab_imported = 0usize;
    let mut vocab_skipped = 0usize;
    for row in &payload.user_vocab {
        let Some(local_word_id) = resolve_vocab_word_id_tx(tx, row) else {
            vocab_skipped += 1;
            report.skipped();
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
            Ok(_) => {
                vocab_imported += 1;
                report.imported();
            }
            Err(e) => {
                vocab_skipped += 1;
                report.skipped();
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

    // News content/history is intentionally device-local from payload v4 onward.
    // Legacy rows are decoded for forward compatibility but not restored.

    for row in &payload.streak_records {
        if row.date.trim().is_empty() {
            report.skipped();
            continue;
        }
        match tx.execute(
            "INSERT INTO streak_records (user_id, date, articles_read, words_learned)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, date) DO UPDATE SET
               articles_read = MAX(streak_records.articles_read, excluded.articles_read),
               words_learned = MAX(streak_records.words_learned, excluded.words_learned)",
            params![
                local_user_id,
                row.date,
                row.articles_read,
                row.words_learned,
            ],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped streak record during sync import: {}", e);
            }
        }
    }

    for row in &payload.path_section_progress {
        if row.pair_key.is_empty() || row.section_id.is_empty() {
            report.skipped();
            continue;
        }
        match tx.execute(
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
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped path progress during sync import: {}", e);
            }
        }
    }

    let mut reading_id_map = HashMap::<i64, i64>::new();
    for row in &payload.reading_articles {
        let valid_slot = row.slot == "AM" || row.slot == "PM";
        if row.id <= 0
            || row.target_language.trim().is_empty()
            || row.local_date.trim().is_empty()
            || !valid_slot
            || row.title.trim().is_empty()
            || row.body.trim().is_empty()
        {
            report.skipped();
            continue;
        }
        let status = match row.status.as_str() {
            "read" | "completed" => row.status.as_str(),
            _ => "unread",
        };
        let generated_at = if row.generated_at.is_empty() {
            now_sql_timestamp()
        } else {
            row.generated_at.clone()
        };
        let result = tx.execute(
            "INSERT INTO reading_articles
                (user_id, target_language, cefr_level, local_date, slot, topic, title, body,
                 status, test_correct_count, test_total_count, generated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(user_id, target_language, local_date, slot) DO UPDATE SET
               cefr_level = excluded.cefr_level,
               topic = excluded.topic,
               title = excluded.title,
               body = excluded.body,
               status = excluded.status,
               test_correct_count = excluded.test_correct_count,
               test_total_count = excluded.test_total_count,
               generated_at = excluded.generated_at",
            params![
                local_user_id,
                row.target_language,
                if row.cefr_level.is_empty() {
                    "A1"
                } else {
                    &row.cefr_level
                },
                row.local_date,
                row.slot,
                row.topic,
                row.title,
                row.body,
                status,
                row.test_correct_count,
                row.test_total_count,
                generated_at,
            ],
        );
        if let Err(e) = result {
            report.skipped();
            log::warn!("Skipped daily reading article during sync import: {}", e);
            continue;
        }
        match tx.query_row(
            "SELECT id FROM reading_articles
             WHERE user_id = ?1 AND target_language = ?2 AND local_date = ?3 AND slot = ?4",
            params![local_user_id, row.target_language, row.local_date, row.slot],
            |result| result.get(0),
        ) {
            Ok(local_id) => {
                reading_id_map.insert(row.id, local_id);
                report.imported();
            }
            Err(e) => {
                report.skipped();
                log::warn!("Failed to reconnect daily reading article: {}", e);
            }
        }
    }

    let test_article_ids: HashSet<i64> = payload
        .reading_tests
        .iter()
        .filter_map(|row| reading_id_map.get(&row.article_id).copied())
        .collect();
    for article_id in test_article_ids {
        tx.execute(
            "DELETE FROM reading_tests WHERE article_id = ?1",
            params![article_id],
        )
        .ok();
    }
    for row in &payload.reading_tests {
        let Some(local_article_id) = reading_id_map.get(&row.article_id).copied() else {
            report.skipped();
            continue;
        };
        if serde_json::from_str::<serde_json::Value>(&row.questions_json).is_err() {
            report.skipped();
            continue;
        }
        match tx.execute(
            "INSERT INTO reading_tests
                (article_id, questions_json, explanations_json, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                local_article_id,
                row.questions_json,
                if row.explanations_json.is_empty() {
                    "[]"
                } else {
                    &row.explanations_json
                },
                if row.created_at.is_empty() {
                    now_sql_timestamp()
                } else {
                    row.created_at.clone()
                },
            ],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped daily reading test during sync import: {}", e);
            }
        }
    }

    let attempt_article_ids: HashSet<i64> = payload
        .reading_test_attempts
        .iter()
        .filter_map(|row| reading_id_map.get(&row.article_id).copied())
        .collect();
    for article_id in attempt_article_ids {
        tx.execute(
            "DELETE FROM reading_test_attempts WHERE article_id = ?1 AND user_id = ?2",
            params![article_id, local_user_id],
        )
        .ok();
    }
    for row in &payload.reading_test_attempts {
        let Some(local_article_id) = reading_id_map.get(&row.article_id).copied() else {
            report.skipped();
            continue;
        };
        if serde_json::from_str::<serde_json::Value>(&row.answers_json).is_err() {
            report.skipped();
            continue;
        }
        match tx.execute(
            "INSERT INTO reading_test_attempts
                (article_id, user_id, answers_json, correct_count, total_count, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                local_article_id,
                local_user_id,
                row.answers_json,
                row.correct_count,
                row.total_count,
                if row.completed_at.is_empty() {
                    now_sql_timestamp()
                } else {
                    row.completed_at.clone()
                },
            ],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped daily reading attempt during sync import: {}", e);
            }
        }
    }

    let mut valid_speaking_session_ids = HashSet::<String>::new();
    for row in &payload.speaking_sessions {
        if row.id.trim().is_empty()
            || row.topic_id.trim().is_empty()
            || row.target_lang.trim().is_empty()
        {
            report.skipped();
            continue;
        }
        let status = match row.status.as_str() {
            "completed" => "completed",
            _ => "active",
        };
        match tx.execute(
            "INSERT INTO speaking_sessions
                (id, user_id, topic_id, target_lang, native_lang, cefr_level, current_turn,
                 current_ai_text, status, total_turns, retry_count, created_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(id) DO UPDATE SET
               user_id = excluded.user_id,
               topic_id = excluded.topic_id,
               target_lang = excluded.target_lang,
               native_lang = excluded.native_lang,
               cefr_level = excluded.cefr_level,
               current_turn = excluded.current_turn,
               current_ai_text = excluded.current_ai_text,
               status = excluded.status,
               total_turns = excluded.total_turns,
               retry_count = excluded.retry_count,
               completed_at = excluded.completed_at",
            params![
                row.id,
                local_user_id,
                row.topic_id,
                row.target_lang,
                if row.native_lang.is_empty() {
                    "zh"
                } else {
                    &row.native_lang
                },
                if row.cefr_level.is_empty() {
                    "A1"
                } else {
                    &row.cefr_level
                },
                row.current_turn.max(1),
                row.current_ai_text,
                status,
                row.total_turns.max(1),
                row.retry_count.max(0),
                if row.created_at.is_empty() {
                    now_sql_timestamp()
                } else {
                    row.created_at.clone()
                },
                row.completed_at,
            ],
        ) {
            Ok(_) => {
                valid_speaking_session_ids.insert(row.id.clone());
                report.imported();
            }
            Err(e) => {
                report.skipped();
                log::warn!("Skipped speaking session during sync import: {}", e);
            }
        }
    }

    let turn_session_ids: HashSet<&str> = payload
        .speaking_turns
        .iter()
        .filter(|row| valid_speaking_session_ids.contains(&row.session_id))
        .map(|row| row.session_id.as_str())
        .collect();
    for session_id in turn_session_ids {
        tx.execute(
            "DELETE FROM speaking_turns WHERE session_id = ?1",
            params![session_id],
        )
        .ok();
    }
    for row in &payload.speaking_turns {
        if !valid_speaking_session_ids.contains(&row.session_id)
            || row.turn_number <= 0
            || row.user_transcript.trim().is_empty()
        {
            report.skipped();
            continue;
        }
        match tx.execute(
            "INSERT INTO speaking_turns
                (session_id, turn_number, ai_text, user_transcript, scores_json, total_score,
                 used_hint, attempt_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                row.session_id,
                row.turn_number,
                row.ai_text,
                row.user_transcript,
                if row.scores_json.is_empty() {
                    "{}"
                } else {
                    &row.scores_json
                },
                row.total_score,
                if row.used_hint { 1 } else { 0 },
                row.attempt_count.max(1),
                if row.created_at.is_empty() {
                    now_sql_timestamp()
                } else {
                    row.created_at.clone()
                },
            ],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped speaking turn during sync import: {}", e);
            }
        }
    }

    let remote_session_ids: HashSet<String> = payload
        .chat_sessions
        .iter()
        .filter(|s| !s.id.is_empty())
        .map(|s| s.id.clone())
        .collect();
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
        if session.id.trim().is_empty() || session.target_language.trim().is_empty() {
            report.skipped();
            continue;
        }
        match tx.execute(
            "INSERT INTO chat_sessions (id, user_id, title, user_profile_json, conversation_summary,
             message_count, contact_type, target_language, last_message, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                session.id,
                local_user_id,
                if session.title.is_empty() { "新对话" } else { &session.title },
                if session.user_profile_json.is_empty() { "{}" } else { &session.user_profile_json },
                session.conversation_summary,
                session.message_count,
                if session.contact_type.is_empty() { "amiga" } else { &session.contact_type },
                session.target_language,
                session.last_message,
                if session.created_at.is_empty() { now_sql_timestamp() } else { session.created_at.clone() },
                if session.updated_at.is_empty() { now_sql_timestamp() } else { session.updated_at.clone() },
            ],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped chat session during sync import: {}", e);
            }
        }
    }

    for message in &payload.chat_messages {
        if !remote_session_ids.contains(&message.session_id)
            || !matches!(message.role.as_str(), "user" | "assistant" | "system")
            || message.content.is_empty()
        {
            report.skipped();
            continue;
        }
        match tx.execute(
            "INSERT INTO chat_messages (session_id, role, content, created_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                message.session_id,
                message.role,
                message.content,
                if message.created_at.is_empty() {
                    now_sql_timestamp()
                } else {
                    message.created_at.clone()
                },
            ],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped chat message during sync import: {}", e);
            }
        }
    }

    for setting in &payload.app_settings {
        if setting.key.trim().is_empty() || is_sensitive_setting(&setting.key) {
            report.skipped();
            continue;
        }
        match tx.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![setting.key, setting.value],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped app setting during sync import: {}", e);
            }
        }
    }

    for prompt in &payload.prompts {
        if prompt.key.trim().is_empty() || prompt.system_prompt.trim().is_empty() {
            report.skipped();
            continue;
        }
        match tx.execute(
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
                if prompt.updated_at.is_empty() { now_sql_timestamp() } else { prompt.updated_at.clone() },
            ],
        ) {
            Ok(_) => report.imported(),
            Err(e) => {
                report.skipped();
                log::warn!("Skipped prompt during sync import: {}", e);
            }
        }
    }

    Ok(report)
}
