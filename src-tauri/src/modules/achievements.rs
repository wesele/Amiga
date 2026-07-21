use crate::modules::database::DatabasePool;
use chrono::{Duration, Local, NaiveDate};
use rusqlite::params;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct AchievementDay {
    pub date: String,
    pub reading_am: i32,
    pub reading_pm: i32,
    pub news_count: i32,
    pub speaking_count: i32,
    pub app_open: i32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct AchievementProgress {
    pub check_in_current: i32,
    pub check_in_best: i32,
    pub full_learning_current: i32,
    pub full_learning_best: i32,
    pub learning_total: i32,
}

pub fn record_app_open(db: &DatabasePool) -> Result<bool, String> {
    let conn = db.conn()?;
    let user_id: Option<String> = conn
        .query_row("SELECT id FROM users LIMIT 1", [], |row| row.get(0))
        .ok();
    let Some(user_id) = user_id else {
        return Ok(false);
    };
    let today = Local::now().format("%Y-%m-%d").to_string();
    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO streak_records (user_id, date) VALUES (?1, ?2)",
            params![user_id, today],
        )
        .map_err(|e| format!("Failed to record app open: {e}"))?;
    Ok(inserted > 0)
}

pub fn get_achievement_progress(
    db: &DatabasePool,
    user_id: &str,
) -> Result<AchievementProgress, String> {
    let today = Local::now().date_naive();
    let days = get_achievement_days(db, user_id, "0001-01-01", &today.to_string())?;
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare("SELECT date FROM streak_records WHERE user_id = ?1 ORDER BY date")
        .map_err(|e| format!("Failed to prepare check-in achievements query: {e}"))?;
    let check_in_dates = stmt
        .query_map(params![user_id], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Failed to query check-in achievements: {e}"))?
        .filter_map(Result::ok)
        .filter_map(|date| NaiveDate::parse_from_str(&date, "%Y-%m-%d").ok())
        .collect::<BTreeSet<_>>();

    Ok(calculate_progress(&check_in_dates, &days, today))
}

fn calculate_progress(
    check_in_dates: &BTreeSet<NaiveDate>,
    days: &[AchievementDay],
    today: NaiveDate,
) -> AchievementProgress {
    let full_learning_dates = days
        .iter()
        .filter(|day| {
            let active_count = (day.reading_am >= 1) as i32
                + (day.reading_pm >= 1) as i32
                + (day.news_count >= 1) as i32
                + (day.app_open >= 1) as i32;
            active_count >= 2
        })
        .filter_map(|day| NaiveDate::parse_from_str(&day.date, "%Y-%m-%d").ok())
        .collect::<BTreeSet<_>>();
    let learning_total = days
        .iter()
        .filter(|day| {
            day.reading_am > 0 || day.reading_pm > 0 || day.news_count > 0 || day.app_open > 0
        })
        .count() as i32;
    let (check_in_current, check_in_best) = streak_metrics(check_in_dates, today);
    let (full_learning_current, full_learning_best) = streak_metrics(&full_learning_dates, today);

    AchievementProgress {
        check_in_current,
        check_in_best,
        full_learning_current,
        full_learning_best,
        learning_total,
    }
}

fn streak_metrics(dates: &BTreeSet<NaiveDate>, today: NaiveDate) -> (i32, i32) {
    let mut best = 0;
    let mut run = 0;
    let mut previous = None;
    for date in dates.iter().copied().filter(|date| *date <= today) {
        run = if previous.is_some_and(|value| value + Duration::days(1) == date) {
            run + 1
        } else {
            1
        };
        best = best.max(run);
        previous = Some(date);
    }
    let current = match previous {
        Some(last) if last == today || last == today - Duration::days(1) => run,
        _ => 0,
    };
    (current, best)
}

pub fn get_achievement_days(
    db: &DatabasePool,
    user_id: &str,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<AchievementDay>, String> {
    let conn = db.conn()?;
    let mut days: BTreeMap<String, AchievementDay> = BTreeMap::new();

    {
        let mut stmt = conn
            .prepare(
                "SELECT local_date, slot,
                        MAX(CASE status WHEN 'completed' THEN 2 WHEN 'read' THEN 1 ELSE 0 END)
                 FROM reading_articles
                 WHERE user_id = ?1 AND local_date BETWEEN ?2 AND ?3
                 GROUP BY local_date, slot",
            )
            .map_err(|e| format!("Failed to prepare reading achievements query: {e}"))?;
        let rows = stmt
            .query_map(params![user_id, start_date, end_date], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                ))
            })
            .map_err(|e| format!("Failed to query reading achievements: {e}"))?;

        for row in rows {
            let (date, slot, state) =
                row.map_err(|e| format!("Failed to read reading achievement row: {e}"))?;
            let day = days.entry(date.clone()).or_insert_with(|| AchievementDay {
                date,
                ..Default::default()
            });
            if slot == "AM" {
                day.reading_am = state;
            } else if slot == "PM" {
                day.reading_pm = state;
            }
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT date(read_at, 'localtime') AS local_date, COUNT(DISTINCT article_id)
                 FROM news_reading_log
                 WHERE user_id = ?1
                   AND date(read_at, 'localtime') BETWEEN ?2 AND ?3
                 GROUP BY local_date",
            )
            .map_err(|e| format!("Failed to prepare news achievements query: {e}"))?;
        let rows = stmt
            .query_map(params![user_id, start_date, end_date], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
            })
            .map_err(|e| format!("Failed to query news achievements: {e}"))?;

        for row in rows {
            let (date, count) =
                row.map_err(|e| format!("Failed to read news achievement row: {e}"))?;
            let day = days.entry(date.clone()).or_insert_with(|| AchievementDay {
                date,
                ..Default::default()
            });
            day.news_count = count;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT date(completed_at, 'localtime') AS local_date, COUNT(*)
                 FROM speaking_sessions
                 WHERE user_id = ?1 AND status = 'completed' AND completed_at IS NOT NULL
                   AND date(completed_at, 'localtime') BETWEEN ?2 AND ?3
                 GROUP BY local_date",
            )
            .map_err(|e| format!("Failed to prepare speaking achievements query: {e}"))?;
        let rows = stmt
            .query_map(params![user_id, start_date, end_date], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
            })
            .map_err(|e| format!("Failed to query speaking achievements: {e}"))?;

        for row in rows {
            let (date, count) =
                row.map_err(|e| format!("Failed to read speaking achievement row: {e}"))?;
            let day = days.entry(date.clone()).or_insert_with(|| AchievementDay {
                date,
                ..Default::default()
            });
            day.speaking_count = count;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT date FROM streak_records
                 WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3",
            )
            .map_err(|e| format!("Failed to prepare app open achievements query: {e}"))?;
        let rows = stmt
            .query_map(params![user_id, start_date, end_date], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|e| format!("Failed to query app open achievements: {e}"))?;

        for date_res in rows {
            let date =
                date_res.map_err(|e| format!("Failed to read app open achievement row: {e}"))?;
            let day = days.entry(date.clone()).or_insert_with(|| AchievementDay {
                date,
                ..Default::default()
            });
            day.app_open = 1;
        }
    }

    Ok(days.into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregates_all_achievement_sources_by_day() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO reading_articles
             (user_id, target_language, cefr_level, local_date, slot, topic, title, body, status)
             VALUES ('u1', 'es', 'A1', '2026-07-01', 'AM', 't', 'a', 'b', 'read'),
                    ('u1', 'es', 'A1', '2026-07-01', 'PM', 't', 'a', 'b', 'completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO news_articles (id, original_title, original_body, region, hot_rank)
             VALUES (101, 'a', 'b', 'world', 1), (102, 'c', 'd', 'world', 2)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO news_reading_log (user_id, article_id, reading_time_sec, completed, read_at)
             VALUES ('u1', 101, 1, 1, '2026-07-01 10:00:00'),
                    ('u1', 102, 1, 1, '2026-07-01 11:00:00'),
                    ('u1', 102, 1, 1, '2026-07-01 12:00:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO speaking_sessions
             (id, user_id, topic_id, target_lang, native_lang, cefr_level, status, completed_at)
             VALUES ('s1', 'u1', 'topic', 'es', 'zh', 'A1', 'completed', '2026-07-01 13:00:00')",
            [],
        )
        .unwrap();
        drop(conn);

        let days = get_achievement_days(&db, "u1", "2026-06-01", "2026-07-31").unwrap();
        assert_eq!(days.len(), 1);
        assert_eq!(
            days[0],
            AchievementDay {
                date: "2026-07-01".into(),
                reading_am: 1,
                reading_pm: 2,
                news_count: 2,
                speaking_count: 1,
                app_open: 0,
            }
        );
    }

    #[test]
    fn records_only_one_app_open_per_day() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        drop(conn);

        assert!(record_app_open(&db).unwrap());
        assert!(!record_app_open(&db).unwrap());
    }

    #[test]
    fn calculates_streaks_and_learning_total() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 10).unwrap();
        let check_ins = ["2026-07-05", "2026-07-08", "2026-07-09", "2026-07-10"]
            .into_iter()
            .map(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap())
            .collect();
        let days = vec![
            AchievementDay {
                date: "2026-07-08".into(),
                reading_am: 2,
                reading_pm: 2,
                news_count: 3,
                speaking_count: 2,
                app_open: 1,
            },
            AchievementDay {
                date: "2026-07-09".into(),
                reading_am: 2,
                reading_pm: 2,
                news_count: 3,
                speaking_count: 2,
                app_open: 1,
            },
            AchievementDay {
                date: "2026-07-10".into(),
                reading_am: 1,
                news_count: 1,
                ..Default::default()
            },
        ];

        let progress = calculate_progress(&check_ins, &days, today);
        assert_eq!(progress.check_in_current, 3);
        assert_eq!(progress.check_in_best, 3);
        assert_eq!(progress.full_learning_current, 3);
        assert_eq!(progress.full_learning_best, 3);
        assert_eq!(progress.learning_total, 3);
    }
}
