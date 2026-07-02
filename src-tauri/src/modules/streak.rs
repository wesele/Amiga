use crate::modules::database::DatabasePool;
use chrono::{Duration, Local, NaiveDate};
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LearningStreak {
    pub current: i32,
    pub longest: i32,
    pub practiced_today: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StreakUpdate {
    pub current: i32,
    pub extended: bool,
    pub practiced_today: bool,
}

fn today_local() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

fn is_active_row(articles_read: i32, words_learned: i32, lessons_completed: i32) -> bool {
    articles_read > 0 || words_learned > 0 || lessons_completed > 0
}

fn load_active_dates(conn: &rusqlite::Connection, user_id: &str) -> Result<Vec<NaiveDate>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT date, articles_read, words_learned, COALESCE(lessons_completed, 0)
             FROM streak_records WHERE user_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, i32>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut dates = Vec::new();
    for row in rows.flatten() {
        let (date, articles_read, words_learned, lessons_completed) = row;
        if is_active_row(articles_read, words_learned, lessons_completed) {
            if let Some(parsed) = parse_date(&date) {
                dates.push(parsed);
            }
        }
    }
    Ok(dates)
}

fn compute_current_streak(active_dates: &[NaiveDate], today: NaiveDate) -> i32 {
    let active: std::collections::HashSet<_> = active_dates.iter().copied().collect();
    let anchor = if active.contains(&today) {
        today
    } else if active.contains(&(today - Duration::days(1))) {
        today - Duration::days(1)
    } else {
        return 0;
    };

    let mut streak = 0;
    let mut cursor = anchor;
    while active.contains(&cursor) {
        streak += 1;
        cursor -= Duration::days(1);
    }
    streak
}

fn compute_longest_streak(active_dates: &[NaiveDate]) -> i32 {
    if active_dates.is_empty() {
        return 0;
    }
    let mut sorted = active_dates.to_vec();
    sorted.sort_unstable();
    sorted.dedup();

    let mut longest = 1;
    let mut run = 1;
    for window in sorted.windows(2) {
        if window[1] - window[0] == Duration::days(1) {
            run += 1;
            longest = longest.max(run);
        } else {
            run = 1;
        }
    }
    longest
}

pub fn get_learning_streak(pool: &DatabasePool, user_id: &str) -> Result<LearningStreak, String> {
    let conn = pool.conn()?;
    let today = Local::now().date_naive();
    let active_dates = load_active_dates(&conn, user_id)?;
    let practiced_today = active_dates.iter().any(|d| *d == today);
    Ok(LearningStreak {
        current: compute_current_streak(&active_dates, today),
        longest: compute_longest_streak(&active_dates),
        practiced_today,
    })
}

fn was_active_on_date(conn: &rusqlite::Connection, user_id: &str, date: &str) -> Result<bool, String> {
    let row: Option<(i32, i32, i32)> = conn
        .query_row(
            "SELECT articles_read, words_learned, COALESCE(lessons_completed, 0)
             FROM streak_records WHERE user_id = ?1 AND date = ?2",
            params![user_id, date],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    Ok(row
        .map(|(a, w, l)| is_active_row(a, w, l))
        .unwrap_or(false))
}

pub fn record_lesson_completed(pool: &DatabasePool, user_id: &str) -> Result<StreakUpdate, String> {
    let today = today_local();
    let was_active_today = {
        let conn = pool.conn()?;
        let was_active = was_active_on_date(&conn, user_id, &today)?;
        conn.execute(
            "INSERT INTO streak_records (user_id, date, lessons_completed)
             VALUES (?1, ?2, 1)
             ON CONFLICT(user_id, date) DO UPDATE SET
               lessons_completed = COALESCE(lessons_completed, 0) + 1",
            params![user_id, today],
        )
        .map_err(|e| e.to_string())?;
        was_active
    };

    let streak = get_learning_streak(pool, user_id)?;
    Ok(StreakUpdate {
        current: streak.current,
        extended: !was_active_today,
        practiced_today: true,
    })
}

pub fn record_article_read(pool: &DatabasePool, user_id: &str) -> Result<(), String> {
    let today = today_local();
    let conn = pool.conn()?;
    conn.execute(
        "INSERT INTO streak_records (user_id, date, articles_read)
         VALUES (?1, ?2, 1)
         ON CONFLICT(user_id, date) DO UPDATE SET articles_read = articles_read + 1",
        params![user_id, today],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::DatabasePool;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    fn seed_user(pool: &DatabasePool) -> String {
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname) VALUES ('u1', 'Test')",
            [],
        )
        .unwrap();
        "u1".to_string()
    }

    fn insert_active_day(pool: &DatabasePool, user_id: &str, date: &str, lessons: i32) {
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO streak_records (user_id, date, lessons_completed)
             VALUES (?1, ?2, ?3)",
            params![user_id, date, lessons],
        )
        .unwrap();
    }

    #[test]
    fn empty_streak_is_zero() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let streak = get_learning_streak(&pool, &user).unwrap();
        assert_eq!(streak.current, 0);
        assert_eq!(streak.longest, 0);
        assert!(!streak.practiced_today);
    }

    #[test]
    fn record_lesson_starts_streak() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let update = record_lesson_completed(&pool, &user).unwrap();
        assert!(update.extended);
        assert_eq!(update.current, 1);
        let streak = get_learning_streak(&pool, &user).unwrap();
        assert_eq!(streak.current, 1);
        assert_eq!(streak.longest, 1);
        assert!(streak.practiced_today);
    }

    #[test]
    fn second_lesson_same_day_does_not_extend_again() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_lesson_completed(&pool, &user).unwrap();
        let update = record_lesson_completed(&pool, &user).unwrap();
        assert!(!update.extended);
        assert_eq!(update.current, 1);
    }

    #[test]
    fn consecutive_days_increase_current_streak() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let today = Local::now().date_naive();
        let yesterday = today - Duration::days(1);
        insert_active_day(&pool, &user, &yesterday.format("%Y-%m-%d").to_string(), 1);

        let update = record_lesson_completed(&pool, &user).unwrap();
        assert!(update.extended);
        assert_eq!(update.current, 2);

        let streak = get_learning_streak(&pool, &user).unwrap();
        assert_eq!(streak.current, 2);
        assert_eq!(streak.longest, 2);
    }

    #[test]
    fn gap_resets_current_but_keeps_longest() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let today = Local::now().date_naive();
        let three_days_ago = today - Duration::days(3);
        let four_days_ago = today - Duration::days(4);
        insert_active_day(
            &pool,
            &user,
            &four_days_ago.format("%Y-%m-%d").to_string(),
            1,
        );
        insert_active_day(
            &pool,
            &user,
            &three_days_ago.format("%Y-%m-%d").to_string(),
            1,
        );

        let streak = get_learning_streak(&pool, &user).unwrap();
        assert_eq!(streak.current, 0);
        assert_eq!(streak.longest, 2);
    }

    #[test]
    fn article_read_counts_toward_streak() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_article_read(&pool, &user).unwrap();
        let streak = get_learning_streak(&pool, &user).unwrap();
        assert_eq!(streak.current, 1);
        assert!(streak.practiced_today);
    }
}