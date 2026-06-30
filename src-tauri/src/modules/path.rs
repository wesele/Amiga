use crate::modules::database::DatabasePool;
use log;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

const QUESTIONS_JSON: &str = include_str!("../../../content-studio/data/questions.json");
const FRAMEWORK_JSON: &str = include_str!("../../../content-studio/data/unit-framework.json");
const VOCAB_PAIR_MAP_JSON: &str =
    include_str!("../../../content-studio/data/vocabulary.json");

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

fn resolve_pair_key(native_lang: &str, target_lang: &str) -> Option<String> {
    let direct = format!("{native_lang}-{target_lang}");
    let framework: Value = serde_json::from_str(FRAMEWORK_JSON).ok()?;
    if framework.get(&direct).is_some() {
        return Some(direct);
    }

    let vocab: Value = serde_json::from_str(VOCAB_PAIR_MAP_JSON).ok()?;
    let pair_lang_map = vocab.get("pairLangMap")?.as_object()?;
    let target_label = match target_lang {
        "es" => "Espanol",
        "en" => "English",
        "zh" => "中文",
        _ => return None,
    };
    for (pair_key, label) in pair_lang_map {
        if label.as_str() == Some(target_label) {
            if framework.get(pair_key).is_some() {
                return Some(pair_key.clone());
            }
        }
    }
    None
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

fn question_counts_for_pair(pair_key: &str) -> HashMap<String, i32> {
    let mut counts = HashMap::new();
    if let Ok(questions) = load_questions() {
        for q in questions {
            if q.get("pairId").and_then(|v| v.as_str()) != Some(pair_key) {
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
    let pair_key = resolve_pair_key(native_lang, target_lang)
        .ok_or_else(|| format!("unsupported language pair {native_lang}->{target_lang}"))?;
    let units = framework_units(&pair_key, cefr)?;
    let counts = question_counts_for_pair(&pair_key);
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
    let pair_key = resolve_pair_key(native_lang, target_lang)
        .ok_or_else(|| format!("unsupported language pair {native_lang}->{target_lang}"))?;
    let curriculum = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
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
    let pair_key = resolve_pair_key(native_lang, target_lang)
        .ok_or_else(|| format!("unsupported language pair {native_lang}->{target_lang}"))?;
    let curriculum = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
    let section = find_section(&curriculum, section_id)
        .map(|(_, s)| s)
        .ok_or_else(|| format!("unknown section {section_id}"))?;
    if section.locked {
        return Err("section is locked".to_string());
    }

    let score = ((correct_count as f64 / total_count as f64) * 100.0).round() as i32;
    let stars = stars_from_score(score);
    let passed = stars > 0;

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

    let ordered = ordered_section_ids(&pair_key, cefr)?;
    let next_section_id = if passed {
        ordered
            .iter()
            .position(|s| s == section_id)
            .and_then(|idx| ordered.get(idx + 1).cloned())
    } else {
        None
    };

    log::info!(
        "path section {} complete: {}/{} score={} stars={}",
        section_id,
        correct_count,
        total_count,
        score,
        new_stars
    );

    Ok(CompleteSectionResult {
        stars: new_stars,
        best_score: new_best,
        passed,
        next_section_id,
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
    fn resolve_pair_key_zh_es() {
        assert_eq!(resolve_pair_key("zh", "es"), Some("zh-es".to_string()));
    }

    #[test]
    fn resolve_pair_key_zh_en() {
        assert_eq!(
            resolve_pair_key("zh", "en"),
            Some("pair_1782569237717".to_string())
        );
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
        assert_eq!(curriculum.units.len(), 6);
        assert!(curriculum.units[0].sections[0].question_count > 0);
        assert!(!curriculum.units[0].sections[0].locked);
        assert!(curriculum.units[0].sections[1].locked);
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
    }
}