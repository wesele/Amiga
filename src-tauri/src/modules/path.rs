use crate::modules::database::DatabasePool;
use crate::modules::llm::{self, GrammarExplainResult, LlmClient};
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
    /// "grammar" | "vocab" | "practice"
    pub kind: String,
    pub title_native: String,
    pub title_target: String,
    pub question_count: i32,
    pub stars: i32,
    pub best_score: i32,
    pub locked: bool,
    pub current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeachingWord {
    pub word: String,
    pub definition_zh: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathTeaching {
    pub node_id: String,
    pub kind: String,
    pub unit_id: String,
    pub unit_title_native: String,
    pub unit_title_target: String,
    pub goal_native: String,
    pub grammar_points: Vec<String>,
    pub words: Vec<TeachingWord>,
    pub scenarios: Vec<String>,
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
    #[serde(default)]
    pub streak_current: i32,
    #[serde(default)]
    pub streak_extended: bool,
    #[serde(default)]
    pub daily_goal_just_met: bool,
    #[serde(default)]
    pub daily_goal_lessons_today: i32,
    #[serde(default)]
    pub daily_goal_target: i32,
    #[serde(default)]
    pub weekly_goal_just_met: bool,
    #[serde(default)]
    pub weekly_goal_active_days: i32,
    #[serde(default)]
    pub weekly_goal_target_days: i32,
    #[serde(default)]
    pub lessons_completed_total: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lesson_milestone_reached: Option<i32>,
    #[serde(default)]
    pub perfect_lesson_streak: i32,
    #[serde(default)]
    pub perfect_lesson_streak_best: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub perfect_lesson_milestone_reached: Option<i32>,
}

/// Lesson-count milestones for the learning achievements track.
pub const LESSON_MILESTONES: &[i32] = &[10, 25, 50, 100, 250, 500];

/// Consecutive flawless practice-lesson counts that trigger celebration.
pub const PERFECT_LESSON_MILESTONES: &[i32] = &[3, 5, 10];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PerfectLessonStreak {
    pub current: i32,
    pub best: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LessonMilestoneProgress {
    pub completed: i32,
    pub next_milestone: Option<i32>,
    pub progress_pct: i32,
}

#[derive(Debug, Deserialize)]
struct FrameworkSection {
    id: String,
    #[serde(rename = "titleNative")]
    title_native: String,
    #[serde(rename = "titleTarget")]
    title_target: String,
    #[serde(rename = "coveredWords", default)]
    covered_words: Vec<String>,
    #[serde(rename = "grammarPoint", default)]
    grammar_point: String,
    #[serde(default)]
    scenario: String,
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
    #[serde(rename = "grammarPoints", default)]
    grammar_points: Vec<String>,
    #[serde(default)]
    scenarios: Vec<String>,
    sections: Vec<FrameworkSection>,
}

fn load_questions() -> Result<Vec<Value>, String> {
    serde_json::from_str(QUESTIONS_JSON).map_err(|e| format!("parse questions.json: {e}"))
}

fn load_framework() -> Result<Value, String> {
    serde_json::from_str(FRAMEWORK_JSON).map_err(|e| format!("parse unit-framework.json: {e}"))
}

fn pair_langs(pair_key: &str) -> Option<(String, String)> {
    match pair_key {
        "zh-es" => Some(("zh".to_string(), "es".to_string())),
        "pair_1781451962486" => Some(("es".to_string(), "zh".to_string())),
        "pair_1782569237717" => Some(("zh".to_string(), "en".to_string())),
        _ => {
            let (from, to) = pair_key.split_once('-')?;
            Some((from.to_string(), to.to_string()))
        }
    }
}

/// Resolve the content pair for a native→target language combo.
/// Prefers an exact match; otherwise falls back to any pair with the same target language.
fn resolve_pair_key(native_lang: &str, target_lang: &str) -> Option<String> {
    let framework = load_framework().ok()?;
    let root = framework.as_object()?;
    let preferred = format!("{native_lang}-{target_lang}");

    if root.contains_key(&preferred) {
        return Some(preferred);
    }

    for key in root.keys() {
        if let Some((from, to)) = pair_langs(key) {
            if from == native_lang && to == target_lang {
                return Some(key.clone());
            }
        }
    }

    for key in root.keys() {
        if let Some((_, to)) = pair_langs(key) {
            if to == target_lang {
                return Some(key.clone());
            }
        }
    }

    None
}

pub fn is_path_supported(native_lang: &str, target_lang: &str) -> bool {
    resolve_pair_key(native_lang, target_lang).is_some()
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

fn teaching_node_id(pair_key: &str, unit_id: &str, kind: &str) -> String {
    format!("{pair_key}/{unit_id}-{kind}")
}

fn parse_node_id(node_id: &str) -> Option<(String, String, String)> {
    let (pair_key, rest) = node_id.split_once('/')?;
    let (unit_id, tail) = rest.split_once('-')?;
    Some((pair_key.to_string(), unit_id.to_string(), tail.to_string()))
}

fn unit_vocab_words(unit: &FrameworkUnit) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut words = Vec::new();
    for section in &unit.sections {
        for word in &section.covered_words {
            let key = word.to_lowercase();
            if seen.insert(key) {
                words.push(word.clone());
            }
        }
    }
    words
}

fn lookup_word_glosses(
    pool: &DatabasePool,
    words: &[String],
    target_lang: &str,
) -> Result<Vec<TeachingWord>, String> {
    let conn = pool.conn()?;
    let mut out = Vec::new();
    for word in words {
        let gloss: Option<String> = conn
            .query_row(
                "SELECT definition_zh FROM vocab_bank
                 WHERE language = ?1 AND LOWER(word) = LOWER(?2)
                 LIMIT 1",
                params![target_lang, word],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        out.push(TeachingWord {
            word: word.clone(),
            definition_zh: gloss,
        });
    }
    Ok(out)
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

fn ordered_node_ids(pair_key: &str, cefr: &str) -> Result<Vec<String>, String> {
    let units = framework_units(pair_key, cefr)?;
    let mut ids = Vec::new();
    for unit in units {
        ids.push(teaching_node_id(pair_key, &unit.id, "GRAMMAR"));
        ids.push(teaching_node_id(pair_key, &unit.id, "VOCAB"));
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

/// Count passed practice lessons (excludes grammar/vocab teaching nodes).
pub fn count_completed_lessons(pool: &DatabasePool, user_id: &str, pair_key: &str) -> Result<i32, String> {
    let conn = pool.conn()?;
    conn.query_row(
        "SELECT COUNT(*) FROM path_section_progress
         WHERE user_id = ?1 AND pair_key = ?2 AND stars > 0
           AND section_id NOT LIKE '%-GRAMMAR' AND section_id NOT LIKE '%-VOCAB'",
        params![user_id, pair_key],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn lesson_milestone_progress(completed: i32) -> LessonMilestoneProgress {
    let next = LESSON_MILESTONES
        .iter()
        .copied()
        .find(|&m| completed < m);
    let progress_pct = match next {
        Some(target) => {
            let prev = LESSON_MILESTONES
                .iter()
                .copied()
                .filter(|&m| m < target)
                .last()
                .unwrap_or(0);
            let span = (target - prev).max(1);
            (((completed - prev) as f64 / span as f64) * 100.0).round() as i32
        }
        None => 100,
    };
    LessonMilestoneProgress {
        completed,
        next_milestone: next,
        progress_pct: progress_pct.clamp(0, 100),
    }
}

pub fn lesson_milestone_reached(prev_completed: i32, new_completed: i32) -> Option<i32> {
    if new_completed <= prev_completed {
        return None;
    }
    LESSON_MILESTONES
        .iter()
        .copied()
        .find(|&m| prev_completed < m && new_completed >= m)
}

pub fn get_lesson_milestone_progress(
    pool: &DatabasePool,
    user_id: &str,
    native_lang: &str,
    target_lang: &str,
) -> Result<LessonMilestoneProgress, String> {
    let pair_key = resolve_pair_key(native_lang, target_lang)
        .ok_or_else(|| format!("no question bank for {native_lang}-{target_lang}"))?;
    let completed = count_completed_lessons(pool, user_id, &pair_key)?;
    Ok(lesson_milestone_progress(completed))
}

fn perfect_streak_setting_key(user_id: &str) -> String {
    format!("perfect_lesson_streak:{user_id}")
}

fn perfect_streak_best_setting_key(user_id: &str) -> String {
    format!("perfect_lesson_streak_best:{user_id}")
}

fn read_app_setting_i32(conn: &rusqlite::Connection, key: &str) -> Option<i32> {
    conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|v| v.parse().ok())
}

fn write_app_setting_i32(conn: &rusqlite::Connection, key: &str, value: i32) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn load_perfect_lesson_streak(pool: &DatabasePool, user_id: &str) -> Result<PerfectLessonStreak, String> {
    let conn = pool.conn()?;
    let current = read_app_setting_i32(&conn, &perfect_streak_setting_key(user_id)).unwrap_or(0);
    let best = read_app_setting_i32(&conn, &perfect_streak_best_setting_key(user_id)).unwrap_or(0);
    Ok(PerfectLessonStreak { current, best })
}

pub fn perfect_lesson_milestone_reached(prev_streak: i32, new_streak: i32) -> Option<i32> {
    if new_streak <= prev_streak {
        return None;
    }
    PERFECT_LESSON_MILESTONES
        .iter()
        .copied()
        .find(|&m| prev_streak < m && new_streak >= m)
}

pub fn update_perfect_lesson_streak(
    pool: &DatabasePool,
    user_id: &str,
    passed: bool,
    is_perfect: bool,
) -> Result<(i32, i32, Option<i32>), String> {
    let conn = pool.conn()?;
    let streak_key = perfect_streak_setting_key(user_id);
    let best_key = perfect_streak_best_setting_key(user_id);
    let prev_current = read_app_setting_i32(&conn, &streak_key).unwrap_or(0);
    let prev_best = read_app_setting_i32(&conn, &best_key).unwrap_or(0);

    let new_current = if passed && is_perfect {
        prev_current + 1
    } else {
        0
    };
    let new_best = prev_best.max(new_current);
    let milestone = if passed && is_perfect {
        perfect_lesson_milestone_reached(prev_current, new_current)
    } else {
        None
    };

    write_app_setting_i32(&conn, &streak_key, new_current)?;
    if new_best > prev_best {
        write_app_setting_i32(&conn, &best_key, new_best)?;
    }

    Ok((new_current, new_best, milestone))
}

fn lesson_fields_for_completion(
    pool: &DatabasePool,
    user_id: &str,
    pair_key: &str,
    passed: bool,
    first_time_pass: bool,
) -> (i32, Option<i32>) {
    if !passed {
        return (0, None);
    }
    match count_completed_lessons(pool, user_id, pair_key) {
        Ok(total) => {
            let milestone = if first_time_pass {
                lesson_milestone_reached(total - 1, total)
            } else {
                None
            };
            (total, milestone)
        }
        Err(e) => {
            log::warn!("Failed to count completed lessons: {}", e);
            (0, None)
        }
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
    let Some(pair_key) = resolve_pair_key(native_lang, target_lang) else {
        return Ok(PathCurriculum {
            pair_key: String::new(),
            cefr: cefr.to_string(),
            units: vec![],
            total_sections: 0,
            completed_sections: 0,
            total_stars: 0,
            status: "unsupported".to_string(),
        });
    };
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
    let ordered = ordered_node_ids(&pair_key, cefr)?;

    let mut first_incomplete: Option<String> = None;
    for nid in &ordered {
        let p = progress.get(nid);
        if p.map(|x| x.stars > 0).unwrap_or(false) {
            continue;
        }
        first_incomplete = Some(nid.clone());
        break;
    }

    let mut completed_sections = 0;
    let mut total_stars = 0;
    let mut unit_nodes = Vec::new();

    fn node_locked(
        idx: usize,
        ordered: &[String],
        progress: &HashMap<String, PathSectionProgress>,
    ) -> bool {
        if idx == 0 {
            return false;
        }
        let prev = &ordered[idx - 1];
        progress.get(prev).map(|p| p.stars > 0).unwrap_or(false) == false
    }

    for unit in units {
        let mut section_nodes = Vec::new();

        let grammar_id = teaching_node_id(&pair_key, &unit.id, "GRAMMAR");
        let grammar_prog = progress.get(&grammar_id);
        let grammar_stars = grammar_prog.map(|p| p.stars).unwrap_or(0);
        let grammar_idx = ordered.iter().position(|s| s == &grammar_id).unwrap_or(0);
        if grammar_stars > 0 {
            completed_sections += 1;
            total_stars += grammar_stars;
        }
        section_nodes.push(PathSectionNode {
            id: grammar_id.clone(),
            kind: "grammar".to_string(),
            title_native: "单元知识".to_string(),
            title_target: "Gramática".to_string(),
            question_count: 1,
            stars: grammar_stars,
            best_score: grammar_prog.map(|p| p.best_score).unwrap_or(0),
            locked: node_locked(grammar_idx, &ordered, &progress),
            current: first_incomplete.as_ref() == Some(&grammar_id),
        });

        let vocab_id = teaching_node_id(&pair_key, &unit.id, "VOCAB");
        let vocab_prog = progress.get(&vocab_id);
        let vocab_stars = vocab_prog.map(|p| p.stars).unwrap_or(0);
        let vocab_idx = ordered.iter().position(|s| s == &vocab_id).unwrap_or(0);
        if vocab_stars > 0 {
            completed_sections += 1;
            total_stars += vocab_stars;
        }
        section_nodes.push(PathSectionNode {
            id: vocab_id.clone(),
            kind: "vocab".to_string(),
            title_native: "单词学习".to_string(),
            title_target: "Vocabulario".to_string(),
            question_count: unit_vocab_words(&unit).len() as i32,
            stars: vocab_stars,
            best_score: vocab_prog.map(|p| p.best_score).unwrap_or(0),
            locked: node_locked(vocab_idx, &ordered, &progress),
            current: first_incomplete.as_ref() == Some(&vocab_id),
        });

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
            let locked = node_locked(idx, &ordered, &progress);
            let current = first_incomplete.as_ref() == Some(&sid);

            section_nodes.push(PathSectionNode {
                id: sid,
                kind: "practice".to_string(),
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
    let pair_key = resolve_pair_key(native_lang, target_lang)
        .ok_or_else(|| format!("no question bank for {native_lang}-{target_lang}"))?;
    let curriculum = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
    if curriculum.status != "active" {
        return Err("path curriculum is not active".to_string());
    }
    let section = find_section(&curriculum, section_id)
        .ok_or_else(|| format!("unknown section {section_id}"))?;

    if section.1.kind != "practice" {
        return Err("not a practice section".to_string());
    }
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

pub fn get_grammar_explanation_cache(
    pool: &DatabasePool,
    pair_key: &str,
    cefr: &str,
    unit_id: &str,
    point_text: &str,
) -> Result<Option<String>, String> {
    let conn = pool.conn()?;
    let row: Option<String> = conn
        .query_row(
            "SELECT explanation FROM path_grammar_explain_cache
             WHERE pair_key = ?1 AND cefr = ?2 AND unit_id = ?3 AND point_text = ?4",
            params![pair_key, cefr, unit_id, point_text],
            |row| row.get(0),
        )
        .ok();
    Ok(row)
}

pub fn save_grammar_explanation_cache(
    pool: &DatabasePool,
    pair_key: &str,
    cefr: &str,
    unit_id: &str,
    point_text: &str,
    explanation: &str,
) -> Result<(), String> {
    let conn = pool.conn()?;
    conn.execute(
        "INSERT INTO path_grammar_explain_cache
            (pair_key, cefr, unit_id, point_text, explanation, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(pair_key, cefr, unit_id, point_text) DO UPDATE SET
            explanation = excluded.explanation,
            created_at = datetime('now')",
        params![pair_key, cefr, unit_id, point_text, explanation],
    )
    .map_err(|e| format!("Failed to save grammar explanation cache: {e}"))?;
    Ok(())
}

pub async fn explain_grammar_point(
    client: &LlmClient,
    pool: &DatabasePool,
    cefr: &str,
    target_lang: &str,
    unit_id: &str,
    point_text: &str,
    unit_title: &str,
    unit_goal: &str,
) -> Result<GrammarExplainResult, String> {
    let pair_key =
        resolve_pair_key("zh", target_lang).unwrap_or_else(|| PRIMARY_PAIR_KEY.to_string());
    if let Some(cached) = get_grammar_explanation_cache(pool, &pair_key, cefr, unit_id, point_text)?
    {
        return Ok(GrammarExplainResult {
            explanation: cached,
            from_cache: true,
        });
    }

    let explanation = llm::explain_grammar_point(
        client,
        pool,
        cefr,
        target_lang,
        unit_title,
        unit_goal,
        point_text,
    )
    .await?;

    save_grammar_explanation_cache(pool, &pair_key, cefr, unit_id, point_text, &explanation)?;

    Ok(GrammarExplainResult {
        explanation,
        from_cache: false,
    })
}

pub fn get_teaching_content(
    pool: &DatabasePool,
    user_id: &str,
    native_lang: &str,
    target_lang: &str,
    cefr: &str,
    node_id: &str,
) -> Result<PathTeaching, String> {
    let pair_key = resolve_pair_key(native_lang, target_lang)
        .ok_or_else(|| format!("no question bank for {native_lang}-{target_lang}"))?;
    let curriculum = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
    if curriculum.status != "active" {
        return Err("path curriculum is not active".to_string());
    }
    let node =
        find_section(&curriculum, node_id).ok_or_else(|| format!("unknown node {node_id}"))?;
    if node.1.kind != "grammar" && node.1.kind != "vocab" {
        return Err("not a teaching node".to_string());
    }
    if node.1.locked {
        return Err("node is locked".to_string());
    }

    let (_, unit_id, _) =
        parse_node_id(node_id).ok_or_else(|| format!("invalid node id {node_id}"))?;
    let units = framework_units(&pair_key, cefr)?;
    let unit = units
        .iter()
        .find(|u| u.id == unit_id)
        .ok_or_else(|| format!("unknown unit {unit_id}"))?;

    let words = if node.1.kind == "vocab" {
        lookup_word_glosses(pool, &unit_vocab_words(unit), target_lang)?
    } else {
        vec![]
    };

    Ok(PathTeaching {
        node_id: node_id.to_string(),
        kind: node.1.kind.clone(),
        unit_id: unit.id.clone(),
        unit_title_native: unit.title_native.clone(),
        unit_title_target: unit.title_target.clone(),
        goal_native: unit.goal_native.clone(),
        grammar_points: unit.grammar_points.clone(),
        words,
        scenarios: unit.scenarios.clone(),
    })
}

pub fn complete_teaching_node(
    pool: &DatabasePool,
    user_id: &str,
    native_lang: &str,
    target_lang: &str,
    cefr: &str,
    node_id: &str,
) -> Result<CompleteSectionResult, String> {
    let pair_key = resolve_pair_key(native_lang, target_lang)
        .ok_or_else(|| format!("no question bank for {native_lang}-{target_lang}"))?;
    let curriculum = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
    if curriculum.status != "active" {
        return Err("path curriculum is not active".to_string());
    }
    let node = find_section(&curriculum, node_id)
        .map(|(_, s)| s)
        .ok_or_else(|| format!("unknown node {node_id}"))?;
    if node.kind != "grammar" && node.kind != "vocab" {
        return Err("not a teaching node".to_string());
    }
    if node.locked {
        return Err("node is locked".to_string());
    }

    let stars = 1i32;
    let score = 100i32;
    let passed = true;

    let (new_stars, new_best, _new_attempts) = {
        let conn = pool.conn()?;
        let existing: Option<(i32, i32, i32)> = conn
            .query_row(
                "SELECT stars, best_score, attempts FROM path_section_progress
                 WHERE user_id = ?1 AND pair_key = ?2 AND section_id = ?3",
                params![user_id, pair_key, node_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .ok();

        let (prev_stars, prev_best, prev_attempts) = existing.unwrap_or((0, 0, 0));
        let new_stars = prev_stars.max(stars);
        let new_best = prev_best.max(score);
        let new_attempts = prev_attempts + 1;
        let completed_at = Some(chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string());

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
                node_id,
                new_stars,
                new_best,
                new_attempts,
                completed_at
            ],
        )
        .map_err(|e| e.to_string())?;
        (new_stars, new_best, new_attempts)
    };

    let ordered = ordered_node_ids(&pair_key, cefr)?;
    let next_section_id = ordered
        .iter()
        .position(|s| s == node_id)
        .and_then(|idx| ordered.get(idx + 1).cloned());

    let mut level_upgraded = false;
    let mut new_cefr_level = None;
    let refreshed = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
    if is_level_fully_completed(&refreshed) {
        if let Some(upgraded) = try_upgrade_cefr_level(pool, user_id, target_lang, cefr)? {
            level_upgraded = true;
            new_cefr_level = Some(upgraded);
        }
    }

    let weekly_active_days_before = weekly_active_days_before_completion(pool, user_id, passed);
    let (streak_current, streak_extended) =
        streak_fields_for_completion(pool, user_id, passed);
    let (daily_goal_just_met, daily_goal_lessons_today, daily_goal_target) =
        daily_goal_fields_for_completion(pool, user_id, target_lang, passed);
    let (weekly_goal_just_met, weekly_goal_active_days, weekly_goal_target_days) =
        weekly_goal_fields_for_completion(
            pool,
            user_id,
            target_lang,
            passed,
            weekly_active_days_before,
        );
    let (lessons_completed_total, _) =
        lesson_fields_for_completion(pool, user_id, &pair_key, passed, false);
    let perfect_streak = load_perfect_lesson_streak(pool, user_id).unwrap_or(PerfectLessonStreak {
        current: 0,
        best: 0,
    });

    Ok(CompleteSectionResult {
        stars: new_stars,
        best_score: new_best,
        passed,
        next_section_id,
        level_upgraded,
        new_cefr_level,
        streak_current,
        streak_extended,
        daily_goal_just_met,
        daily_goal_lessons_today,
        daily_goal_target,
        weekly_goal_just_met,
        weekly_goal_active_days,
        weekly_goal_target_days,
        lessons_completed_total,
        lesson_milestone_reached: None,
        perfect_lesson_streak: perfect_streak.current,
        perfect_lesson_streak_best: perfect_streak.best,
        perfect_lesson_milestone_reached: None,
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
    is_perfect: bool,
) -> Result<CompleteSectionResult, String> {
    if total_count <= 0 {
        return Err("total_count must be positive".to_string());
    }
    let pair_key = resolve_pair_key(native_lang, target_lang)
        .ok_or_else(|| format!("no question bank for {native_lang}-{target_lang}"))?;
    let curriculum = get_path_curriculum(pool, user_id, native_lang, target_lang, cefr)?;
    if curriculum.status != "active" {
        return Err("path curriculum is not active".to_string());
    }
    let section = find_section(&curriculum, section_id)
        .map(|(_, s)| s)
        .ok_or_else(|| format!("unknown section {section_id}"))?;
    if section.kind != "practice" {
        return Err("not a practice section".to_string());
    }
    if section.locked {
        return Err("section is locked".to_string());
    }

    let score = ((correct_count as f64 / total_count as f64) * 100.0).round() as i32;
    let stars = stars_from_score(score);
    let passed = stars > 0;

    let (prev_stars, new_stars, new_best, _new_attempts) = {
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
        (prev_stars, new_stars, new_best, new_attempts)
    };
    let first_time_pass = passed && prev_stars == 0;

    let ordered = ordered_node_ids(&pair_key, cefr)?;
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
            if let Some(upgraded) = try_upgrade_cefr_level(pool, user_id, target_lang, cefr)? {
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

    let weekly_active_days_before = weekly_active_days_before_completion(pool, user_id, passed);
    let (streak_current, streak_extended) =
        streak_fields_for_completion(pool, user_id, passed);
    let (daily_goal_just_met, daily_goal_lessons_today, daily_goal_target) =
        daily_goal_fields_for_completion(pool, user_id, target_lang, passed);
    let (weekly_goal_just_met, weekly_goal_active_days, weekly_goal_target_days) =
        weekly_goal_fields_for_completion(
            pool,
            user_id,
            target_lang,
            passed,
            weekly_active_days_before,
        );
    let (lessons_completed_total, lesson_milestone_reached) =
        lesson_fields_for_completion(pool, user_id, &pair_key, passed, first_time_pass);
    let (perfect_lesson_streak, perfect_lesson_streak_best, perfect_lesson_milestone_reached) =
        update_perfect_lesson_streak(pool, user_id, passed, is_perfect).unwrap_or((0, 0, None));

    Ok(CompleteSectionResult {
        stars: new_stars,
        best_score: new_best,
        passed,
        next_section_id,
        level_upgraded,
        new_cefr_level,
        streak_current,
        streak_extended,
        daily_goal_just_met,
        daily_goal_lessons_today,
        daily_goal_target,
        weekly_goal_just_met,
        weekly_goal_active_days,
        weekly_goal_target_days,
        lessons_completed_total,
        lesson_milestone_reached,
        perfect_lesson_streak,
        perfect_lesson_streak_best,
        perfect_lesson_milestone_reached,
    })
}

fn weekly_active_days_before_completion(
    pool: &DatabasePool,
    user_id: &str,
    passed: bool,
) -> i32 {
    if !passed {
        return 0;
    }
    crate::modules::streak::get_weekly_activity(pool, user_id)
        .map(|activity| activity.active_days)
        .unwrap_or(0)
}

fn weekly_goal_fields_for_completion(
    pool: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    passed: bool,
    active_days_before: i32,
) -> (bool, i32, i32) {
    if !passed {
        return (false, 0, 0);
    }
    let daily_minutes = match user::get_daily_minutes_for_target(pool, user_id, target_lang) {
        Ok(minutes) => minutes,
        Err(e) => {
            log::warn!("Failed to load daily minutes: {}", e);
            return (false, 0, 0);
        }
    };
    let target_lessons =
        crate::modules::streak::lesson_goal_from_daily_minutes(daily_minutes);
    let target_days = crate::modules::streak::weekly_goal_from_daily_target(target_lessons);
    match crate::modules::streak::get_weekly_activity(pool, user_id) {
        Ok(activity) => {
            let just_met =
                active_days_before < target_days && activity.active_days >= target_days;
            (just_met, activity.active_days, target_days)
        }
        Err(e) => {
            log::warn!("Failed to load weekly activity: {}", e);
            (false, 0, 0)
        }
    }
}

fn daily_goal_fields_for_completion(
    pool: &DatabasePool,
    user_id: &str,
    target_lang: &str,
    passed: bool,
) -> (bool, i32, i32) {
    if !passed {
        return (false, 0, 0);
    }
    let daily_minutes = match user::get_daily_minutes_for_target(pool, user_id, target_lang) {
        Ok(minutes) => minutes,
        Err(e) => {
            log::warn!("Failed to load daily minutes: {}", e);
            return (false, 0, 0);
        }
    };
    match crate::modules::streak::get_daily_goal_progress(pool, user_id, daily_minutes) {
        Ok(progress) => {
            let just_met =
                progress.goal_met && progress.lessons_today == progress.target_lessons;
            (
                just_met,
                progress.lessons_today,
                progress.target_lessons,
            )
        }
        Err(e) => {
            log::warn!("Failed to load daily goal progress: {}", e);
            (false, 0, 0)
        }
    }
}

fn streak_fields_for_completion(
    pool: &DatabasePool,
    user_id: &str,
    passed: bool,
) -> (i32, bool) {
    if !passed {
        return (0, false);
    }
    match crate::modules::streak::record_lesson_completed(pool, user_id) {
        Ok(update) => (update.current, update.extended),
        Err(e) => {
            log::warn!("Failed to record lesson streak: {}", e);
            (0, false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::DatabasePool;
    use crate::modules::llm::LlmClient;

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
    fn is_path_supported_exact_and_fallback() {
        assert!(is_path_supported("zh", "es"));
        assert!(is_path_supported("zh", "en"));
        // No en-es bank; falls back to zh-es (same target language).
        assert!(is_path_supported("en", "es"));
        assert!(!is_path_supported("en", "fr"));
    }

    #[test]
    fn resolve_pair_key_prefers_exact_then_fallback() {
        assert_eq!(resolve_pair_key("zh", "es").as_deref(), Some("zh-es"));
        assert_eq!(
            resolve_pair_key("zh", "en").as_deref(),
            Some("pair_1782569237717")
        );
        assert_eq!(resolve_pair_key("en", "es").as_deref(), Some("zh-es"));
        assert!(resolve_pair_key("en", "fr").is_none());
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
        let nodes = &curriculum.units[0].sections;
        assert_eq!(nodes[0].kind, "grammar");
        assert!(!nodes[0].locked);
        assert_eq!(nodes[1].kind, "vocab");
        assert!(nodes[1].locked);
        assert_eq!(nodes[2].kind, "practice");
        assert!(nodes[2].question_count > 0);
        assert!(nodes[2].locked);
    }

    #[test]
    fn unsupported_pair_returns_status() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "en", "fr", "A1").unwrap();
        assert_eq!(curriculum.status, "unsupported");
        assert!(curriculum.units.is_empty());
    }

    #[test]
    fn en_native_es_target_falls_back_to_zh_es() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "en", "es", "A1").unwrap();
        assert_eq!(curriculum.pair_key, "zh-es");
        assert_eq!(curriculum.status, "active");
        assert!(!curriculum.units.is_empty());
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
    fn teaching_nodes_unlock_practice_chain() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let grammar = curriculum.units[0].sections[0].id.clone();
        let vocab = curriculum.units[0].sections[1].id.clone();
        let practice = curriculum.units[0].sections[2].id.clone();

        complete_teaching_node(&pool, &user, "zh", "es", "A1", &grammar).unwrap();
        let after_grammar = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        assert!(!after_grammar.units[0].sections[1].locked);

        complete_teaching_node(&pool, &user, "zh", "es", "A1", &vocab).unwrap();
        let after_vocab = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        assert!(!after_vocab.units[0].sections[2].locked);

        let result = complete_section(&pool, &user, "zh", "es", "A1", &practice, 5, 5, true).unwrap();
        assert!(result.passed);
        assert_eq!(result.stars, 3);
        assert_eq!(result.perfect_lesson_streak, 1);
    }

    fn insert_active_day(pool: &DatabasePool, user_id: &str, date: &str) {
        let conn = pool.conn().unwrap();
        conn.execute(
            "INSERT INTO streak_records (user_id, date, lessons_completed) VALUES (?1, ?2, 1)",
            rusqlite::params![user_id, date],
        )
        .unwrap();
    }

    #[test]
    fn complete_section_reports_weekly_goal_just_met() {
        use chrono::{Duration, Local};

        let pool = test_pool();
        let user = test_user(&pool);
        let today = Local::now().date_naive();
        for offset in 1..=4 {
            let date = today - Duration::days(offset);
            insert_active_day(&pool, &user, &date.format("%Y-%m-%d").to_string());
        }

        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let grammar = curriculum.units[0].sections[0].id.clone();

        let result = complete_teaching_node(&pool, &user, "zh", "es", "A1", &grammar).unwrap();
        assert!(result.weekly_goal_just_met);
        assert_eq!(result.weekly_goal_active_days, 5);
        assert_eq!(result.weekly_goal_target_days, 5);
    }

    #[test]
    fn complete_section_reports_daily_goal_just_met() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let grammar = curriculum.units[0].sections[0].id.clone();
        let vocab = curriculum.units[0].sections[1].id.clone();
        let practice = curriculum.units[0].sections[2].id.clone();

        let after_grammar =
            complete_teaching_node(&pool, &user, "zh", "es", "A1", &grammar).unwrap();
        assert!(!after_grammar.daily_goal_just_met);
        assert_eq!(after_grammar.daily_goal_lessons_today, 1);
        assert_eq!(after_grammar.daily_goal_target, 2);

        let after_vocab = complete_teaching_node(&pool, &user, "zh", "es", "A1", &vocab).unwrap();
        assert!(after_vocab.daily_goal_just_met);
        assert_eq!(after_vocab.daily_goal_lessons_today, 2);
        assert_eq!(after_vocab.daily_goal_target, 2);

        let after_practice =
            complete_section(&pool, &user, "zh", "es", "A1", &practice, 5, 5, true).unwrap();
        assert!(!after_practice.daily_goal_just_met);
        assert_eq!(after_practice.daily_goal_lessons_today, 3);
        assert_eq!(after_practice.daily_goal_target, 2);
    }

    #[test]
    fn get_teaching_content_returns_grammar_and_vocab() {
        let pool = test_pool();
        let user = test_user(&pool);
        import_vocab_for_tests(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let grammar_id = curriculum.units[0].sections[0].id.clone();
        let vocab_id = curriculum.units[0].sections[1].id.clone();

        let grammar = get_teaching_content(&pool, &user, "zh", "es", "A1", &grammar_id).unwrap();
        assert_eq!(grammar.kind, "grammar");
        assert!(!grammar.grammar_points.is_empty());

        complete_teaching_node(&pool, &user, "zh", "es", "A1", &grammar_id).unwrap();
        let vocab = get_teaching_content(&pool, &user, "zh", "es", "A1", &vocab_id).unwrap();
        assert_eq!(vocab.kind, "vocab");
        assert!(!vocab.words.is_empty());
    }

    fn import_vocab_for_tests(pool: &DatabasePool) {
        let _ = crate::modules::vocabulary::import_vocab_bank(pool);
    }

    #[test]
    fn lesson_milestone_progress_counts_toward_next_target() {
        let progress = lesson_milestone_progress(3);
        assert_eq!(progress.completed, 3);
        assert_eq!(progress.next_milestone, Some(10));
        assert_eq!(progress.progress_pct, 30);

        let maxed = lesson_milestone_progress(500);
        assert_eq!(maxed.next_milestone, None);
        assert_eq!(maxed.progress_pct, 100);
    }

    #[test]
    fn lesson_milestone_reached_only_on_first_crossing() {
        assert_eq!(lesson_milestone_reached(9, 10), Some(10));
        assert_eq!(lesson_milestone_reached(24, 25), Some(25));
        assert_eq!(lesson_milestone_reached(10, 11), None);
        assert_eq!(lesson_milestone_reached(10, 10), None);
    }

    #[test]
    fn complete_section_reports_lesson_milestone_on_first_pass() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let grammar = curriculum.units[0].sections[0].id.clone();
        let vocab = curriculum.units[0].sections[1].id.clone();
        let practice = curriculum.units[0].sections[2].id.clone();

        complete_teaching_node(&pool, &user, "zh", "es", "A1", &grammar).unwrap();
        complete_teaching_node(&pool, &user, "zh", "es", "A1", &vocab).unwrap();

        {
            let conn = pool.conn().unwrap();
            for i in 0..9 {
                conn.execute(
                    "INSERT INTO path_section_progress
                        (user_id, pair_key, section_id, stars, best_score, attempts, completed_at)
                     VALUES (?1, 'zh-es', ?2, 1, 80, 1, datetime('now'))",
                    params![user, format!("zh-es/FAKE-PRACTICE-{i}")],
                )
                .unwrap();
            }
        }

        let result = complete_section(&pool, &user, "zh", "es", "A1", &practice, 5, 5, true).unwrap();
        assert_eq!(result.lessons_completed_total, 10);
        assert_eq!(result.lesson_milestone_reached, Some(10));
    }

    #[test]
    fn perfect_lesson_milestone_reached_only_on_first_crossing() {
        assert_eq!(perfect_lesson_milestone_reached(2, 3), Some(3));
        assert_eq!(perfect_lesson_milestone_reached(4, 5), Some(5));
        assert_eq!(perfect_lesson_milestone_reached(3, 4), None);
        assert_eq!(perfect_lesson_milestone_reached(9, 10), Some(10));
    }

    #[test]
    fn complete_section_tracks_perfect_lesson_streak() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let grammar = curriculum.units[0].sections[0].id.clone();
        let vocab = curriculum.units[0].sections[1].id.clone();
        let practice = curriculum.units[0].sections[2].id.clone();

        complete_teaching_node(&pool, &user, "zh", "es", "A1", &grammar).unwrap();
        complete_teaching_node(&pool, &user, "zh", "es", "A1", &vocab).unwrap();

        let first = complete_section(&pool, &user, "zh", "es", "A1", &practice, 5, 5, true).unwrap();
        assert_eq!(first.perfect_lesson_streak, 1);
        assert_eq!(first.perfect_lesson_streak_best, 1);
        assert!(first.perfect_lesson_milestone_reached.is_none());

        let second = complete_section(&pool, &user, "zh", "es", "A1", &practice, 5, 5, true).unwrap();
        assert_eq!(second.perfect_lesson_streak, 2);

        let third = complete_section(&pool, &user, "zh", "es", "A1", &practice, 4, 5, false).unwrap();
        assert_eq!(third.perfect_lesson_streak, 0);
        assert_eq!(third.perfect_lesson_streak_best, 2);

        let fourth = complete_section(&pool, &user, "zh", "es", "A1", &practice, 5, 5, true).unwrap();
        assert_eq!(fourth.perfect_lesson_streak, 1);

        let fifth = complete_section(&pool, &user, "zh", "es", "A1", &practice, 5, 5, true).unwrap();
        assert_eq!(fifth.perfect_lesson_streak, 2);

        let sixth = complete_section(&pool, &user, "zh", "es", "A1", &practice, 5, 5, true).unwrap();
        assert_eq!(sixth.perfect_lesson_streak, 3);
        assert_eq!(sixth.perfect_lesson_milestone_reached, Some(3));
    }

    #[tokio::test]
    #[ignore = "live LLM call — run with: cargo test explain_grammar_point_end_to_end -- --ignored --nocapture"]
    async fn explain_grammar_point_end_to_end_caches_result() {
        let pool = test_pool();
        crate::modules::prompts::ensure_default_prompts(&pool);
        let client = LlmClient::new();
        let point = "ser 和 estar 的基本区别：ser 用于描述永久特征，estar 用于描述临时状态";

        let first = explain_grammar_point(
            &client,
            &pool,
            "A1",
            "es",
            "U01",
            point,
            "基础问候与自我介绍",
            "掌握基础问候用语",
        )
        .await
        .expect("first explain should succeed");
        assert!(!first.explanation.is_empty());
        assert!(!first.from_cache);

        let second = explain_grammar_point(
            &client,
            &pool,
            "A1",
            "es",
            "U01",
            point,
            "基础问候与自我介绍",
            "掌握基础问候用语",
        )
        .await
        .expect("cached explain should succeed");
        assert!(second.from_cache);
        assert_eq!(second.explanation, first.explanation);
    }

    #[test]
    fn grammar_explanation_cache_roundtrip() {
        let pool = test_pool();
        assert!(
            get_grammar_explanation_cache(&pool, "zh-es", "A1", "U01", "test point")
                .unwrap()
                .is_none()
        );

        save_grammar_explanation_cache(
            &pool,
            "zh-es",
            "A1",
            "U01",
            "test point",
            "cached explanation",
        )
        .unwrap();

        let cached =
            get_grammar_explanation_cache(&pool, "zh-es", "A1", "U01", "test point").unwrap();
        assert_eq!(cached.as_deref(), Some("cached explanation"));
    }

    #[test]
    fn get_section_lesson_returns_questions() {
        let pool = test_pool();
        let user = test_user(&pool);
        let curriculum = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let grammar_id = curriculum.units[0].sections[0].id.clone();
        let vocab_id = curriculum.units[0].sections[1].id.clone();
        let section_id = curriculum.units[0].sections[2].id.clone();
        complete_teaching_node(&pool, &user, "zh", "es", "A1", &grammar_id).unwrap();
        complete_teaching_node(&pool, &user, "zh", "es", "A1", &vocab_id).unwrap();
        let lesson = get_section_lesson(&pool, &user, "zh", "es", "A1", &section_id).unwrap();
        assert!(!lesson.questions.is_empty());
        assert!(lesson
            .questions
            .iter()
            .all(|q| q.get("cefr").and_then(|v| v.as_str()) == Some("A1")));
    }

    #[test]
    fn a1_and_a2_question_counts_differ_for_same_section() {
        let pool = test_pool();
        let user = test_user(&pool);
        let a1 = get_path_curriculum(&pool, &user, "zh", "es", "A1").unwrap();
        let a2 = get_path_curriculum(&pool, &user, "zh", "es", "A2").unwrap();
        let a1_count = a1.units[0].sections[2].question_count;
        let a2_count = a2.units[0].sections[2].question_count;
        assert!(a1_count > 0);
        assert!(a2_count > 0);
        assert_ne!(a1_count, a2_count);
    }
}
