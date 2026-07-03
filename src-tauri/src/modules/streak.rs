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

/// Max review sessions that count toward today's lesson goal (busy-day rescue cap).
pub const REVIEW_SESSION_DAILY_CAP: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DailyGoalProgress {
    pub lessons_today: i32,
    #[serde(default)]
    pub review_sessions_today: i32,
    #[serde(default)]
    pub effective_lessons_today: i32,
    #[serde(default)]
    pub articles_read_today: i32,
    #[serde(default)]
    pub words_reviewed_today: i32,
    pub target_lessons: i32,
    pub progress_pct: i32,
    pub goal_met: bool,
    pub streak_current: i32,
    pub practiced_today: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReviewPracticeResult {
    pub streak: StreakUpdate,
    pub daily_goal: DailyGoalProgress,
    pub daily_goal_just_met: bool,
}

pub fn review_credit(review_sessions_today: i32) -> i32 {
    review_sessions_today.min(REVIEW_SESSION_DAILY_CAP)
}

pub fn effective_lessons_today(
    lessons_today: i32,
    review_sessions_today: i32,
    target_lessons: i32,
) -> i32 {
    let credit = review_credit(review_sessions_today);
    (lessons_today + credit).min(target_lessons)
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

fn was_active_on_date(
    conn: &rusqlite::Connection,
    user_id: &str,
    date: &str,
) -> Result<bool, String> {
    let row: Option<(i32, i32, i32)> = conn
        .query_row(
            "SELECT articles_read, words_learned, COALESCE(lessons_completed, 0)
             FROM streak_records WHERE user_id = ?1 AND date = ?2",
            params![user_id, date],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    Ok(row.map(|(a, w, l)| is_active_row(a, w, l)).unwrap_or(false))
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
) -> Result<(i32, i32, i32, i32), String> {
    let row: Option<(i32, i32, i32, i32)> = conn
        .query_row(
            "SELECT articles_read, words_learned, COALESCE(lessons_completed, 0),
                    COALESCE(review_sessions, 0)
             FROM streak_records WHERE user_id = ?1 AND date = ?2",
            params![user_id, date],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .ok();
    Ok(row.unwrap_or((0, 0, 0, 0)))
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
    let (articles_read_today, words_reviewed_today, lessons_today, review_sessions_today) = {
        let conn = pool.conn()?;
        let (articles, words, lessons, review_sessions) =
            load_today_activity(&conn, user_id, &today)?;
        (articles, words, lessons, review_sessions)
    };
    let target_lessons = lesson_goal_from_daily_minutes(daily_minutes);
    let effective = effective_lessons_today(lessons_today, review_sessions_today, target_lessons);
    let progress_pct = if target_lessons > 0 {
        ((effective * 100) / target_lessons).min(100)
    } else {
        0
    };
    let goal_met = effective >= target_lessons;
    let streak = get_learning_streak(pool, user_id)?;
    Ok(DailyGoalProgress {
        lessons_today,
        review_sessions_today,
        effective_lessons_today: effective,
        articles_read_today,
        words_reviewed_today,
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
    session_complete: bool,
    daily_minutes: i32,
) -> Result<ReviewPracticeResult, String> {
    let count = items_reviewed.max(1);
    let today = today_local();
    let goal_met_before = if session_complete {
        get_daily_goal_progress(pool, user_id, daily_minutes)
            .map(|p| p.goal_met)
            .unwrap_or(false)
    } else {
        false
    };
    let session_delta = if session_complete { 1 } else { 0 };
    let was_active_today = {
        let conn = pool.conn()?;
        let was_active = was_active_on_date(&conn, user_id, &today)?;
        conn.execute(
            "INSERT INTO streak_records (user_id, date, words_learned, review_sessions)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, date) DO UPDATE SET
               words_learned = words_learned + ?3,
               review_sessions = COALESCE(review_sessions, 0) + ?4",
            params![user_id, today, count, session_delta],
        )
        .map_err(|e| e.to_string())?;
        was_active
    };

    let streak = get_learning_streak(pool, user_id)?;
    let daily_goal = get_daily_goal_progress(pool, user_id, daily_minutes)?;
    let daily_goal_just_met = session_complete && !goal_met_before && daily_goal.goal_met;
    Ok(ReviewPracticeResult {
        streak: StreakUpdate {
            current: streak.current,
            extended: !was_active_today,
            practiced_today: true,
        },
        daily_goal,
        daily_goal_just_met,
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
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
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
        let result = record_review_practice(&pool, &user, 3, false, 15).unwrap();
        assert!(result.streak.extended);
        assert_eq!(result.streak.current, 1);
        assert!(result.streak.practiced_today);

        let streak = get_learning_streak(&pool, &user).unwrap();
        assert_eq!(streak.current, 1);
        assert!(streak.practiced_today);
    }

    #[test]
    fn review_practice_same_day_does_not_reextend_streak() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_review_practice(&pool, &user, 2, false, 15).unwrap();
        let result = record_review_practice(&pool, &user, 4, false, 15).unwrap();
        assert!(!result.streak.extended);
        assert_eq!(result.streak.current, 1);
    }

    #[test]
    fn review_practice_counts_at_least_one_item() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_review_practice(&pool, &user, 0, false, 15).unwrap();
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
    fn review_credit_caps_at_one_session() {
        assert_eq!(review_credit(0), 0);
        assert_eq!(review_credit(1), 1);
        assert_eq!(review_credit(3), 1);
    }

    #[test]
    fn review_session_counts_toward_daily_goal_when_target_is_one() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let result = record_review_practice(&pool, &user, 5, true, 5).unwrap();
        assert!(result.daily_goal_just_met);
        assert_eq!(result.daily_goal.review_sessions_today, 1);
        assert_eq!(result.daily_goal.effective_lessons_today, 1);
        assert!(result.daily_goal.goal_met);

        let progress = get_daily_goal_progress(&pool, &user, 5).unwrap();
        assert!(progress.goal_met);
        assert_eq!(progress.effective_lessons_today, 1);
    }

    #[test]
    fn review_session_partially_counts_when_target_is_two() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let result = record_review_practice(&pool, &user, 5, true, 15).unwrap();
        assert!(!result.daily_goal_just_met);
        assert_eq!(result.daily_goal.target_lessons, 2);
        assert_eq!(result.daily_goal.effective_lessons_today, 1);
        assert!(!result.daily_goal.goal_met);

        record_lesson_completed(&pool, &user).unwrap();
        let progress = get_daily_goal_progress(&pool, &user, 15).unwrap();
        assert!(progress.goal_met);
        assert_eq!(progress.lessons_today, 1);
        assert_eq!(progress.effective_lessons_today, 2);
    }

    #[test]
    fn second_review_session_same_day_does_not_add_more_credit() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_review_practice(&pool, &user, 5, true, 15).unwrap();
        let result = record_review_practice(&pool, &user, 5, true, 15).unwrap();
        assert_eq!(result.daily_goal.review_sessions_today, 2);
        assert_eq!(result.daily_goal.effective_lessons_today, 1);
        assert!(!result.daily_goal.goal_met);
    }

    #[test]
    fn incomplete_review_does_not_increment_review_sessions() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let result = record_review_practice(&pool, &user, 2, false, 5).unwrap();
        assert_eq!(result.daily_goal.review_sessions_today, 0);
        assert!(!result.daily_goal.goal_met);
    }

    #[test]
    fn weekly_activity_returns_last_seven_days() {
        let pool = test_pool();
        let user = seed_user(&pool);
        let today = Local::now().date_naive();
        let yesterday = today - Duration::days(1);
        let three_days_ago = today - Duration::days(3);

        insert_active_day(&pool, &user, &yesterday.format("%Y-%m-%d").to_string(), 1);
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

    #[test]
    fn daily_goal_progress_includes_articles_read_today() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_article_read(&pool, &user).unwrap();
        record_article_read(&pool, &user).unwrap();

        let progress = get_daily_goal_progress(&pool, &user, 15).unwrap();
        assert_eq!(progress.articles_read_today, 2);
        assert_eq!(progress.lessons_today, 0);
        assert!(!progress.goal_met);
        assert!(progress.practiced_today);
    }

    #[test]
    fn daily_goal_progress_includes_words_reviewed_today() {
        let pool = test_pool();
        let user = seed_user(&pool);
        record_review_practice(&pool, &user, 8, false, 15).unwrap();

        let progress = get_daily_goal_progress(&pool, &user, 15).unwrap();
        assert_eq!(progress.words_reviewed_today, 8);
        assert_eq!(progress.review_sessions_today, 0);
        assert!(progress.practiced_today);
    }
}
