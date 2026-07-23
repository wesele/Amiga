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
    pub reading_count: i32,
    pub news_count: i32,
    pub speaking_count: i32,
    pub app_open: i32,
    pub soulmate_status: i32,
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
    let updated = conn
        .execute(
            "INSERT INTO streak_records (user_id, date, open_count) VALUES (?1, ?2, 1)
             ON CONFLICT(user_id, date) DO UPDATE SET open_count = open_count + 1",
            params![user_id, today],
        )
        .map_err(|e| format!("Failed to record app open: {e}"))?;
    Ok(updated > 0)
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
            let active_count = (day.app_open >= 1) as i32
                + (day.reading_count >= 1 || day.reading_am >= 1 || day.reading_pm >= 1) as i32
                + (day.news_count >= 1) as i32
                + (day.soulmate_status >= 1) as i32;
            active_count >= 2
        })
        .filter_map(|day| NaiveDate::parse_from_str(&day.date, "%Y-%m-%d").ok())
        .collect::<BTreeSet<_>>();
    let learning_total = days
        .iter()
        .filter(|day| {
            day.app_open > 0
                || day.reading_count > 0
                || day.reading_am > 0
                || day.reading_pm > 0
                || day.news_count > 0
                || day.soulmate_status > 0
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
                "SELECT local_date, COUNT(DISTINCT id)
                 FROM reading_articles
                 WHERE user_id = ?1 AND status IN ('read', 'completed') AND local_date BETWEEN ?2 AND ?3
                 GROUP BY local_date",
            )
            .map_err(|e| format!("Failed to prepare reading count achievements query: {e}"))?;
        let rows = stmt
            .query_map(params![user_id, start_date, end_date], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?))
            })
            .map_err(|e| format!("Failed to query reading count achievements: {e}"))?;

        for row in rows {
            let (date, count) =
                row.map_err(|e| format!("Failed to read reading count achievement row: {e}"))?;
            let day = days.entry(date.clone()).or_insert_with(|| AchievementDay {
                date,
                ..Default::default()
            });
            day.reading_count = count;
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
                "SELECT date, open_count FROM streak_records
                 WHERE user_id = ?1 AND date BETWEEN ?2 AND ?3",
            )
            .map_err(|e| format!("Failed to prepare app open achievements query: {e}"))?;
        let rows = stmt
            .query_map(params![user_id, start_date, end_date], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<i32>>(1)?.unwrap_or(1),
                ))
            })
            .map_err(|e| format!("Failed to query app open achievements: {e}"))?;

        for row in rows {
            let (date, count) =
                row.map_err(|e| format!("Failed to read app open achievement row: {e}"))?;
            let day = days.entry(date.clone()).or_insert_with(|| AchievementDay {
                date,
                ..Default::default()
            });
            day.app_open = count;
        }
    }

    {
        let mut stmt = conn
            .prepare(
                "SELECT date(e.read_at, 'localtime') AS local_date
                 FROM soulmate_episodes e
                 JOIN soulmate_worlds w ON e.world_id = w.id
                 WHERE w.user_id = ?1 AND e.read_at IS NOT NULL
                   AND date(e.read_at, 'localtime') BETWEEN ?2 AND ?3
                 GROUP BY local_date",
            )
            .map_err(|e| {
                format!("Failed to prepare soulmate read letter achievements query: {e}")
            })?;
        let rows = stmt
            .query_map(params![user_id, start_date, end_date], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|e| format!("Failed to query soulmate read letter achievements: {e}"))?;

        for row in rows {
            let date = row.map_err(|e| format!("Failed to read soulmate episode row: {e}"))?;
            let day = days.entry(date.clone()).or_insert_with(|| AchievementDay {
                date,
                ..Default::default()
            });
            if day.soulmate_status < 1 {
                day.soulmate_status = 1;
            }
        }

        let mut stmt = conn
            .prepare(
                "SELECT date(m.created_at, 'localtime') AS local_date
                 FROM soulmate_messages m
                 JOIN soulmate_worlds w ON m.world_id = w.id
                 WHERE w.user_id = ?1 AND m.role = 'user'
                   AND date(m.created_at, 'localtime') BETWEEN ?2 AND ?3
                 GROUP BY local_date",
            )
            .map_err(|e| format!("Failed to prepare soulmate chat achievements query: {e}"))?;
        let rows = stmt
            .query_map(params![user_id, start_date, end_date], |row| {
                row.get::<_, String>(0)
            })
            .map_err(|e| format!("Failed to query soulmate chat achievements: {e}"))?;

        for row in rows {
            let date = row.map_err(|e| format!("Failed to read soulmate message row: {e}"))?;
            let day = days.entry(date.clone()).or_insert_with(|| AchievementDay {
                date,
                ..Default::default()
            });
            day.soulmate_status = 2;
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
                reading_count: 2,
                news_count: 2,
                speaking_count: 1,
                app_open: 0,
                soulmate_status: 0,
            }
        );
    }

    #[test]
    fn records_app_open_and_increments_count() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        drop(conn);

        assert!(record_app_open(&db).unwrap());
        assert!(record_app_open(&db).unwrap());

        let days = get_achievement_days(&db, "u1", "2026-01-01", "2099-12-31").unwrap();
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].app_open, 2);
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
                reading_count: 2,
                news_count: 3,
                speaking_count: 2,
                app_open: 1,
                soulmate_status: 2,
            },
            AchievementDay {
                date: "2026-07-09".into(),
                reading_am: 2,
                reading_pm: 2,
                reading_count: 2,
                news_count: 3,
                speaking_count: 2,
                app_open: 1,
                soulmate_status: 1,
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

    #[test]
    fn tracks_soulmate_read_letter_and_chat_status() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute("INSERT INTO users (id, nickname) VALUES ('u1', 'Test')", [])
            .unwrap();
        conn.execute(
            "INSERT INTO soulmate_worlds (id, user_id, companion_type, companion_name, companion_gender, personality, story_location, intensity, romance_tension, surprise, knowledge, target_lang, native_lang)
             VALUES ('w1', 'u1', 'penpal', 'Maria', 'female', 'warm', 'Madrid', 3, 2, 2, 2, 'es', 'zh')",
            [],
        )
        .unwrap();
        // Day 1: Read letter only -> status 1
        conn.execute(
            "INSERT INTO soulmate_episodes (id, world_id, story_date, day_number, title, body, status, read_at)
             VALUES ('e1', 'w1', '2026-07-01', 1, 'Hello', 'Body', 'completed', '2026-07-01 09:00:00')",
            [],
        )
        .unwrap();
        // Day 2: Read letter AND chat -> status 2
        conn.execute(
            "INSERT INTO soulmate_episodes (id, world_id, story_date, day_number, title, body, status, read_at)
             VALUES ('e2', 'w1', '2026-07-02', 2, 'Hello 2', 'Body 2', 'completed', '2026-07-02 09:00:00')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO soulmate_messages (world_id, episode_id, role, content, created_at)
             VALUES ('w1', 'e2', 'user', 'Hola!', '2026-07-02 10:00:00')",
            [],
        )
        .unwrap();
        drop(conn);

        let days = get_achievement_days(&db, "u1", "2026-07-01", "2026-07-02").unwrap();
        assert_eq!(days.len(), 2);
        assert_eq!(days[0].date, "2026-07-01");
        assert_eq!(days[0].soulmate_status, 1);
        assert_eq!(days[1].date, "2026-07-02");
        assert_eq!(days[1].soulmate_status, 2);
    }
}
