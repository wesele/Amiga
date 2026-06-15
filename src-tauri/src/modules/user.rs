use rusqlite::params;
use serde::{Deserialize, Serialize};
use log;
use crate::modules::database::DatabasePool;

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
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

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
            ).ok();
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

pub fn create_user_from_wizard(db: &DatabasePool, request: CreateUserRequest) -> Result<User, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

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
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    if let Some(nickname) = &request.nickname {
        conn.execute("UPDATE users SET nickname = ?1 WHERE id = ?2", params![nickname, request.id]).ok();
    }
    if let Some(avatar) = &request.avatar {
        conn.execute("UPDATE users SET avatar = ?1 WHERE id = ?2", params![avatar, request.id]).ok();
    }
    if let Some(native_language) = &request.native_language {
        conn.execute("UPDATE users SET native_language = ?1 WHERE id = ?2", params![native_language, request.id]).ok();
    }
    if let Some(country) = &request.country {
        conn.execute("UPDATE users SET country = ?1 WHERE id = ?2", params![country, request.id]).ok();
    }
    if let Some(gender) = &request.gender {
        conn.execute("UPDATE users SET gender = ?1 WHERE id = ?2", params![gender, request.id]).ok();
    }
    if let Some(birth_year) = request.birth_year {
        conn.execute("UPDATE users SET birth_year = ?1 WHERE id = ?2", params![birth_year, request.id]).ok();
    }

    drop(conn);
    // Return updated user
    get_user_by_id(db, &request.id)
}

fn get_user_by_id(db: &DatabasePool, id: &str) -> Result<User, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
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
    ).map_err(|e| format!("User not found: {}", e))
}

pub fn is_wizard_completed(db: &DatabasePool) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let result: i32 = conn
        .query_row("SELECT COALESCE(MAX(wizard_completed), 0) FROM users", [], |row| row.get(0))
        .unwrap_or(0);
    Ok(result != 0)
}

pub fn save_learning_goal(db: &DatabasePool, goal: LearningGoal) -> Result<LearningGoal, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    conn.execute(
        "INSERT INTO learning_goals (user_id, target_language, cefr_level, daily_minutes, objective)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![goal.user_id, goal.target_language, goal.cefr_level, goal.daily_minutes, goal.objective],
    ).map_err(|e| format!("Failed to save learning goal: {}", e))?;

    let id = conn.last_insert_rowid() as i32;
    log::info!("Learning goal saved: user={} lang={} level={}", goal.user_id, goal.target_language, goal.cefr_level);

    Ok(LearningGoal {
        id: Some(id),
        ..goal
    })
}

pub fn get_learning_goals(db: &DatabasePool, user_id: &str) -> Result<Vec<LearningGoal>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut stmt = conn.prepare(
        "SELECT id, user_id, target_language, cefr_level, daily_minutes, objective
         FROM learning_goals WHERE user_id = ?1"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;

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
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;
    conn.execute("UPDATE users SET wizard_completed = 0", [])
        .map_err(|e| format!("Failed to reset wizard: {}", e))?;
    log::info!("Wizard reset");
    Ok(())
}
