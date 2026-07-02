use crate::modules::database::DatabasePool;
use chrono::{Datelike, Duration, Local, NaiveDate};
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DailyGoalProgress {
    pub lessons_today: i32,
    pub target_lessons: i32,
    pub progress_pct: i32,
    pub goal_met: bool,
    pub streak_current: i32,
    pub practiced_today: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WeeklyActivityDay {
    pub date: String,
    /// 0 = Monday … 6 = Sunday (chrono weekday mapping).
    pub weekday: u8,
    pub active: bool,
    pub is_today: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WeeklyActivity {
    pub days: Vec<WeeklyActivityDay>,
    pub active_days: i32,
}

pub fn lesson_goal_from_daily_minutes(daily_minutes: i32) -> i32 {
    match daily_minutes {
        0..=10 => 1,
        11..=20 => 2,
        _ => 3,
    }
}

/// Active-day targets for a rolling 7-day window, aligned with the frontend weekly goal card.
pub fn weekly_goal_from_daily_target(target_lessons: i32) -> i32 {
    if target_lessons >= 3 {
        6
    } else if target_lessons >= 2 {
        5
    } else {
        3
    }
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

fn load_today_activity(
    conn: &rusqlite::Connection,
    user_id: &str,
    date: &str,
) -> Result<(i32, i32, i32), String> {
    let row: Option<(i32, i32, i32)> = conn
        .query_row(
            "SELECT articles_read, words_learned, COALESCE(lessons_completed, 0)
             FROM streak_records WHERE user_id = ?1 AND date = ?2",
            params![user_id, date],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    Ok(row.unwrap_or((0, 0, 0)))
}

fn weekday_index(date: NaiveDate) -> u8 {
    use chrono::Weekday;
    match date.weekday() {
        Weekday::Mon => 0,
        Weekday::Tue => 1,
        Weekday::Wed => 2,
        Weekday::Thu => 3,
        Weekday::Fri => 4,
        Weekday::Sat => 5,
        Weekday::Sun => 6,
    }
}

pub fn get_weekly_activity(pool: &DatabasePool, user_id: &str) -> Result<WeeklyActivity, String> {
    let conn = pool.conn()?;
    let today = Local::now().date_naive();
    let mut days = Vec::with_capacity(7);
    let mut active_days = 0;

    for offset in (0..7).rev() {
        let date = today - Duration::days(offset);
        let date_str = date.format("%Y-%m-%d").to_string();
        let active = was_active_on_date(&conn, user_id, &date_str)?;
        if active {
            active_days += 1;
        }
        days.push(WeeklyActivityDay {
            date: date_str,
            weekday: weekday_index(date),
            active,
            is_today: offset == 0,
        });
    }

    Ok(WeeklyActivity { days, active_days })
}

pub fn get_daily_goal_progress(
    pool: &DatabasePool,
    user_id: &str,
    daily_minutes: i32,
) -> Result<DailyGoalProgress, String> {
    let today = today_local();
    let lessons_today = {
        let conn = pool.conn()?;
        let (_, _, lessons) = load_today_activity(&conn, user_id, &today)?;
        lessons
    };
    let target_lessons = lesson_goal_from_daily_minutes(daily_minutes);
    let progress_pct = if target_lessons > 0 {
        ((lessons_today.min(target_lessons) * 100) / target_lessons).min(100)
    } else {
        0
    };
    let goal_met = lessons_today >= target_lessons;
    let streak = get_learning_streak(pool, user_id)?;
    Ok(DailyGoalProgress {
        lessons_today,
        target_lessons,
        progress_pct,
        goal_met,
        streak_current: streak.current,
        practiced_today: streak.practiced_today,
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

/// Records spaced-repetition review (vocab flashcards, mistake review) toward today's streak.
pub fn record_review_practice(
    pool: &DatabasePool,
    user_id: &str,
    items_reviewed: i32,
) -> Result<StreakUpdate, String> {
    let count = items_reviewed.max(1);
    let today = today_local();
    let was_active_today = {
        let conn = pool.conn()?;
        let was_active = was_active_on_date(&conn, user_id, &today)?;
        conn.execute(
            "INSERT INTO streak_records (user_id, date, words_learned)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(user_id, date) DO UPDATE SET
               words_learned = words_learned + ?3",
            params![user_id, today, count],
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

    #[test]
    fn review_practice_starts_streak() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let update = record_review_practice(&pool, &user, 3).unwrap();
        assert!(update.extended);
        assert_eq!(update.current, 1);
        assert!(update.practiced_today);

        let streak = get_learning_streak(&pool, &user).unwrap();
        assert_eq!(streak.current, 1);
        assert!(streak.practiced_today);
    }

    #[test]
    fn review_practice_same_day_does_not_reextend_streak() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_review_practice(&pool, &user, 2).unwrap();
        let update = record_review_practice(&pool, &user, 4).unwrap();
        assert!(!update.extended);
        assert_eq!(update.current, 1);
    }

    #[test]
    fn review_practice_counts_at_least_one_item() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_review_practice(&pool, &user, 0).unwrap();
        let today = today_local();
        let conn = pool.conn().unwrap();
        let words: i32 = conn
            .query_row(
                "SELECT words_learned FROM streak_records WHERE user_id = ?1 AND date = ?2",
                params![user, today],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(words, 1);
    }

    #[test]
    fn lesson_goal_from_daily_minutes_maps_intensity() {
        assert_eq!(lesson_goal_from_daily_minutes(5), 1);
        assert_eq!(lesson_goal_from_daily_minutes(10), 1);
        assert_eq!(lesson_goal_from_daily_minutes(15), 2);
        assert_eq!(lesson_goal_from_daily_minutes(20), 2);
        assert_eq!(lesson_goal_from_daily_minutes(30), 3);
    }

    #[test]
    fn weekly_goal_from_daily_target_maps_intensity() {
        assert_eq!(weekly_goal_from_daily_target(1), 3);
        assert_eq!(weekly_goal_from_daily_target(2), 5);
        assert_eq!(weekly_goal_from_daily_target(3), 6);
    }

    #[test]
    fn daily_goal_progress_tracks_lessons_today() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_lesson_completed(&pool, &user).unwrap();

        let progress = get_daily_goal_progress(&pool, &user, 15).unwrap();
        assert_eq!(progress.lessons_today, 1);
        assert_eq!(progress.target_lessons, 2);
        assert_eq!(progress.progress_pct, 50);
        assert!(!progress.goal_met);
        assert_eq!(progress.streak_current, 1);
        assert!(progress.practiced_today);
    }

    #[test]
    fn daily_goal_met_when_target_reached() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_lesson_completed(&pool, &user).unwrap();
        record_lesson_completed(&pool, &user).unwrap();

        let progress = get_daily_goal_progress(&pool, &user, 15).unwrap();
        assert_eq!(progress.lessons_today, 2);
        assert!(progress.goal_met);
        assert_eq!(progress.progress_pct, 100);
    }

    #[test]
    fn weekly_activity_returns_last_seven_days() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let today = Local::now().date_naive();
        let yesterday = today - Duration::days(1);
        let three_days_ago = today - Duration::days(3);

        insert_active_day(
            &pool,
            &user,
            &yesterday.format("%Y-%m-%d").to_string(),
            1,
        );
        insert_active_day(
            &pool,
            &user,
            &three_days_ago.format("%Y-%m-%d").to_string(),
            1,
        );
        record_lesson_completed(&pool, &user).unwrap();

        let activity = get_weekly_activity(&pool, &user).unwrap();
        assert_eq!(activity.days.len(), 7);
        assert_eq!(activity.active_days, 3);
        assert!(activity.days.last().unwrap().is_today);
        assert!(activity.days.last().unwrap().active);
        assert!(activity.days[activity.days.len() - 2].active);
        assert!(!activity.days[0].is_today);
    }

    #[test]
    fn weekly_activity_empty_when_no_practice() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let activity = get_weekly_activity(&pool, &user).unwrap();
        assert_eq!(activity.days.len(), 7);
        assert_eq!(activity.active_days, 0);
        assert!(!activity.days.iter().any(|d| d.active));
    }
}