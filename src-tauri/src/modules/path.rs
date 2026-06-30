use crate::modules::database::DatabasePool;
use crate::modules::user;
use log;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub const PRIMARY_PAIR_KEY: &str = "zh-es";
const CEFR_LEVELS: &[&str] = &["A0", "A1", "A2", "B1", "B2", "C1"];

const QUESTIONS_JSON: &str = include_str!("../../../content-studio/data/questions.json");
const FRAMEWORK_JSON: &str = include_str!("../../../content-studio/data/unit-framework.json");


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathSectionProgress {
    pub section_id: String,
    pub stars: i32,
    pub best_score: i32,
    pub attempts: i32,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathSectionNode {
    pub id: String,
    pub title_native: String,
    pub title_target: String,
    pub question_count: i32,
    pub stars: i32,
    pub best_score: i32,
    pub locked: bool,
    pub current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathUnitNode {
    pub id: String,
    pub title_native: String,
    pub title_target: String,
    pub goal_native: String,
    pub sections: Vec<PathSectionNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathCurriculum {
    pub pair_key: String,
    pub cefr: String,
    pub units: Vec<PathUnitNode>,
    pub total_sections: i32,
    pub completed_sections: i32,
    pub total_stars: i32,
    /// "active" | "unsupported" | "level_complete"
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathLesson {
    pub section_id: String,
    pub section_title_native: String,
    pub section_title_target: String,
    pub unit_title_native: String,
    pub questions: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompleteSectionResult {
    pub stars: i32,
    pub best_score: i32,
    pub passed: bool,
    pub next_section_id: Option<String>,
    pub level_upgraded: bool,
    pub new_cefr_level: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FrameworkSection {
    id: String,
    #[serde(rename = "titleNative")]
    title_native: String,
    #[serde(rename = "titleTarget")]
    title_target: String,
}

#[derive(Debug, Deserialize)]
struct FrameworkUnit {
    id: String,
    #[serde(rename = "titleNative")]
    title_native: String,
    #[serde(rename = "titleTarget")]
    title_target: String,
    #[serde(rename = "goalNative")]
    goal_native: String,
    sections: Vec<FrameworkSection>,
}

fn load_questions() -> Result<Vec<Value>, String> {
    serde_json::from_str(QUESTIONS_JSON).map_err(|e| format!("parse questions.json: {e}"))
}

fn load_framework() -> Result<Value, String> {
    serde_json::from_str(FRAMEWORK_JSON).map_err(|e| format!("parse unit-framework.json: {e}"))
}

pub fn is_path_supported(native_lang: &str, target_lang: &str) -> bool {
    native_lang == "zh" && target_lang == "es"
}

fn framework_units(pair_key: &str, cefr: &str) -> Result<Vec<FrameworkUnit>, String> {
    let framework = load_framework()?;
    let level = framework
        .get(pair_key)
        .and_then(|p| p.get(cefr))
        .ok_or_else(|| format!("no framework for {pair_key}/{cefr}"))?;
    let units = level
        .get("units")
        .ok_or_else(|| format!("no units in framework for {pair_key}/{cefr}"))?;
    serde_json::from_value(units.clone()).map_err(|e| format!("parse framework units: {e}"))
}

fn next_cefr_level(current: &str) -> Option<String> {
    let idx = CEFR_LEVELS.iter().position(|l| *l == current)?;
    CEFR_LEVELS.get(idx + 1).map(|l| l.to_string())
}

fn is_level_fully_completed(curriculum: &PathCurriculum) -> bool {
    curriculum.total_sections > 0 && curriculum.completed_sections >= curriculum.total_sections
}

fn try_upgrade_cefr_level(
    pool: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    current_cefr: &str,
) -> Result<Option<String>, String> {
    let Some(next) = next_cefr_level(current_cefr) else {
        return Ok(None);
    };
    user::update_learning_goal_cefr(pool, user_id, target_lang, &next)?;
    log::info!(
        "path level upgraded: user={} lang={} {} -> {}",
        user_id,
        target_lang,
        current_cefr,
        next
    );
    Ok(Some(next))
}

fn section_full_id(pair_key: &str, unit_id: &str, section_id: &str) -> String {
    format!("{pair_key}/{unit_id}-{section_id}")
}

fn rewrite_image_urls(value: &mut Value) {
    match value {
        Value::Object(map) => {
            if let Some(url) = map.get("imageUrl").and_then(|v| v.as_str()) {
                if let Some(filename) = extract_image_filename(url) {
                    map.insert(
                        "imageUrl".to_string(),
                        Value::String(format!("/content-images/{filename}")),
                    );
                }
            }
            if let Some(options) = map.get_mut("imageOptions") {
                if let Some(arr) = options.as_array_mut() {
                    for opt in arr {
                        if let Some(url) = opt.get("imageUrl").and_then(|v| v.as_str()) {
                            if let Some(filename) = extract_image_filename(url) {
                                opt.as_object_mut().map(|m| {
                                    m.insert(
                                        "imageUrl".to_string(),
                                        Value::String(format!("/content-images/{filename}")),
                                    );
                                });
                            }
                        }
                    }
                }
            }
            for (_, v) in map.iter_mut() {
                rewrite_image_urls(v);
            }
        }
        Value::Array(arr) => {
            for item in arr {
                rewrite_image_urls(item);
            }
        }
        _ => {}
    }
}

fn extract_image_filename(url: &str) -> Option<String> {
    let path = url.split('?').next()?;
    path.rsplit('/').next().map(|s| s.to_string())
}

fn question_counts_for_pair(pair_key: &str, cefr: &str) -> HashMap<String, i32> {
    let mut counts = HashMap::new();
    if let Ok(questions) = load_questions() {
        for q in questions {
            if q.get("pairId").and_then(|v| v.as_str()) != Some(pair_key) {
                continue;
            }
            if q.get("cefr").and_then(|v| v.as_str()) != Some(cefr) {
                continue;
            }
            if let Some(section_id) = q.get("sectionId").and_then(|v| v.as_str()) {
                *counts.entry(section_id.to_string()).or_insert(0) += 1;
            }
        }
    }
    counts
}

fn ordered_section_ids(pair_key: &str, cefr: &str) -> Result<Vec<String>, String> {
    let units = framework_units(pair_key, cefr)?;
    let mut ids = Vec::new();
    for unit in units {
        for section in &unit.sections {
            ids.push(section_full_id(pair_key, &unit.id, &section.id));
        }
    }
    Ok(ids)
}

fn find_section<'a>(
    curriculum: &'a PathCurriculum,
    section_id: &str,
) -> Option<(&'a PathUnitNode, &'a PathSectionNode)> {
    for unit in &curriculum.units {
        for section in &unit.sections {
            if section.id == section_id {
                return Some((unit, section));
            }
        }
    }
    None
}

fn stars_from_score(score: i32) -> i32 {
    if score >= 100 {
        3
    } else if score >= 85 {
        2
    } else if score >= 70 {
        1
    } else {
        0
    }
}

fn get_progress_map(
    pool: &DatabasePool,
    user_id: &str,
    pair_key: &str,
) -> Result<HashMap<String, PathSectionProgress>, String> {
    let conn = pool.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT section_id, stars, best_score, attempts, completed_at
             FROM path_section_progress
             WHERE user_id = ?1 AND pair_key = ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![user_id, pair_key], |row| {
            Ok(PathSectionProgress {
                section_id: row.get(0)?,
                stars: row.get(1)?,
                best_score: row.get(2)?,
                attempts: row.get(3)?,
                completed_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let p = row.map_err(|e| e.to_string())?;
        map.insert(p.section_id.clone(), p);
    }
    Ok(map)
}

pub fn get_path_curriculum(
    pool: &DatabasePool,
    user_id: &str,
    native_lang: &str,
    target_lang: &str,
    cefr: &str,
) -> Result<PathCurriculum, String> {
    if !is_path_supported(native_lang, target_lang) {
        return Ok(PathCurriculum {
            pair_key: String::new(),
            cefr: cefr.to_string(),
            units: vec![],
            total_sections: 0,
            completed_sections: 0,
            total_stars: 0,
            status: "unsupported".to_string(),
        });
    }

    let pair_key = PRIMARY_PAIR_KEY.to_string();
    let units = match framework_units(&pair_key, cefr) {
        Ok(u) => u,
        Err(_) => {
            return Ok(PathCurriculum {
                pair_key,
                cefr: cefr.to_string(),
                units: vec![],
                total_sections: 0,
                completed_sections: 0,
                total_stars: 0,
                status: "level_complete".to_string(),
            });
        }
    };
    let counts = question_counts_for_pair(&pair_key, cefr);
    let progress = get_progress_map(pool, user_id, &pair_key)?;
    let ordered = ordered_section_ids(&pair_key, cefr)?;

    let mut first_incomplete: Option<String> = None;
    for sid in &ordered {
        let p = progress.get(sid);
        if p.map(|x| x.stars > 0).unwrap_or(false) {
            continue;
        }
        first_incomplete = Some(sid.clone());
        break;
    }

    let mut completed_sections = 0;
    let mut total_stars = 0;
    let mut unit_nodes = Vec::new();

    for unit in units {
        let mut section_nodes = Vec::new();
        for section in &unit.sections {
            let sid = section_full_id(&pair_key, &unit.id, &section.id);
            let count = counts.get(&sid).copied().unwrap_or(0);
            let prog = progress.get(&sid);
            let stars = prog.map(|p| p.stars).unwrap_or(0);
            let best_score = prog.map(|p| p.best_score).unwrap_or(0);
            if stars > 0 {
                completed_sections += 1;
                total_stars += stars;
            }

            let idx = ordered.iter().position(|s| s == &sid).unwrap_or(0);
            let locked = if idx == 0 {
                false
            } else {
                let prev = &ordered[idx - 1];
                progress.get(prev).map(|p| p.stars > 0).unwrap_or(false) == false
            };
            let current = first_incomplete.as_ref() == Some(&sid);

            section_nodes.push(PathSectionNode {
                id: sid,
                title_native: section.title_native.clone(),
                title_target: section.title_target.clone(),
                question_count: count,
                stars,
                best_score,
                locked,
                current,
            });
        }
        unit_nodes.push(PathUnitNode {
            id: unit.id.clone(),
            title_native: unit.title_native.clone(),
            title_target: unit.title_target.clone(),
            goal_native: unit.goal_native.clone(),
            sections: section_nodes,
        });
    }

    Ok(PathCurriculum {
        pair_key,
        cefr: cefr.to_string(),
        units: unit_nodes,
        total_sections: ordered.len() as i32,
        completed_sections,
        total_stars,
        status: "active".to_string(),
    })
}

pub fn get_section_lesson(
    pool: &DatabasePool,
    user_id: &str,
    native_lang: &str,
    target_lang: &str,
    cefr: &str,
    section_id: &str,
) -> Result<PathLesson, String> {
    if !is_path_supported(native_lang, target_lang) {
        return Err("path is only available for zh-es".to_string());
    }
    let pair_key = PRIMARY_PAIR_KEY.to_string();
    let curriculum = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
    if curriculum.status != "active" {
        return Err("path curriculum is not active".to_string());
    }
    let section = find_section(&curriculum, section_id)
        .ok_or_else(|| format!("unknown section {section_id}"))?;

    if section.1.locked {
        return Err("section is locked".to_string());
    }
    if section.1.question_count == 0 {
        return Err("section has no questions yet".to_string());
    }

    let questions: Vec<Value> = load_questions()?
        .into_iter()
        .filter(|q| {
            q.get("pairId").and_then(|v| v.as_str()) == Some(pair_key.as_str())
                && q.get("sectionId").and_then(|v| v.as_str()) == Some(section_id)
                && q.get("cefr").and_then(|v| v.as_str()) == Some(cefr)
        })
        .map(|mut q| {
            rewrite_image_urls(&mut q);
            q
        })
        .collect();

    Ok(PathLesson {
        section_id: section_id.to_string(),
        section_title_native: section.1.title_native.clone(),
        section_title_target: section.1.title_target.clone(),
        unit_title_native: section.0.title_native.clone(),
        questions,
    })
}

pub fn complete_section(
    pool: &DatabasePool,
    user_id: &str,
    native_lang: &str,
    target_lang: &str,
    cefr: &str,
    section_id: &str,
    correct_count: i32,
    total_count: i32,
) -> Result<CompleteSectionResult, String> {
    if total_count <= 0 {
        return Err("total_count must be positive".to_string());
    }
    if !is_path_supported(native_lang, target_lang) {
        return Err("path is only available for zh-es".to_string());
    }
    let pair_key = PRIMARY_PAIR_KEY.to_string();
    let curriculum = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
    if curriculum.status != "active" {
        return Err("path curriculum is not active".to_string());
    }
    let section = find_section(&curriculum, section_id)
        .map(|(_, s)| s)
        .ok_or_else(|| format!("unknown section {section_id}"))?;
    if section.locked {
        return Err("section is locked".to_string());
    }

    let score = ((correct_count as f64 / total_count as f64) * 100.0).round() as i32;
    let stars = stars_from_score(score);
    let passed = stars > 0;

    let (new_stars, new_best, _new_attempts) = {
        let conn = pool.conn()?;
        let existing: Option<(i32, i32, i32)> = conn
            .query_row(
                "SELECT stars, best_score, attempts FROM path_section_progress
                 WHERE user_id = ?1 AND pair_key = ?2 AND section_id = ?3",
                params![user_id, pair_key, section_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        let (prev_stars, prev_best, prev_attempts) = existing.unwrap_or((0, 0, 0));
        let new_stars = prev_stars.max(stars);
        let new_best = prev_best.max(score);
        let new_attempts = prev_attempts + 1;
        let completed_at = if passed {
            Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string())
        } else {
            None
        };

        conn.execute(
            "INSERT INTO path_section_progress
                (user_id, pair_key, section_id, stars, best_score, attempts, completed_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
             ON CONFLICT(user_id, pair_key, section_id) DO UPDATE SET
                stars = ?4,
                best_score = ?5,
                attempts = ?6,
                completed_at = COALESCE(path_section_progress.completed_at, excluded.completed_at),
                updated_at = datetime('now')",
            params![
                user_id,
                pair_key,
                section_id,
                new_stars,
                new_best,
                new_attempts,
                completed_at
            ],
        )
        .map_err(|e| e.to_string())?;
        (new_stars, new_best, new_attempts)
    };

    let ordered = ordered_section_ids(&pair_key, cefr)?;
    let next_section_id = if passed {
        ordered
            .iter()
            .position(|s| s == section_id)
            .and_then(|idx| ordered.get(idx + 1).cloned())
    } else {
        None
    };

    let mut level_upgraded = false;
    let mut new_cefr_level = None;
    if passed {
        let refreshed = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
        if is_level_fully_completed(&refreshed) {
            if let Some(upgraded) =
                try_upgrade_cefr_level(pool, user_id, target_lang, cefr)?
            {
                level_upgraded = true;
                new_cefr_level = Some(upgraded);
            }
        }
    }

    log::info!(
        "path section {} complete: {}/{} score={} stars={} level_up={}",
        section_id,
        correct_count,
        total_count,
        score,
        new_stars,
        level_upgraded
    );

    Ok(CompleteSectionResult {
        stars: new_stars,
        best_score: new_best,
        passed,
        next_section_id,
        level_upgraded,
        new_cefr_level,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::DatabasePool;

    fn test_pool() -> DatabasePool {
        DatabasePool::new_in_memory()
    }

    fn test_user(pool: &DatabasePool) -> String {
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname, native_language, wizard_completed) VALUES ('u1', 'Test', 'zh', 1)",
            [],
        )
        .unwrap();
        "u1".to_string()
    }

    #[test]
    fn is_path_supported_zh_es_only() {
        assert!(is_path_supported("zh", "es"));
        assert!(!is_path_supported("zh", "en"));
    }

    #[test]
    fn stars_from_score_thresholds() {
        assert_eq!(stars_from_score(100), 3);
        assert_eq!(stars_from_score(90), 2);
        assert_eq!(stars_from_score(75), 1);
        assert_eq!(stars_from_score(50), 0);
    }

    #[test]
    fn get_path_curriculum_zh_es() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        assert_eq!(curriculum.pair_key, "zh-es");
        assert_eq!(curriculum.status, "active");
        assert_eq!(curriculum.units.len(), 6);
        assert!(curriculum.units[0].sections[0].question_count > 0);
        assert!(!curriculum.units[0].sections[0].locked);
        assert!(curriculum.units[0].sections[1].locked);
    }

    #[test]
    fn unsupported_pair_returns_status() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "en", "A1").unwrap();
        assert_eq!(curriculum.status, "unsupported");
        assert!(curriculum.units.is_empty());
    }

    #[test]
    fn a2_curriculum_is_active() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A2").unwrap();
        assert_eq!(curriculum.status, "active");
        assert_eq!(curriculum.units.len(), 6);
        assert!(curriculum.total_sections >= 24);
    }

    #[test]
    fn complete_section_unlocks_next() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let first = curriculum.units[0].sections[0].id.clone();
        let second = curriculum.units[0].sections[1].id.clone();

        let result = complete_section(&pool, &user, "zh", "es", "A1", &first, 5, 5).unwrap();
        assert!(result.passed);
        assert_eq!(result.stars, 3);
        assert_eq!(result.next_section_id, Some(second.clone()));

        let updated = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        assert_eq!(updated.units[0].sections[0].stars, 3);
        assert!(!updated.units[0].sections[1].locked);
    }

    #[test]
    fn get_section_lesson_returns_questions() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let section_id = curriculum.units[0].sections[0].id.clone();
        let lesson = get_section_lesson(&pool, &user, "zh", "es", "A1", &section_id).unwrap();
        assert!(!lesson.questions.is_empty());
        assert!(
            lesson
                .questions
                .iter()
                .all(|q| q.get("cefr").and_then(|v| v.as_str()) == Some("A1"))
        );
    }

    #[test]
    fn a1_and_a2_question_counts_differ_for_same_section() {
        let pool = test_pool();
        let user = test_user(&pool);
        let a1 = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let a2 = get_path_curriculum(&pool, &user, "zh", "es", "A2").unwrap();
        let a1_count = a1.units[0].sections[0].question_count;
        let a2_count = a2.units[0].sections[0].question_count;
        assert!(a1_count > 0);
        assert!(a2_count > 0);
        assert_ne!(a1_count, a2_count);
    }
}