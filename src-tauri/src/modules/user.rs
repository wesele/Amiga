use crate::modules::database::DatabasePool;
use log;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests {
    use super::*;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    #[test]
    fn test_get_or_create_user_creates_default() {
        let pool = test_pool();
        let user = get_or_create_user(&pool).unwrap();
        assert_eq!(user.nickname, "学习者");
        assert_eq!(user.avatar, "😊");
        assert_eq!(user.native_language, "zh");
        assert_eq!(user.country, "CN");
        assert_eq!(user.wizard_completed, false);
    }

    #[test]
    fn test_get_or_create_user_returns_same_user() {
        let pool = test_pool();
        let user1 = get_or_create_user(&pool).unwrap();
        let user2 = get_or_create_user(&pool).unwrap();
        assert_eq!(user1.id, user2.id);
    }

    #[test]
    fn test_create_user_from_wizard_creates_user() {
        let pool = test_pool();
        let request = CreateUserRequest {
            nickname: "TestUser".to_string(),
            avatar: "🐱".to_string(),
            native_language: "en".to_string(),
            country: "US".to_string(),
            gender: Some("male".to_string()),
            birth_year: Some(1990),
        };
        let user = create_user_from_wizard(&pool, request).unwrap();
        assert_eq!(user.nickname, "TestUser");
        assert_eq!(user.avatar, "🐱");
        assert_eq!(user.wizard_completed, true);
    }

    #[test]
    fn test_create_user_from_wizard_sets_wizard_completed() {
        let pool = test_pool();
        let request = CreateUserRequest {
            nickname: "Test".to_string(),
            avatar: "😊".to_string(),
            native_language: "zh".to_string(),
            country: "CN".to_string(),
            gender: None,
            birth_year: None,
        };
        let user = create_user_from_wizard(&pool, request).unwrap();
        assert_eq!(user.wizard_completed, true);
    }

    #[test]
    fn test_wizard_completed_false_by_default() {
        let pool = test_pool();
        let completed = is_wizard_completed(&pool).unwrap();
        assert_eq!(completed, false);
    }

    #[test]
    fn test_wizard_completed_true_after_create() {
        let pool = test_pool();
        let request = CreateUserRequest {
            nickname: "Test".to_string(),
            avatar: "😊".to_string(),
            native_language: "zh".to_string(),
            country: "CN".to_string(),
            gender: None,
            birth_year: None,
        };
        create_user_from_wizard(&pool, request).unwrap();
        let completed = is_wizard_completed(&pool).unwrap();
        assert_eq!(completed, true);
    }

    #[test]
    fn test_update_user_nickname() {
        let pool = test_pool();
        let user = get_or_create_user(&pool).unwrap();
        let update = UpdateUserRequest {
            id: user.id.clone(),
            nickname: Some("NewName".to_string()),
            avatar: None,
            native_language: None,
            country: None,
            gender: None,
            birth_year: None,
        };
        let updated = update_user(&pool, update).unwrap();
        assert_eq!(updated.nickname, "NewName");
    }

    #[test]
    fn test_update_user_avatar() {
        let pool = test_pool();
        let user = get_or_create_user(&pool).unwrap();
        let update = UpdateUserRequest {
            id: user.id,
            nickname: None,
            avatar: Some("🌟".to_string()),
            native_language: None,
            country: None,
            gender: None,
            birth_year: None,
        };
        let updated = update_user(&pool, update).unwrap();
        assert_eq!(updated.avatar, "🌟");
    }

    #[test]
    fn test_save_and_get_learning_goals() {
        let pool = test_pool();
        let user = get_or_create_user(&pool).unwrap();
        let goal = LearningGoal {
            id: None,
            user_id: user.id.clone(),
            target_language: "es".to_string(),
            cefr_level: "A1".to_string(),
            daily_minutes: 15,
            objective: "daily_conversation".to_string(),
        };
        let saved = save_learning_goal(&pool, goal).unwrap();
        assert!(saved.id.is_some());

        let goals = get_learning_goals(&pool, &user.id).unwrap();
        assert_eq!(goals.len(), 1);
        assert_eq!(goals[0].target_language, "es");
        assert_eq!(goals[0].cefr_level, "A1");
    }

    #[test]
    fn test_multiple_learning_goals() {
        let pool = test_pool();
        let user = get_or_create_user(&pool).unwrap();

        for lang in &["es", "fr", "de"] {
            let goal = LearningGoal {
                id: None,
                user_id: user.id.clone(),
                target_language: lang.to_string(),
                cefr_level: "A1".to_string(),
                daily_minutes: 15,
                objective: "daily_conversation".to_string(),
            };
            save_learning_goal(&pool, goal).unwrap();
        }

        let goals = get_learning_goals(&pool, &user.id).unwrap();
        assert_eq!(goals.len(), 3);
    }

    #[test]
    fn test_get_learning_goals_empty_for_unknown_user() {
        let pool = test_pool();
        let goals = get_learning_goals(&pool, "nonexistent-user").unwrap();
        assert!(goals.is_empty());
    }

    #[test]
    fn test_reset_wizard() {
        let pool = test_pool();
        let request = CreateUserRequest {
            nickname: "Test".to_string(),
            avatar: "😊".to_string(),
            native_language: "zh".to_string(),
            country: "CN".to_string(),
            gender: None,
            birth_year: None,
        };
        create_user_from_wizard(&pool, request).unwrap();
        assert_eq!(is_wizard_completed(&pool).unwrap(), true);

        reset_wizard(&pool).unwrap();
        assert_eq!(is_wizard_completed(&pool).unwrap(), false);
    }

    #[test]
    fn test_get_target_language_defaults_to_es() {
        let pool = test_pool();
        let lang = get_target_language(&pool).unwrap();
        assert_eq!(lang, "es");
    }

    #[test]
    fn test_set_target_language_creates_goal_and_persists() {
        let pool = test_pool();
        // Need a user to be referenced from the goal row.
        get_or_create_user(&pool).unwrap();

        set_target_language(&pool, "en").unwrap();

        // Returns the same value.
        assert_eq!(get_target_language(&pool).unwrap(), "en");

        // A learning_goals row should have been created for the user.
        let conn = pool.conn.lock().unwrap();
        let count: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM learning_goals WHERE target_language = 'en'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(count >= 1, "Should have at least one en goal row");
    }

    #[test]
    fn test_set_target_language_switching_preserves_other_goals() {
        let pool = test_pool();
        get_or_create_user(&pool).unwrap();

        set_target_language(&pool, "es").unwrap();
        set_target_language(&pool, "en").unwrap();
        set_target_language(&pool, "zh").unwrap();

        let langs: Vec<String> = {
            let conn = pool.conn.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT target_language FROM learning_goals ORDER BY id")
                .unwrap();
            stmt.query_map([], |row| row.get(0))
                .unwrap()
                .filter_map(|r| r.ok())
                .collect()
        };
        assert_eq!(langs, vec!["es", "en", "zh"]);

        // The current setting still points at the last one.
        assert_eq!(get_target_language(&pool).unwrap(), "zh");
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct User {
    pub id: String,
    pub nickname: String,
    pub avatar: String,
    pub native_language: String,
    pub country: String,
    pub gender: String,
    pub birth_year: Option<i32>,
    pub wizard_completed: bool,
    pub created_at: String,
    pub last_active_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub nickname: String,
    pub avatar: String,
    pub native_language: String,
    pub country: String,
    pub gender: Option<String>,
    pub birth_year: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub id: String,
    pub nickname: Option<String>,
    pub avatar: Option<String>,
    pub native_language: Option<String>,
    pub country: Option<String>,
    pub gender: Option<String>,
    pub birth_year: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LearningGoal {
    pub id: Option<i32>,
    pub user_id: String,
    pub target_language: String,
    pub cefr_level: String,
    pub daily_minutes: i32,
    pub objective: String,
}

pub fn get_or_create_user(db: &DatabasePool) -> Result<User, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    // Try to get existing user
    let result = conn.query_row(
        "SELECT id, nickname, avatar, native_language, country, gender, birth_year,
                wizard_completed, created_at, last_active_date
         FROM users LIMIT 1",
        [],
        |row| {
            Ok(User {
                id: row.get(0)?,
                nickname: row.get(1)?,
                avatar: row.get(2)?,
                native_language: row.get(3)?,
                country: row.get(4)?,
                gender: row.get(5).unwrap_or_else(|_| "private".to_string()),
                birth_year: row.get(6)?,
                wizard_completed: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                last_active_date: row.get(9)?,
            })
        },
    );

    match result {
        Ok(user) => {
            // Update last active date
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            conn.execute(
                "UPDATE users SET last_active_date = ?1 WHERE id = ?2",
                params![today, user.id],
            )
            .ok();
            log::debug!("Existing user loaded: {}", user.id);
            Ok(user)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // Create default user
            let id = uuid::Uuid::new_v4().to_string();
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            conn.execute(
                "INSERT INTO users (id, nickname, avatar, native_language, country, gender, last_active_date)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, "学习者", "😊", "zh", "CN", "private", today],
            ).map_err(|e| format!("Failed to create user: {}", e))?;

            log::info!("New default user created: {}", id);
            Ok(User {
                id,
                nickname: "学习者".to_string(),
                avatar: "😊".to_string(),
                native_language: "zh".to_string(),
                country: "CN".to_string(),
                gender: "private".to_string(),
                birth_year: None,
                wizard_completed: false,
                created_at: today.clone(),
                last_active_date: Some(today),
            })
        }
        Err(e) => Err(format!("Failed to query user: {}", e)),
    }
}

pub fn create_user_from_wizard(
    db: &DatabasePool,
    request: CreateUserRequest,
) -> Result<User, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    // Check if user already exists
    let existing: Option<String> = conn
        .query_row("SELECT id FROM users LIMIT 1", [], |row| row.get(0))
        .ok();

    let id = existing.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    conn.execute(
        "INSERT OR REPLACE INTO users (id, nickname, avatar, native_language, country, gender, birth_year,
         wizard_completed, created_at, last_active_date)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9)",
        params![
            id,
            request.nickname,
            request.avatar,
            request.native_language,
            request.country,
            request.gender.unwrap_or_else(|| "private".to_string()),
            request.birth_year,
            today,
            today,
        ],
    ).map_err(|e| format!("Failed to create user: {}", e))?;

    log::info!("User created/updated from wizard: {}", id);

    Ok(User {
        id,
        nickname: request.nickname,
        avatar: request.avatar,
        native_language: request.native_language,
        country: request.country,
        gender: "private".to_string(),
        birth_year: request.birth_year,
        wizard_completed: true,
        created_at: today.clone(),
        last_active_date: Some(today),
    })
}

pub fn update_user(db: &DatabasePool, request: UpdateUserRequest) -> Result<User, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    if let Some(nickname) = &request.nickname {
        conn.execute(
            "UPDATE users SET nickname = ?1 WHERE id = ?2",
            params![nickname, request.id],
        )
        .ok();
    }
    if let Some(avatar) = &request.avatar {
        conn.execute(
            "UPDATE users SET avatar = ?1 WHERE id = ?2",
            params![avatar, request.id],
        )
        .ok();
    }
    if let Some(native_language) = &request.native_language {
        conn.execute(
            "UPDATE users SET native_language = ?1 WHERE id = ?2",
            params![native_language, request.id],
        )
        .ok();
    }
    if let Some(country) = &request.country {
        conn.execute(
            "UPDATE users SET country = ?1 WHERE id = ?2",
            params![country, request.id],
        )
        .ok();
    }
    if let Some(gender) = &request.gender {
        conn.execute(
            "UPDATE users SET gender = ?1 WHERE id = ?2",
            params![gender, request.id],
        )
        .ok();
    }
    if let Some(birth_year) = request.birth_year {
        conn.execute(
            "UPDATE users SET birth_year = ?1 WHERE id = ?2",
            params![birth_year, request.id],
        )
        .ok();
    }

    drop(conn);
    // Return updated user
    get_user_by_id(db, &request.id)
}

fn get_user_by_id(db: &DatabasePool, id: &str) -> Result<User, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    conn.query_row(
        "SELECT id, nickname, avatar, native_language, country, gender, birth_year,
                wizard_completed, created_at, last_active_date
         FROM users WHERE id = ?1",
        params![id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                nickname: row.get(1)?,
                avatar: row.get(2)?,
                native_language: row.get(3)?,
                country: row.get(4)?,
                gender: row.get(5).unwrap_or_else(|_| "private".to_string()),
                birth_year: row.get(6)?,
                wizard_completed: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                last_active_date: row.get(9)?,
            })
        },
    )
    .map_err(|e| format!("User not found: {}", e))
}

pub fn is_wizard_completed(db: &DatabasePool) -> Result<bool, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let result: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(wizard_completed), 0) FROM users",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(result != 0)
}

pub fn save_learning_goal(db: &DatabasePool, goal: LearningGoal) -> Result<LearningGoal, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    conn.execute(
        "INSERT INTO learning_goals (user_id, target_language, cefr_level, daily_minutes, objective)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![goal.user_id, goal.target_language, goal.cefr_level, goal.daily_minutes, goal.objective],
    ).map_err(|e| format!("Failed to save learning goal: {}", e))?;

    let id = conn.last_insert_rowid() as i32;
    log::info!(
        "Learning goal saved: user={} lang={} level={}",
        goal.user_id,
        goal.target_language,
        goal.cefr_level
    );

    Ok(LearningGoal {
        id: Some(id),
        ..goal
    })
}

pub fn get_learning_goals(db: &DatabasePool, user_id: &str) -> Result<Vec<LearningGoal>, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, user_id, target_language, cefr_level, daily_minutes, objective
         FROM learning_goals WHERE user_id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let goals: Vec<LearningGoal> = stmt
        .query_map(params![user_id], |row| {
            Ok(LearningGoal {
                id: Some(row.get(0)?),
                user_id: row.get(1)?,
                target_language: row.get(2)?,
                cefr_level: row.get(3)?,
                daily_minutes: row.get(4)?,
                objective: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query learning goals: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(goals)
}

pub fn reset_wizard(db: &DatabasePool) -> Result<(), String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute("UPDATE users SET wizard_completed = 0", [])
        .map_err(|e| format!("Failed to reset wizard: {}", e))?;
    log::info!("Wizard reset");
    Ok(())
}

/// Set the user's currently active target language. The choice is persisted
/// in `app_settings` under the key `current_target_language` and is the
/// single source of truth for "which language am I learning right now?".
/// The function also ensures a `learning_goals` row exists for that language
/// (creating one with default level A1 / 15min / daily_conversation if not)
/// so that downstream queries that join on goals continue to work.
pub fn set_target_language(db: &DatabasePool, language: &str) -> Result<String, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    // Look up the user (single-user local mode).
    let user_id: String = conn
        .query_row("SELECT id FROM users LIMIT 1", [], |row| row.get(0))
        .map_err(|e| format!("No user found: {}", e))?;

    // Persist the choice in app_settings.
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('current_target_language', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![language],
    )
    .map_err(|e| format!("Failed to persist current_target_language: {}", e))?;

    // Ensure a learning_goals row exists for this language.
    let existing: Option<i32> = conn
        .query_row(
            "SELECT id FROM learning_goals WHERE user_id = ?1 AND target_language = ?2",
            params![user_id, language],
            |row| row.get(0),
        )
        .ok();

    if existing.is_none() {
        conn.execute(
            "INSERT INTO learning_goals (user_id, target_language, cefr_level, daily_minutes, objective)
             VALUES (?1, ?2, 'A1', 15, 'daily_conversation')",
            params![user_id, language],
        )
        .map_err(|e| format!("Failed to create learning goal: {}", e))?;
        log::info!("Created new learning goal for {} in {}", user_id, language);
    }

    log::info!("Current target language set to {}", language);
    Ok(language.to_string())
}

/// Get the user's currently active target language. Resolution order:
/// 1. `app_settings.current_target_language` (set by `set_target_language`)
/// 2. `learning_goals.target_language` of the most recent goal
/// 3. Default to "es"
pub fn get_target_language(db: &DatabasePool) -> Result<String, String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))?;

    let from_settings: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'current_target_language'",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(lang) = from_settings {
        if !lang.is_empty() {
            return Ok(lang);
        }
    }

    let from_goals: Option<String> = conn
        .query_row(
            "SELECT target_language FROM learning_goals ORDER BY id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(from_goals.unwrap_or_else(|| "es".to_string()))
}
