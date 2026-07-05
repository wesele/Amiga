use crate::modules::database::DatabasePool;
use crate::modules::llm::{self, build_chat_messages, LlmClient};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const TOTAL_TURNS: i32 = 8;
const PASS_THRESHOLD: i32 = 60;

#[derive(Debug, Serialize, Clone)]
pub struct SpeakingTopic {
    pub id: &'static str,
    pub cefr: &'static str,
    pub role: &'static str,
    pub scene: &'static str,
}

const TOPICS: &[SpeakingTopic] = &[
    SpeakingTopic {
        id: "self-intro",
        cefr: "A1",
        role: "new friend",
        scene: "Meeting someone for the first time",
    },
    SpeakingTopic {
        id: "cafe-order",
        cefr: "A1",
        role: "barista",
        scene: "Ordering at a café",
    },
    SpeakingTopic {
        id: "directions",
        cefr: "A1",
        role: "local passerby",
        scene: "Asking for directions on the street",
    },
    SpeakingTopic {
        id: "shopping",
        cefr: "A2",
        role: "shop assistant",
        scene: "Buying something at a store",
    },
    SpeakingTopic {
        id: "weather",
        cefr: "A2",
        role: "friend",
        scene: "Casual chat about the weather",
    },
    SpeakingTopic {
        id: "meetup",
        cefr: "A2",
        role: "friend",
        scene: "Making plans to meet",
    },
    SpeakingTopic {
        id: "doctor",
        cefr: "A2",
        role: "doctor",
        scene: "Describing symptoms at a clinic",
    },
    SpeakingTopic {
        id: "hotel",
        cefr: "A2",
        role: "hotel receptionist",
        scene: "Checking in at a hotel",
    },
    SpeakingTopic {
        id: "work-chat",
        cefr: "B1",
        role: "colleague",
        scene: "Simple workplace conversation",
    },
    SpeakingTopic {
        id: "opinion",
        cefr: "B1",
        role: "friend",
        scene: "Sharing opinions on a familiar topic",
    },
    SpeakingTopic {
        id: "complaint",
        cefr: "B1",
        role: "customer service agent",
        scene: "Politely explaining a problem",
    },
    SpeakingTopic {
        id: "interview",
        cefr: "B2",
        role: "interviewer",
        scene: "Job interview self-introduction",
    },
];

pub fn list_topics() -> Vec<SpeakingTopic> {
    TOPICS.to_vec()
}

pub fn get_topic(id: &str) -> Option<&'static SpeakingTopic> {
    TOPICS.iter().find(|t| t.id == id)
}

#[derive(Debug, Serialize, Clone)]
pub struct SpeakingSessionView {
    pub session_id: String,
    pub topic_id: String,
    pub turn: i32,
    pub total_turns: i32,
    pub ai_text: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SpeakingScores {
    pub relevance: i32,
    pub grammar: i32,
    pub pronunciation: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct SpeakingScoreResult {
    pub transcript: String,
    pub scores: SpeakingScores,
    pub total: i32,
    pub pass: bool,
    pub feedback: String,
    pub feedback_target: Option<String>,
    pub completed: bool,
    pub turn: i32,
    pub next_ai_text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawScorePayload {
    transcript: String,
    scores: SpeakingScores,
    total: i32,
    pass: bool,
    feedback: String,
    #[serde(default)]
    feedback_target: Option<String>,
}

struct SessionRow {
    id: String,
    user_id: String,
    topic_id: String,
    target_lang: String,
    native_lang: String,
    cefr_level: String,
    current_turn: i32,
    current_ai_text: String,
    status: String,
    total_turns: i32,
    retry_count: i32,
}

fn load_session(db: &DatabasePool, session_id: &str) -> Result<SessionRow, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, user_id, topic_id, target_lang, native_lang, cefr_level,
                current_turn, current_ai_text, status, total_turns, retry_count
         FROM speaking_sessions WHERE id = ?1",
        params![session_id],
        |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                user_id: row.get(1)?,
                topic_id: row.get(2)?,
                target_lang: row.get(3)?,
                native_lang: row.get(4)?,
                cefr_level: row.get(5)?,
                current_turn: row.get(6)?,
                current_ai_text: row.get(7)?,
                status: row.get(8)?,
                total_turns: row.get(9)?,
                retry_count: row.get(10)?,
            })
        },
    )
    .map_err(|_| format!("Session not found: {session_id}"))
}

fn clean_json_response(raw: &str) -> &str {
    raw.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
}

fn compute_total(scores: &SpeakingScores, used_hint: bool) -> i32 {
    if used_hint {
        let completeness = scores.relevance;
        ((scores.pronunciation as f32 * 0.5)
            + (completeness as f32 * 0.3)
            + (scores.grammar as f32 * 0.2))
            .round() as i32
    } else {
        ((scores.relevance as f32 * 0.4)
            + (scores.grammar as f32 * 0.3)
            + (scores.pronunciation as f32 * 0.3))
            .round() as i32
    }
}

async fn generate_ai_line(
    llm: &LlmClient,
    db: &DatabasePool,
    topic: &SpeakingTopic,
    target_lang: &str,
    cefr: &str,
    turn: i32,
    user_transcript: Option<&str>,
) -> Result<String, String> {
    let prompt_key = if turn == 1 {
        "speaking-opening"
    } else {
        "speaking-reply"
    };
    let target_label = llm::lang_name(target_lang);
    let total_turns = TOTAL_TURNS.to_string();
    let turn_s = turn.to_string();
    let topic_id = topic.id.to_string();
    let transcript = user_transcript.unwrap_or("").to_string();

    let vars: Vec<(&str, &str)> = if turn == 1 {
        vec![
            ("TARGET_LANG", target_label),
            ("CEFR", cefr),
            ("ROLE", topic.role),
            ("SCENE", topic.scene),
            ("TOPIC", &topic_id),
            ("TOTAL_TURNS", &total_turns),
        ]
    } else {
        vec![
            ("TARGET_LANG", target_label),
            ("CEFR", cefr),
            ("ROLE", topic.role),
            ("SCENE", topic.scene),
            ("TURN", &turn_s),
            ("TOTAL_TURNS", &total_turns),
            ("USER_TRANSCRIPT", &transcript),
        ]
    };

    let messages = build_chat_messages(db, prompt_key, &vars);
    let messages = if messages.is_empty() {
        llm::build_chat_messages_fallback(
            &format!(
                "You are a conversation partner. Reply ONLY in {target_label}. Never use English unless the target language is English. Use 1-2 short sentences."
            ),
            if turn == 1 {
                "Start the conversation naturally."
            } else {
                "Continue the conversation naturally."
            },
        )
    } else {
        messages
    };

    let reply = llm.chat(db, messages).await?;
    Ok(reply.trim().to_string())
}

pub async fn start_session(
    llm: &LlmClient,
    db: &DatabasePool,
    user_id: &str,
    topic_id: &str,
    target_lang: &str,
    native_lang: &str,
    cefr_level: &str,
) -> Result<SpeakingSessionView, String> {
    let topic = get_topic(topic_id).ok_or_else(|| format!("Unknown topic: {topic_id}"))?;
    let opening = generate_ai_line(llm, db, topic, target_lang, cefr_level, 1, None).await?;
    if opening.is_empty() {
        return Err("AI opening line was empty".to_string());
    }

    let session_id = Uuid::new_v4().to_string();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO speaking_sessions
         (id, user_id, topic_id, target_lang, native_lang, cefr_level,
          current_turn, current_ai_text, status, total_turns)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, 'active', ?8)",
        params![
            session_id,
            user_id,
            topic_id,
            target_lang,
            native_lang,
            cefr_level,
            &opening,
            TOTAL_TURNS
        ],
    )
    .map_err(|e| format!("Failed to create session: {e}"))?;

    Ok(SpeakingSessionView {
        session_id,
        topic_id: topic_id.to_string(),
        turn: 1,
        total_turns: TOTAL_TURNS,
        ai_text: opening,
        status: "active".to_string(),
    })
}

pub async fn score_turn(
    llm: &LlmClient,
    db: &DatabasePool,
    session_id: &str,
    audio_base64: &str,
    audio_format: &str,
    used_hint: bool,
) -> Result<SpeakingScoreResult, String> {
    let session = load_session(db, session_id)?;
    if session.status != "active" {
        return Err("Session is not active".to_string());
    }
    let topic = get_topic(&session.topic_id)
        .ok_or_else(|| format!("Unknown topic: {}", session.topic_id))?;

    let mm_cfg = llm::get_multimodal_config(db)?;
    let mm = mm_cfg.active()?;

    let target_label = llm::lang_name(&session.target_lang);
    let native_label = llm::lang_name(&session.native_lang);
    let score_vars = [
        ("TARGET_LANG", target_label),
        ("NATIVE_LANG", native_label),
        ("CEFR", session.cefr_level.as_str()),
        ("AI_TEXT", session.current_ai_text.as_str()),
        ("TOPIC", topic.id),
        ("TURN", &session.current_turn.to_string()),
        ("USED_HINT", if used_hint { "yes" } else { "no" }),
    ];
    let (score_sys, score_usr) = crate::modules::prompts::get_prompt(db, "speaking-score")
        .map(|p| (p.system_prompt, p.user_prompt_template))
        .unwrap_or_else(|_| {
            (
                "Score the learner's spoken reply. Output strict JSON only.".to_string(),
                String::new(),
            )
        });
    let mut user_text = score_usr;
    for (k, v) in &score_vars {
        user_text = user_text.replace(&format!("{{{{{}}}}}", k), v);
    }
    if user_text.trim().is_empty() {
        user_text = format!(
            "Transcribe and score the attached audio. AI line: \"{}\". Target language: {}. used_hint: {}",
            session.current_ai_text, target_label, used_hint
        );
    }

    let raw = llm
        .score_speaking_audio(
            mm,
            audio_base64,
            audio_format,
            &score_sys,
            &user_text,
        )
        .await?;
    let cleaned = clean_json_response(&raw);
    let mut parsed: RawScorePayload = serde_json::from_str(cleaned).map_err(|e| {
        format!("Failed to parse score JSON: {e}. Raw: {}", &raw[..raw.len().min(200)])
    })?;

    if parsed.transcript.trim().is_empty() {
        return Err("未识别到有效语音，请靠近麦克风重试".to_string());
    }

    parsed.total = compute_total(&parsed.scores, used_hint);
    parsed.pass = parsed.total >= PASS_THRESHOLD;

    let conn = db.conn()?;
    conn.execute(
        "UPDATE speaking_sessions SET retry_count = retry_count + 1 WHERE id = ?1",
        params![session_id],
    )
    .map_err(|e| format!("Failed to update retry count: {e}"))?;

    if !parsed.pass {
        return Ok(SpeakingScoreResult {
            transcript: parsed.transcript,
            scores: parsed.scores,
            total: parsed.total,
            pass: false,
            feedback: parsed.feedback,
            feedback_target: parsed.feedback_target,
            completed: false,
            turn: session.current_turn,
            next_ai_text: None,
        });
    }

    conn.execute(
        "INSERT INTO speaking_turns
         (session_id, turn_number, ai_text, user_transcript, scores_json, total_score, used_hint, attempt_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            session_id,
            session.current_turn,
            session.current_ai_text,
            parsed.transcript,
            serde_json::to_string(&parsed.scores).unwrap_or_default(),
            parsed.total,
            if used_hint { 1 } else { 0 },
            session.retry_count + 1,
        ],
    )
    .map_err(|e| format!("Failed to save turn: {e}"))?;

    let completed = session.current_turn >= session.total_turns;
    if completed {
        conn.execute(
            "UPDATE speaking_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?1",
            params![session_id],
        )
        .map_err(|e| format!("Failed to complete session: {e}"))?;
        return Ok(SpeakingScoreResult {
            transcript: parsed.transcript,
            scores: parsed.scores,
            total: parsed.total,
            pass: true,
            feedback: parsed.feedback,
            feedback_target: parsed.feedback_target,
            completed: true,
            turn: session.current_turn,
            next_ai_text: None,
        });
    }

    let next_turn = session.current_turn + 1;
    let next_ai = generate_ai_line(
        llm,
        db,
        topic,
        &session.target_lang,
        &session.cefr_level,
        next_turn,
        Some(&parsed.transcript),
    )
    .await?;

    conn.execute(
        "UPDATE speaking_sessions SET current_turn = ?1, current_ai_text = ?2 WHERE id = ?3",
        params![next_turn, next_ai, session_id],
    )
    .map_err(|e| format!("Failed to advance session: {e}"))?;

    Ok(SpeakingScoreResult {
        transcript: parsed.transcript,
        scores: parsed.scores,
        total: parsed.total,
        pass: true,
        feedback: parsed.feedback,
        feedback_target: parsed.feedback_target,
        completed: false,
        turn: next_turn,
        next_ai_text: Some(next_ai),
    })
}

pub async fn get_hint(
    llm: &LlmClient,
    db: &DatabasePool,
    session_id: &str,
) -> Result<String, String> {
    let session = load_session(db, session_id)?;
    let topic = get_topic(&session.topic_id)
        .ok_or_else(|| format!("Unknown topic: {}", session.topic_id))?;
    let target_label = llm::lang_name(&session.target_lang);
    let vars = [
        ("TARGET_LANG", target_label),
        ("CEFR", session.cefr_level.as_str()),
        ("ROLE", topic.role),
        ("SCENE", topic.scene),
        ("AI_TEXT", session.current_ai_text.as_str()),
    ];
    let messages = build_chat_messages(db, "speaking-hint", &vars);
    let messages = if messages.is_empty() {
        llm::build_chat_messages_fallback(
            &format!("Suggest one short reply sentence ONLY in {target_label}."),
            &format!("Reply to: {}", session.current_ai_text),
        )
    } else {
        messages
    };
    let hint = llm.chat(db, messages).await?;
    Ok(hint.trim().to_string())
}

pub async fn translate_ai_line(
    llm: &LlmClient,
    db: &DatabasePool,
    session_id: &str,
) -> Result<String, String> {
    let session = load_session(db, session_id)?;
    crate::modules::translation::translate_text(
        llm,
        db,
        &session.current_ai_text,
        &session.target_lang,
        &session.native_lang,
    )
    .await
}

pub async fn finish_session(
    llm: &LlmClient,
    db: &DatabasePool,
    session_id: &str,
) -> Result<String, String> {
    let session = load_session(db, session_id)?;
    let topic = get_topic(&session.topic_id)
        .ok_or_else(|| format!("Unknown topic: {}", session.topic_id))?;

    let conversation = {
        let conn = db.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT turn_number, ai_text, user_transcript, total_score, used_hint
                 FROM speaking_turns WHERE session_id = ?1 ORDER BY turn_number",
            )
            .map_err(|e| format!("Query turns failed: {e}"))?;
        let turns: Vec<String> = stmt
            .query_map(params![session_id], |row| {
                let turn: i32 = row.get(0)?;
                let ai: String = row.get(1)?;
                let user: String = row.get(2)?;
                let score: i32 = row.get(3)?;
                let hint: i32 = row.get(4)?;
                Ok(format!(
                    "Turn {turn}: AI: {ai} | User: {user} | score {score} | hint={hint}"
                ))
            })
            .map_err(|e| format!("Read turns failed: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        if turns.is_empty() {
            "No completed turns yet.".to_string()
        } else {
            turns.join("\n")
        }
    };

    if session.status != "completed" {
        let conn = db.conn()?;
        conn.execute(
            "UPDATE speaking_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?1",
            params![session_id],
        )
        .map_err(|e| format!("Failed to mark session completed: {e}"))?;
    }

    let target_label = llm::lang_name(&session.target_lang);
    let native_label = llm::lang_name(&session.native_lang);
    let vars = [
        ("TARGET_LANG", target_label),
        ("NATIVE_LANG", native_label),
        ("CEFR", session.cefr_level.as_str()),
        ("TOPIC", topic.id),
        ("CONVERSATION", conversation.as_str()),
        ("RETRY_COUNT", &session.retry_count.to_string()),
    ];
    let messages = build_chat_messages(db, "speaking-summary", &vars);
    let messages = if messages.is_empty() {
        llm::build_chat_messages_fallback(
            &format!("Summarize the speaking practice in {native_label}."),
            &conversation,
        )
    } else {
        messages
    };
    llm.chat(db, messages).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_topics_has_twelve() {
        assert_eq!(list_topics().len(), 12);
    }

    #[test]
    fn compute_total_free_weights() {
        let scores = SpeakingScores {
            relevance: 80,
            grammar: 70,
            pronunciation: 60,
        };
        assert_eq!(compute_total(&scores, false), 71);
    }

    #[test]
    fn compute_total_hint_weights() {
        let scores = SpeakingScores {
            relevance: 90,
            grammar: 70,
            pronunciation: 80,
        };
        assert_eq!(compute_total(&scores, true), 81);
    }

    #[test]
    fn prompt_uses_human_readable_target_language() {
        assert_eq!(llm::lang_name("es"), "Spanish");
        assert_eq!(llm::lang_name("zh"), "Chinese");
    }
}
