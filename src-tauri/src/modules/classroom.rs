use crate::modules::{database::DatabasePool, llm, reading};
use rusqlite::{params, OptionalExtension};
use serde::Deserialize;
use serde_json::{json, Value};

const PLAN_PROMPT: &str =
    include_str!("../../../src/modules/reading/classroom/teachingPlanPrompt.txt");
const TOPIC_PROMPT: &str = include_str!("topic_teaching_prompt.txt");
const DIAGRAM_PROMPT: &str =
    include_str!("../../../src/modules/reading/classroom/boardDiagramPrompt.txt");

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PlanStage {
    Generating,
    Validating,
    Saving,
}

pub type TokenProgress = Option<llm::CompletionProgress>;

#[derive(serde::Deserialize, serde::Serialize)]
struct BoardDiagram {
    description: String,
    shapes: Vec<DiagramShape>,
}

type Point = [f64; 2];

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum DiagramShape {
    Line { points: [Point; 2] },
    Arrow { points: [Point; 2] },
    Polyline { points: Vec<Point> },
    Dot { at: Point },
    Label { at: Point, text: String },
}

fn valid_point([x, y]: Point) -> bool {
    (0.0..=100.0).contains(&x) && (0.0..=56.0).contains(&y)
}

impl DiagramShape {
    fn is_valid(&self) -> bool {
        match self {
            Self::Line { points } | Self::Arrow { points } => {
                points.iter().copied().all(valid_point)
            }
            Self::Polyline { points } => {
                (2..=24).contains(&points.len()) && points.iter().copied().all(valid_point)
            }
            Self::Dot { at } => valid_point(*at),
            Self::Label { at, text } => {
                valid_point(*at) && !text.trim().is_empty() && text.chars().count() <= 28
            }
        }
    }
}

fn plan_beat(index: usize, objective: String, board_text: String, diagram: &Value) -> Value {
    let mut beat = json!({
        "id": format!("beat-{}", index + 1),
        "objective": objective,
        "board_text": board_text
    });
    if let Ok(diagram) = BoardDiagram::deserialize(diagram) {
        if !diagram.description.trim().is_empty()
            && diagram.description.chars().count() <= 160
            && (1..=14).contains(&diagram.shapes.len())
            && diagram.shapes.iter().all(DiagramShape::is_valid)
        {
            beat["diagram"] = json!(diagram);
        }
    }
    beat
}

pub fn get_classroom(db: &DatabasePool, chapter_id: i64) -> Result<Value, String> {
    let chapter = reading::get_imported_article_chapter(db, chapter_id)?;
    let article = reading::get_imported_article(db, chapter.article_id)?;
    let conn = db.conn()?;
    let saved: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT plan_json, session_json FROM chapter_classrooms WHERE chapter_id = ?1",
            [chapter_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let (plan, session) = match saved {
        Some((p, s)) => (
            serde_json::from_str::<Value>(&p).map_err(|e| e.to_string())?,
            s.map(|v| serde_json::from_str::<Value>(&v))
                .transpose()
                .map_err(|e| e.to_string())?,
        ),
        None => (Value::Null, None),
    };
    Ok(json!({"chapter": chapter, "article": article, "plan": plan, "session": session}))
}

fn clean(value: &Value) -> String {
    value
        .as_str()
        .unwrap_or_default()
        .trim()
        .chars()
        .take(1500)
        .collect()
}

fn clean_transcript_text(value: &Value) -> String {
    crate::modules::news::clean_rss_text(value.as_str().unwrap_or_default())
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn normalize_plan(raw: &Value, context: &Value, version: &str) -> Result<Value, String> {
    let nodes = raw["nodes"]
        .as_array()
        .filter(|n| !n.is_empty() && n.len() <= 6)
        .ok_or("教学大纲节点无效，请重试")?;
    let paragraphs = context["paragraphs"].as_array().ok_or("本节字幕不可用")?;
    let mut result = Vec::new();
    let mut focuses = std::collections::HashSet::new();
    let mut nodes: Vec<_> = nodes.iter().collect();
    nodes.sort_by_key(|node| node["para_idx"].as_u64());
    for (index, node) in nodes.iter().enumerate() {
        let source = paragraphs
            .iter()
            .find(|p| node["para_idx"].is_u64() && p["para_idx"] == node["para_idx"])
            .ok_or("教学大纲引用了本节之外的原文")?;
        let start = source["start"].as_f64().ok_or("无效原声时间")?;
        let end = source["end"]
            .as_f64()
            .filter(|v| *v > start)
            .ok_or("无效原声时间")?;
        let paragraph_text = clean_transcript_text(&source["text"]);
        let quote = clean_transcript_text(&node["source_quote"]);
        let focus = clean_transcript_text(&node["focus_expression"]);
        if quote.is_empty()
            || quote.chars().count() > 240
            || !paragraph_text.contains(&quote)
            || focus.is_empty()
            || !quote.contains(&focus)
        {
            return Err("教学大纲必须引用包含所教表达的真实原句".into());
        }
        if !focuses.insert(focus.to_lowercase()) {
            return Err("教学大纲重复讲解同一表达".into());
        }
        let beats = node["beats"]
            .as_array()
            .filter(|b| !b.is_empty() && b.len() <= 4)
            .ok_or("教学小段无效")?;
        if clean(&node["title"]).is_empty() || clean(&node["objective"]).is_empty() {
            return Err("教学大纲缺少目标".into());
        }
        let mut final_beats = Vec::new();
        for (i, beat) in beats.iter().enumerate() {
            if clean(&beat["objective"]).is_empty() || clean(&beat["board_text"]).is_empty() {
                return Err("教学小段缺少目标或板书".into());
            }
            final_beats.push(plan_beat(
                i,
                clean(&beat["objective"]),
                clean(&beat["board_text"]),
                &beat["diagram"],
            ));
        }
        let practice = &node["practice"];
        let practice = if matches!(
            practice["kind"].as_str(),
            Some("repeat" | "comprehension" | "rephrase" | "dialogue")
        ) && !clean(&practice["objective"]).is_empty()
        {
            if clean(&practice["scaffold"]).is_empty()
                || clean(&practice["answer_example"]).is_empty()
            {
                return Err("课堂练习必须提供句型支撑和参考回答".into());
            }
            json!({"kind": practice["kind"], "objective": clean(&practice["objective"]), "scaffold": clean(&practice["scaffold"]), "answer_example": clean(&practice["answer_example"])})
        } else {
            if !practice.is_null() {
                return Err("课堂练习必须提供句型支撑和参考回答".into());
            }
            Value::Null
        };
        let points: Vec<String> = node["key_points"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(clean)
                    .filter(|s| !s.is_empty())
                    .take(8)
                    .collect()
            })
            .unwrap_or_default();
        let examples: Vec<Value> = node["examples"]
            .as_array()
            .map(|a| {
                a.iter()
                    .take(2)
                    .map(|e| json!({"text":clean(&e["text"]),"meaning":clean(&e["meaning"])}))
                    .collect()
            })
            .unwrap_or_default();
        if points.is_empty()
            || examples.is_empty()
            || examples
                .iter()
                .any(|e| clean(&e["text"]).is_empty() || clean(&e["meaning"]).is_empty())
        {
            return Err("教学大纲缺少表达用法或双语补充例句".into());
        }
        result.push(json!({"id":format!("node-{}", index+1), "title":clean(&node["title"]), "objective":clean(&node["objective"]),
            "focus_expression":focus,"key_points":points,"examples":examples, "beats":final_beats,"practice":practice,
            "source":{"para_idx":source["para_idx"],"text":quote,"paragraph_text":paragraph_text,"start_sec":start,"end_sec":end}}));
    }
    let goals: Vec<String> = raw["goals"]
        .as_array()
        .map(|a| {
            a.iter()
                .map(clean)
                .filter(|s| !s.is_empty())
                .take(8)
                .collect()
        })
        .unwrap_or_default();
    if goals.is_empty() || !result.iter().any(|node| !node["practice"].is_null()) {
        return Err("教学大纲缺少学习目标或有支撑的练习".into());
    }
    Ok(
        json!({"schema_version":2,"version":version,"title":if clean(&raw["title"]).is_empty() { clean(&context["title"]) } else { clean(&raw["title"]) },
        "goals":goals,"target_language":context["target_language"],"native_language":context["native_language"],"cefr_level":context["cefr_level"],"nodes":result}),
    )
}

fn topic_plan(raw: &Value, goal: &str, default_language: &str) -> Result<Value, String> {
    fn required(value: &Value) -> Result<String, String> {
        let text = clean(value);
        if text.is_empty() {
            return Err("课程大纲缺少必要内容，请重试".into());
        }
        Ok(text)
    }

    fn items(value: &Value, max: usize) -> Result<&[Value], String> {
        value
            .as_array()
            .filter(|items| !items.is_empty() && items.len() <= max)
            .map(Vec::as_slice)
            .ok_or_else(|| "课程大纲结构无效，请重试".into())
    }

    let goals = items(&raw["goals"], 6)?
        .iter()
        .map(required)
        .collect::<Result<Vec<_>, _>>()?;
    let mut nodes = Vec::new();
    for (index, node) in items(&raw["nodes"], 6)?.iter().enumerate() {
        let mut beats = Vec::new();
        for (i, beat) in items(&node["beats"], 4)?.iter().enumerate() {
            beats.push(plan_beat(
                i,
                required(&beat["objective"])?,
                required(&beat["board_text"])?,
                &beat["diagram"],
            ));
        }
        let title = required(&node["title"])?;
        let practice = &node["practice"];
        let practice = if practice.is_null() {
            Value::Null
        } else {
            json!({
                "kind": "comprehension",
                "objective": required(&practice["objective"])?,
                "scaffold": required(&practice["scaffold"])?,
                "answer_example": required(&practice["answer_example"])?
            })
        };
        nodes.push(json!({
            "id": format!("node-{}", index + 1),
            "title": title,
            "objective": required(&node["objective"])?,
            "focus_expression": title,
            "beats": beats,
            "practice": practice
        }));
    }
    let language = raw["teaching_language"]
        .as_str()
        .filter(|code| {
            (2..=35).contains(&code.len())
                && code.as_bytes()[0].is_ascii_alphabetic()
                && code
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
        })
        .unwrap_or(default_language);
    Ok(json!({
        "schema_version": 2,
        "version": uuid::Uuid::new_v4().to_string(),
        "kind": "topic",
        "title": required(&raw["title"])?.chars().take(150).collect::<String>(),
        "learning_goal": goal,
        "goals": goals,
        "native_language": language,
        "nodes": nodes
    }))
}

pub async fn generate_topic_plan(
    db: &DatabasePool,
    client: &llm::LlmClient,
    goal: &str,
    locale: &str,
    report: impl Fn(PlanStage, TokenProgress),
) -> Result<Value, String> {
    let goal = goal.trim();
    if goal.is_empty() || goal.chars().count() > 16000 {
        return Err("请输入 1 至 16000 字的学习目标或题目".into());
    }
    let default_language = match locale {
        "en" => "en",
        "es" => "es",
        _ => "zh",
    };
    let raw = request_plan(
        db,
        client,
        TOPIC_PROMPT,
        &json!({"learning_goal": goal, "default_language": default_language}),
        &report,
    )
    .await?;
    topic_plan(&raw, goal, default_language)
}

async fn request_plan(
    db: &DatabasePool,
    client: &llm::LlmClient,
    prompt: &str,
    context: &Value,
    report: &impl Fn(PlanStage, TokenProgress),
) -> Result<Value, String> {
    report(PlanStage::Generating, None);
    let reply = client
        .chat_for_teaching_plan(
            db,
            vec![
                llm::ChatMessage {
                    role: "system".into(),
                    content: format!("{prompt}\n\n{DIAGRAM_PROMPT}"),
                },
                llm::ChatMessage {
                    role: "user".into(),
                    content: context.to_string(),
                },
            ],
            |count| report(PlanStage::Generating, Some(count)),
        )
        .await?;
    report(PlanStage::Validating, None);
    let stripped = reply
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    serde_json::from_str(stripped).map_err(|e| format!("教学大纲格式无效，请重试: {e}"))
}

pub async fn generate_plan(
    db: &DatabasePool,
    client: &llm::LlmClient,
    chapter_id: i64,
    regenerate: bool,
    report: impl Fn(PlanStage, TokenProgress),
) -> Result<Value, String> {
    let current = get_classroom(db, chapter_id)?;
    if !regenerate && !current["plan"].is_null() {
        return Ok(current);
    }
    let chapter = reading::get_imported_article_chapter(db, chapter_id)?;
    let article = reading::get_imported_article(db, chapter.article_id)?;
    let native: String = db
        .conn()?
        .query_row(
            "SELECT native_language FROM users WHERE id = ?1",
            [&article.user_id],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "zh".into());
    let mut paragraphs: Vec<Value> =
        serde_json::from_str(&article.subtitles_json).map_err(|e| format!("字幕无效: {e}"))?;
    for (index, p) in paragraphs.iter_mut().enumerate() {
        p["para_idx"] = json!(index);
        p["text"] = json!(clean_transcript_text(&p["text"]));
    }
    let source: Vec<_> = paragraphs
        .into_iter()
        .filter(|p| {
            p["para_idx"].as_u64().is_some_and(|i| {
                i >= chapter.start_para_idx as u64 && i <= chapter.end_para_idx as u64
            })
        })
        .collect();
    if source.is_empty() {
        return Err("本节没有字幕".into());
    }
    let context = json!({"title":chapter.title,"native_language":native,"target_language":article.target_language,"cefr_level":article.cefr_level.unwrap_or_else(||"A2".into()),"paragraphs":source});
    let raw = request_plan(db, client, PLAN_PROMPT, &context, &report).await?;
    let version = uuid::Uuid::new_v4().to_string();
    let plan = normalize_plan(&raw, &context, &version)?;
    report(PlanStage::Saving, None);
    store_plan(db, chapter_id, &plan, current["plan"]["version"].as_str())?;
    get_classroom(db, chapter_id)
}

fn store_plan(
    db: &DatabasePool,
    chapter_id: i64,
    plan: &Value,
    previous_version: Option<&str>,
) -> Result<(), String> {
    let conn = db.conn()?;
    if let Some(version) = previous_version {
        let changed = conn.execute(
            "UPDATE chapter_classrooms SET plan_json=?1, session_json=NULL, revision=0, updated_at=datetime('now')
             WHERE chapter_id=?2 AND json_extract(plan_json, '$.version')=?3",
            params![plan.to_string(), chapter_id, version],
        ).map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err("课程已更新，请重新进入课堂".into());
        }
    } else {
        conn.execute(
            "INSERT OR IGNORE INTO chapter_classrooms (chapter_id, plan_json) VALUES (?1, ?2)",
            params![chapter_id, plan.to_string()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn save_session(db: &DatabasePool, chapter_id: i64, session: Value) -> Result<Value, String> {
    let conn = db.conn()?;
    let (plan_json, revision): (String, i64) = conn
        .query_row(
            "SELECT plan_json, revision FROM chapter_classrooms WHERE chapter_id=?1",
            [chapter_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let plan: Value = serde_json::from_str(&plan_json).map_err(|e| e.to_string())?;
    validate_session(&session, &plan)?;
    if session["revision"].as_i64() != Some(revision) {
        return Err("课堂记录已更新，请重新进入课堂".into());
    }
    let mut saved = session;
    saved["revision"] = json!(revision + 1);
    let changed = conn.execute("UPDATE chapter_classrooms SET session_json=?1, revision=revision+1, updated_at=datetime('now') WHERE chapter_id=?2 AND revision=?3 AND plan_json=?4", params![saved.to_string(),chapter_id,revision,plan_json]).map_err(|e| e.to_string())?;
    if changed != 1 {
        return Err("课堂记录已更新，请重新进入课堂".into());
    }
    Ok(saved)
}

pub fn validate_session(session: &Value, plan: &Value) -> Result<(), String> {
    if !session["teaching_language"].is_null()
        && !matches!(
            session["teaching_language"].as_str(),
            Some("native" | "target")
        )
    {
        return Err("课堂授课语言无效".into());
    }
    if session.to_string().len() > 250000 || session["plan_version"] != plan["version"] {
        return Err("课堂大纲版本不一致或记录过长".into());
    }
    let index = session["node_index"].as_u64().ok_or("课堂位置无效")? as usize;
    let beat = session["beat_index"].as_u64().ok_or("课堂小段无效")? as usize;
    if plan["nodes"]
        .get(index)
        .and_then(|n| n["beats"].get(beat))
        .is_none()
        || !matches!(
            session["interaction_mode"].as_str(),
            Some("guided" | "listen_only")
        )
    {
        return Err("课堂位置或互动偏好无效".into());
    }
    Ok(())
}

pub fn spawn_article_plan_generation(
    _app: tauri::AppHandle,
    db: DatabasePool,
    client: llm::LlmClient,
    article_id: i64,
) {
    tauri::async_runtime::spawn(async move {
        if let Ok(chapters) = reading::get_imported_article_chapters(&db, article_id) {
            for chapter in chapters {
                if let Err(error) = generate_plan(&db, &client, chapter.id, false, |_, _| {}).await
                {
                    log::warn!("Could not prepare classroom {}: {}", chapter.id, error);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn board_diagram_is_optional_and_validated() {
        let diagram = json!({
            "description": "A timeline",
            "shapes": [
                {"kind": "arrow", "points": [[10, 30], [90, 30]], "extra": "ignored"},
                {"kind": "label", "at": [28, 22], "text": "Ayer"}
            ]
        });
        let beat = plan_beat(0, "Explain".into(), "Yesterday".into(), &diagram);
        assert_eq!(beat["diagram"]["shapes"][1]["text"], "Ayer");
        assert!(beat["diagram"]["shapes"][0].get("extra").is_none());
        let mut invalid = diagram;
        invalid["shapes"][0]["points"][1][0] = json!(101);
        let beat = plan_beat(0, "Explain".into(), "Yesterday".into(), &invalid);
        assert!(beat.get("diagram").is_none());
        assert_eq!(beat["board_text"], "Yesterday");
    }

    use super::*;
    #[test]
    fn classroom_revision_regeneration_and_cascade_preserve_legacy_progress() {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id,nickname) VALUES ('classroom-test','Test')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO imported_articles (id,user_id,target_language,source_type,source_url,source_id,title,subtitles_json) VALUES (9001,'classroom-test','es','youtube','https://youtube.com/watch?v=test','test','Test','[]')", []).unwrap();
        conn.execute("INSERT INTO imported_article_chapters (id,article_id,chapter_index,title,start_para_idx,end_para_idx,start_sec,end_sec,viewed_pages) VALUES (9002,9001,0,'Test',0,0,0,2,4)", []).unwrap();
        let plan = json!({"version":"v1","nodes":[{"beats":[{"id":"beat-1"}]}]});
        conn.execute(
            "INSERT INTO chapter_classrooms (chapter_id,plan_json) VALUES (9002,?1)",
            [plan.to_string()],
        )
        .unwrap();
        drop(conn);
        let session = json!({"plan_version":"v1","node_index":0,"beat_index":0,"interaction_mode":"guided","teaching_language":"target","revision":0});
        assert_eq!(
            save_session(&db, 9002, session.clone()).unwrap()["revision"],
            1
        );
        assert!(save_session(&db, 9002, session.clone()).is_err());
        let saved = get_classroom(&db, 9002).unwrap();
        assert_eq!(saved["chapter"]["viewed_pages"], 4);
        assert_eq!(saved["session"]["revision"], 1);
        assert_eq!(saved["session"]["teaching_language"], "target");

        let mut regenerated = plan.clone();
        regenerated["version"] = json!("v2");
        assert!(store_plan(&db, 9002, &regenerated, Some("stale")).is_err());
        assert_eq!(get_classroom(&db, 9002).unwrap(), saved);
        store_plan(&db, 9002, &regenerated, Some("v1")).unwrap();
        store_plan(&db, 9002, &plan, None).unwrap();
        let replaced = get_classroom(&db, 9002).unwrap();
        assert_eq!(replaced["plan"], regenerated);
        assert!(replaced["session"].is_null());
        assert_eq!(replaced["chapter"]["viewed_pages"], 4);
        assert!(save_session(&db, 9002, session.clone()).is_err());
        let mut new_session = session;
        new_session["plan_version"] = json!("v2");
        assert_eq!(save_session(&db, 9002, new_session).unwrap()["revision"], 1);

        db.conn()
            .unwrap()
            .execute("DELETE FROM imported_articles WHERE id=9001", [])
            .unwrap();
        let count: i64 = db
            .conn()
            .unwrap()
            .query_row("SELECT count(*) FROM chapter_classrooms", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
    #[test]
    fn rejects_outside_source_and_invalid_cursor() {
        let context = json!({"paragraphs":[{"para_idx":2,"start":1,"end":3,"text":"hola"}]});
        let mut raw = valid_language_plan();
        raw["nodes"][0]["para_idx"] = json!(5);
        assert!(normalize_plan(&raw, &context, "v1").is_err());
        raw["nodes"][0]["para_idx"] = json!(2);
        let plan = normalize_plan(&raw, &context, "v1").unwrap();
        assert_eq!(plan["nodes"][0]["source"]["text"], "hola");
        let session =
            json!({"plan_version":"v1","node_index":0,"beat_index":0,"interaction_mode":"guided"});
        assert!(validate_session(&session, &plan).is_ok());
        let mut invalid_language = session.clone();
        invalid_language["teaching_language"] = json!("invalid");
        assert!(validate_session(&invalid_language, &plan).is_err());
        let mut invalid = session;
        invalid["beat_index"] = json!(4);
        assert!(validate_session(&invalid, &plan).is_err());
    }

    fn valid_language_plan() -> Value {
        json!({"goals":["打招呼"],"nodes":[{"title":"hola：问候","objective":"用 hola 问候","focus_expression":"hola","source_quote":"hola","key_points":["hola 表示你好"],"examples":[{"text":"Hola, Ana.","meaning":"你好，安娜。"}],"para_idx":2,"beats":[{"objective":"解释问候用法","board_text":"hola = 你好"}],"practice":{"kind":"repeat","objective":"跟读问候","scaffold":"Hola, … + 名字","answer_example":"Hola, Ana."}}]})
    }

    #[test]
    fn language_plan_keeps_verified_excerpt_and_real_paragraph_range() {
        let context = json!({"paragraphs":[{"para_idx":2,"start":1,"end":30,"text":"Digo&nbsp;hola. &#xBF;Y ma&#241;ana?"}]});
        let plan = normalize_plan(&valid_language_plan(), &context, "v2").unwrap();
        assert_eq!(plan["schema_version"], 2);
        assert_eq!(plan["nodes"][0]["source"]["text"], "hola");
        assert_eq!(
            plan["nodes"][0]["source"]["paragraph_text"],
            "Digo hola. ¿Y mañana?"
        );
        assert_eq!(plan["nodes"][0]["source"]["end_sec"], 30.0);
        assert_eq!(plan["nodes"][0]["practice"]["scaffold"], "Hola, … + 名字");
        assert_eq!(plan["nodes"][0]["examples"][0]["meaning"], "你好，安娜。");
    }

    #[test]
    fn rejects_unfounded_repetitive_and_unsupported_teaching() {
        let context = json!({"paragraphs":[{"para_idx":2,"start":1,"end":3,"text":"hola"}]});
        let paths = [
            "/nodes/0/source_quote",
            "/nodes/0/focus_expression",
            "/nodes/0/key_points",
            "/nodes/0/examples/0/meaning",
            "/nodes/0/practice/scaffold",
            "/nodes/0/beats/0/board_text",
            "/goals",
            "/nodes/0/practice",
        ];
        for path in paths {
            let mut raw = valid_language_plan();
            *raw.pointer_mut(path).unwrap() = Value::Null;
            assert!(
                normalize_plan(&raw, &context, "v2").is_err(),
                "accepted {path}"
            );
        }
        let mut raw = valid_language_plan();
        raw["nodes"][0]["source_quote"] = json!("hola, inventado");
        assert!(normalize_plan(&raw, &context, "v2").is_err());
        let mut raw = valid_language_plan();
        let duplicate = raw["nodes"][0].clone();
        raw["nodes"].as_array_mut().unwrap().push(duplicate);
        assert!(normalize_plan(&raw, &context, "v2").is_err());
    }

    #[test]
    fn source_order_and_short_quotes_are_enforced() {
        let context = json!({"paragraphs":[{"para_idx":2,"start":1,"end":3,"text":"hola"},{"para_idx":3,"start":3,"end":5,"text":"adiós"}]});
        let mut raw = valid_language_plan();
        let mut later = raw["nodes"][0].clone();
        later["para_idx"] = json!(3);
        later["source_quote"] = json!("adiós");
        later["focus_expression"] = json!("adiós");
        raw["nodes"].as_array_mut().unwrap().insert(0, later);
        let plan = normalize_plan(&raw, &context, "v2").unwrap();
        assert_eq!(plan["nodes"][0]["source"]["para_idx"], 2);
        assert_eq!(plan["nodes"][1]["source"]["para_idx"], 3);
        let paragraph = "hola ".repeat(60);
        let context = json!({"paragraphs":[{"para_idx":2,"start":1,"end":3,"text":paragraph}]});
        let mut raw = valid_language_plan();
        raw["nodes"][0]["source_quote"] = json!(paragraph);
        assert!(normalize_plan(&raw, &context, "v2").is_err());
    }

    #[test]
    fn topic_plan_accepts_a_problem_without_subtitles() {
        let goal = "解方程\nx² − 5x + 6 = 0";
        let mut raw = json!({
            "title": "因式分解",
            "teaching_language": "zh-CN",
            "goals": ["用因式分解解方程"],
            "nodes": [{
                "title": "分解二次三项式",
                "objective": "找出两个因数",
                "beats": [{"objective": "用零乘积性质", "board_text": "(x − 2)(x − 3) = 0"}]
            }]
        });
        let plan = topic_plan(&raw, goal, "en").unwrap();
        assert_eq!(plan["learning_goal"], goal);
        assert_eq!(plan["native_language"], "zh-CN");
        assert_eq!(plan["nodes"][0]["beats"][0]["id"], "beat-1");
        assert!(plan["nodes"][0].get("source").is_none());
        raw["nodes"][0]["beats"][0]["board_text"] = json!("");
        assert!(topic_plan(&raw, goal, "en").is_err());
    }
}
