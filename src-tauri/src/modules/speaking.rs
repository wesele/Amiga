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
    pub voice: &'static str,
    pub goals: &'static [&'static str],
}

const TOPICS: &[SpeakingTopic] = &[
    SpeakingTopic {
        id: "free-talk",
        cefr: "A1",
        role: "language buddy",
        scene: "Free conversation on any topic",
        voice: "Zephyr",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "self-intro",
        cefr: "A1",
        role: "new friend",
        scene: "Meeting someone for the first time",
        voice: "Aoede",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "cafe-order",
        cefr: "A1",
        role: "barista",
        scene: "Ordering at a café",
        voice: "Puck",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "directions",
        cefr: "A1",
        role: "local passerby",
        scene: "Asking for directions on the street",
        voice: "Charon",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "shopping",
        cefr: "A2",
        role: "shop assistant",
        scene: "Buying something at a store",
        voice: "Kore",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "weather",
        cefr: "A2",
        role: "friend",
        scene: "Casual chat about the weather",
        voice: "Zephyr",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "meetup",
        cefr: "A2",
        role: "friend",
        scene: "Making plans to meet",
        voice: "Aoede",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "doctor",
        cefr: "A2",
        role: "doctor",
        scene: "Describing symptoms at a clinic",
        voice: "Charon",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "hotel",
        cefr: "A2",
        role: "hotel receptionist",
        scene: "Checking in at a hotel",
        voice: "Kore",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "work-chat",
        cefr: "B1",
        role: "colleague",
        scene: "Simple workplace conversation",
        voice: "Puck",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "opinion",
        cefr: "B1",
        role: "friend",
        scene: "Sharing opinions on a familiar topic",
        voice: "Zephyr",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "complaint",
        cefr: "B1",
        role: "customer service agent",
        scene: "Politely explaining a problem",
        voice: "Fenrir",
        goals: &["g1", "g2", "g3"],
    },
    SpeakingTopic {
        id: "interview",
        cefr: "B2",
        role: "interviewer",
        scene: "Job interview self-introduction",
        voice: "Charon",
        goals: &["g1", "g2", "g3"],
    },
];

pub fn list_topics() -> Vec<SpeakingTopic> {
    TOPICS.to_vec()
}

pub fn get_topic(id: &str) -> Option<&'static SpeakingTopic> {
    TOPICS.iter().find(|t| t.id == id)
}

/// Count the number of completed AI speaking practice sessions for a user.
pub fn get_completed_speaking_count(db: &DatabasePool, user_id: &str) -> Result<i32, String> {
    let conn = db.conn()?;
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM speaking_sessions WHERE user_id = ?1 AND status = 'completed'",
            params![user_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(count)
}

#[derive(Debug, Serialize, Clone)]
pub struct SpeakingSessionView {
    pub session_id: String,
    pub topic_id: String,
    pub turn: i32,
    pub total_turns: i32,
    pub ai_text: String,
    pub status: String,
    pub voice_name: String,
    pub goals: Vec<String>,
    pub system_instruction: String,
    pub live_model: String,
    pub live_base_url: String,
    pub live_api_key: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LiveTurnRecordInput {
    pub session_id: String,
    pub ai_text: String,
    pub user_transcript: String,
    pub relevance: i32,
    pub grammar: i32,
    pub pronunciation: i32,
    #[serde(default)]
    pub better_expression: Option<String>,
    #[serde(default)]
    pub tip_native: Option<String>,
    #[serde(default)]
    pub completed_goal_indices: Vec<i32>,
    #[serde(default)]
    pub used_hint: bool,
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
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
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

pub fn build_live_system_instruction(
    topic: &SpeakingTopic,
    target_lang: &str,
    native_lang: &str,
    cefr: &str,
) -> String {
    let target_label = llm::lang_name(target_lang);
    let native_label = llm::lang_name(native_lang);
    format!(
        "You are acting as a \"{}\" in the scenario: \"{}\".\n\
        You are conversing with a language learner in Gemini 3.8 Live mode.\n\n\
        ### Core Conversation Guidelines:\n\
        1. Speak primarily in {} adapted to CEFR level {} (short, clear sentences, natural conversational pace, 1-2 sentences per turn).\n\
        2. Keep the dialogue engaging, interactive, and responsive to the scenario.\n\n\
        ### Comfort & Code-Switching Scaffolding:\n\
        - If the learner speaks in {} (their native language), mixes languages, hesitates, or asks how to say something in {}, warmly help them with the natural {} phrase, invite them to try saying it, or smoothly continue the roleplay without ever making them feel judged.\n\
        - Never scold or strictly penalize the learner for using {}.\n\n\
        ### Silent Background Coaching Tool:\n\
        - After each meaningful learner turn in {}, invoke the non-blocking tool `report_turn_and_progress` in the background with:\n\
          * `grammar_score`: integer 0-100\n\
          * `relevance_score`: integer 0-100\n\
          * `pronunciation_score`: integer 0-100\n\
          * `better_expression`: a more idiomatic or corrected way to say what the learner just said in {}, or empty string if already natural\n\
          * `tip_native`: a brief, encouraging 1-sentence tip in {}\n\
          * `completed_goal_indices`: array of indices (0, 1, or 2) of micro-goals completed so far\n\
        - Never read numeric scores aloud or mention the background tool in spoken audio.",
        topic.role,
        topic.scene,
        target_label,
        cefr,
        native_label,
        target_label,
        target_label,
        native_label,
        target_label,
        target_label,
        native_label
    )
}

fn default_opening_line(topic_id: &str, target_lang: &str) -> String {
    let lang = target_lang
        .split('-')
        .next()
        .unwrap_or(target_lang)
        .to_lowercase();
    match (topic_id, lang.as_str()) {
        ("free-talk", "es") => "¡Hola! ¿De qué te gustaría hablar hoy?".to_string(),
        ("free-talk", "zh") => "你好！今天你想聊点什么呢？".to_string(),
        ("free-talk", _) => "Hi there! What would you like to talk about today?".to_string(),

        ("self-intro", "es") => "¡Hola! Mucho gusto en conocerte, ¿cómo te llamas?".to_string(),
        ("self-intro", "zh") => "你好！很高兴认识你，你叫什么名字？".to_string(),
        ("self-intro", _) => "Hello! Nice to meet you, what is your name?".to_string(),

        ("cafe-order", "es") => "¡Buenos días! ¿Qué le gustaría tomar hoy?".to_string(),
        ("cafe-order", "zh") => "您好！今天想喝点什么？".to_string(),
        ("cafe-order", _) => "Good morning! What can I get for you today?".to_string(),

        ("directions", "es") => "¡Hola! ¿Necesitas ayuda para encontrar algún lugar?".to_string(),
        ("directions", "zh") => "你好！需要我帮你指路吗？".to_string(),
        ("directions", _) => "Hello! Can I help you find somewhere?".to_string(),

        ("shopping", "es") => "¡Hola! ¿En qué puedo ayudarte hoy?".to_string(),
        ("shopping", "zh") => "你好！请问有什么可以帮您的？".to_string(),
        ("shopping", _) => "Hello! Looking for anything in particular today?".to_string(),

        ("weather", "es") => "¡Hola! Hace un día interesante hoy, ¿no crees?".to_string(),
        ("weather", "zh") => "嗨！今天天气挺不错的，对吧？".to_string(),
        ("weather", _) => "Hey! The weather is really something today, isn't it?".to_string(),

        ("meetup", "es") => {
            "¡Hola! Qué bueno verte, ¿hacemos algún plan para el fin de semana?".to_string()
        }
        ("meetup", "zh") => "嗨！见到你真好，周末有什么打算吗？".to_string(),
        ("meetup", _) => {
            "Hey! Great to see you, should we plan something for the weekend?".to_string()
        }

        ("doctor", "es") => "Buenos días, cuéntame, ¿qué síntomas tienes?".to_string(),
        ("doctor", "zh") => "您好，请问您哪里感觉不舒服？".to_string(),
        ("doctor", _) => {
            "Hello, please tell me what symptoms you have been experiencing.".to_string()
        }

        ("hotel", "es") => {
            "¡Buenas tardes! Bienvenido a nuestro hotel, ¿tiene una reserva?".to_string()
        }
        ("hotel", "zh") => "您好！欢迎光临，请问您有预订吗？".to_string(),
        ("hotel", _) => {
            "Good afternoon! Welcome to our hotel, do you have a reservation?".to_string()
        }

        ("work-chat", "es") => "¡Hola! ¿Cómo va todo con los proyectos de esta semana?".to_string(),
        ("work-chat", "zh") => "嗨！这周的工作进展怎么样？".to_string(),
        ("work-chat", _) => {
            "Hi there! How are things coming along with the project this week?".to_string()
        }

        ("opinion", "es") => {
            "¿Qué opinas sobre este tema? Me interesa saber tu punto de vista.".to_string()
        }
        ("opinion", "zh") => "你对这个怎么看？我很想听听你的想法。".to_string(),
        ("opinion", _) => {
            "What do you think about this? I'd love to hear your perspective.".to_string()
        }

        ("complaint", "es") => {
            "Buenos días, lamento el inconveniente, ¿podría explicarme el problema?".to_string()
        }
        ("complaint", "zh") => "您好，非常抱歉给您带来不便，请问遇到了什么问题？".to_string(),
        ("complaint", _) => {
            "Hello, I apologize for the inconvenience, could you explain the issue to me?"
                .to_string()
        }

        ("interview", "es") => {
            "Bienvenido a la entrevista. Para empezar, ¿podrías presentarte brevemente?".to_string()
        }
        ("interview", "zh") => "欢迎参加面试。首先，请您简单做个自我介绍吧。".to_string(),
        ("interview", _) => {
            "Welcome to the interview. To start, could you introduce yourself briefly?".to_string()
        }

        (_, "es") => "¡Hola! ¿Cómo estás hoy?".to_string(),
        (_, "zh") => "你好！今天怎么样？".to_string(),
        (_, _) => "Hello! How are you doing today?".to_string(),
    }
}

pub async fn start_session(
    _llm: &LlmClient,
    db: &DatabasePool,
    user_id: &str,
    topic_id: &str,
    target_lang: &str,
    native_lang: &str,
    cefr_level: &str,
) -> Result<SpeakingSessionView, String> {
    let topic = get_topic(topic_id).ok_or_else(|| format!("Unknown topic: {topic_id}"))?;
    let opening = default_opening_line(topic_id, target_lang);

    let mm_cfg = llm::get_multimodal_config(db)?;
    let active_cfg = mm_cfg.active().unwrap_or(&mm_cfg.builtin);
    let live_model = active_cfg.model.clone();
    let live_base_url = active_cfg.base_url.clone();
    let live_api_key = active_cfg.api_key.clone();

    let voice_name = topic.voice.to_string();
    let goals: Vec<String> = topic.goals.iter().map(|s| s.to_string()).collect();
    let system_instruction =
        build_live_system_instruction(topic, target_lang, native_lang, cefr_level);

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
        voice_name,
        goals,
        system_instruction,
        live_model,
        live_base_url,
        live_api_key,
    })
}

pub fn record_live_turn(db: &DatabasePool, input: &LiveTurnRecordInput) -> Result<i32, String> {
    let session = load_session(db, &input.session_id)?;
    if session.status != "active" {
        return Err("Session is not active".to_string());
    }

    let scores = SpeakingScores {
        relevance: input.relevance,
        grammar: input.grammar,
        pronunciation: input.pronunciation,
    };
    let total_score = compute_total(&scores, input.used_hint);

    let scores_json = serde_json::json!({
        "relevance": input.relevance,
        "grammar": input.grammar,
        "pronunciation": input.pronunciation,
        "better_expression": input.better_expression,
        "tip_native": input.tip_native,
        "completed_goal_indices": input.completed_goal_indices,
    });
    let scores_json_str = serde_json::to_string(&scores_json).unwrap_or_else(|_| "{}".to_string());

    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO speaking_turns
         (session_id, turn_number, ai_text, user_transcript, scores_json, total_score, used_hint, attempt_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.session_id,
            session.current_turn,
            input.ai_text,
            input.user_transcript,
            scores_json_str,
            total_score,
            if input.used_hint { 1 } else { 0 },
            1,
        ],
    )
    .map_err(|e| format!("Failed to save live turn: {e}"))?;

    let next_turn = session.current_turn + 1;
    conn.execute(
        "UPDATE speaking_sessions SET current_turn = ?1, current_ai_text = ?2 WHERE id = ?3",
        params![next_turn, input.ai_text, input.session_id],
    )
    .map_err(|e| format!("Failed to advance session: {e}"))?;

    Ok(next_turn)
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
        .score_speaking_audio(mm, audio_base64, audio_format, &score_sys, &user_text)
        .await?;
    let cleaned = clean_json_response(&raw);
    let mut parsed: RawScorePayload = serde_json::from_str(cleaned).map_err(|e| {
        format!(
            "Failed to parse score JSON: {e}. Raw: {}",
            &raw[..raw.len().min(200)]
        )
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
    text_override: Option<String>,
) -> Result<String, String> {
    let session = load_session(db, session_id)?;
    let topic = get_topic(&session.topic_id)
        .ok_or_else(|| format!("Unknown topic: {}", session.topic_id))?;
    let target_label = llm::lang_name(&session.target_lang);
    let ai_text = match text_override.as_deref().map(str::trim) {
        Some(t) if !t.is_empty() => {
            let conn = db.conn()?;
            let _ = conn.execute(
                "UPDATE speaking_sessions SET current_ai_text = ?1 WHERE id = ?2",
                params![t, session_id],
            );
            t.to_string()
        }
        _ => session.current_ai_text,
    };
    let vars = [
        ("TARGET_LANG", target_label),
        ("CEFR", session.cefr_level.as_str()),
        ("ROLE", topic.role),
        ("SCENE", topic.scene),
        ("AI_TEXT", ai_text.as_str()),
    ];
    let messages = build_chat_messages(db, "speaking-hint", &vars);
    let messages = if messages.is_empty() {
        llm::build_chat_messages_fallback(
            &format!("Suggest one short reply sentence ONLY in {target_label}."),
            &format!("Reply to: {}", ai_text),
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
    text_override: Option<String>,
) -> Result<String, String> {
    let session = load_session(db, session_id)?;
    let ai_text = match text_override.as_deref().map(str::trim) {
        Some(t) if !t.is_empty() => {
            let conn = db.conn()?;
            let _ = conn.execute(
                "UPDATE speaking_sessions SET current_ai_text = ?1 WHERE id = ?2",
                params![t, session_id],
            );
            t.to_string()
        }
        _ => session.current_ai_text,
    };
    crate::modules::translation::translate_text(
        llm,
        db,
        &ai_text,
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

    struct TurnData {
        turn: i32,
        ai: String,
        user: String,
        score: i32,
        hint: i32,
        better_expression: Option<String>,
        tip_native: Option<String>,
    }

    let turns: Vec<TurnData> = {
        let conn = db.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT turn_number, ai_text, user_transcript, total_score, used_hint, scores_json
                 FROM speaking_turns WHERE session_id = ?1 ORDER BY turn_number",
            )
            .map_err(|e| format!("Query turns failed: {e}"))?;
        let items: Vec<TurnData> = stmt
            .query_map(params![session_id], |row| {
                let turn: i32 = row.get(0)?;
                let ai: String = row.get(1)?;
                let user: String = row.get(2)?;
                let score: i32 = row.get(3)?;
                let hint: i32 = row.get(4)?;
                let scores_raw: String = row.get(5)?;
                let parsed: Option<serde_json::Value> = serde_json::from_str(&scores_raw).ok();
                let better_expression = parsed.as_ref().and_then(|v| {
                    v.get("better_expression")
                        .and_then(|s| s.as_str())
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                });
                let tip_native = parsed.as_ref().and_then(|v| {
                    v.get("tip_native")
                        .and_then(|s| s.as_str())
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                });
                Ok(TurnData {
                    turn,
                    ai,
                    user,
                    score,
                    hint,
                    better_expression,
                    tip_native,
                })
            })
            .map_err(|e| format!("Read turns failed: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
        items
    };

    if session.status != "completed" {
        let conn = db.conn()?;
        conn.execute(
            "UPDATE speaking_sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?1",
            params![session_id],
        )
        .map_err(|e| format!("Failed to mark session completed: {e}"))?;
    }

    let conversation = if turns.is_empty() {
        "No completed turns yet.".to_string()
    } else {
        turns
            .iter()
            .map(|t| {
                format!(
                    "Turn {}: AI: {} | User: {} | score {} | hint={}",
                    t.turn, t.ai, t.user, t.score, t.hint
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };

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

    match llm.chat(db, messages).await {
        Ok(reply) if !reply.trim().is_empty() => Ok(reply),
        _ => {
            let count = turns.len();
            let total_score_sum: i32 = turns.iter().map(|t| t.score).sum();
            let avg_score = if count > 0 {
                total_score_sum / (count as i32)
            } else {
                0
            };

            let is_zh = session.native_lang.to_lowercase().starts_with("zh");
            let is_es = session.native_lang.to_lowercase().starts_with("es");

            let mut summary = if is_zh {
                format!(
                    "🎉 口语练习完成！\n\n共完成 {} 轮对话，平均得分：{} 分。\n",
                    count, avg_score
                )
            } else if is_es {
                format!(
                    "🎉 ¡Práctica de conversación completada!\n\nTotal de turnos: {}, puntuación media: {}.\n",
                    count, avg_score
                )
            } else {
                format!(
                    "🎉 Speaking practice completed!\n\nCompleted {} turns with an average score of {}.\n",
                    count, avg_score
                )
            };

            let mut tips = Vec::new();
            for t in &turns {
                if let (Some(b), Some(tip)) = (&t.better_expression, &t.tip_native) {
                    tips.push(format!("第 {} 轮：更好表达「{}」— {}", t.turn, b, tip));
                } else if let Some(b) = &t.better_expression {
                    tips.push(format!("第 {} 轮：建议表达「{}」", t.turn, b));
                } else if let Some(tip) = &t.tip_native {
                    tips.push(format!("第 {} 轮：{}", t.turn, tip));
                }
            }

            if !tips.is_empty() {
                if is_zh {
                    summary.push_str("\n💡 表达提升与建议：\n");
                } else if is_es {
                    summary.push_str("\n💡 Sugerencias y expresiones:\n");
                } else {
                    summary.push_str("\n💡 Suggestions & Expressions:\n");
                }
                for tip in tips {
                    summary.push_str(&format!("• {}\n", tip));
                }
            }

            Ok(summary)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_topics_has_thirteen() {
        assert_eq!(list_topics().len(), 13);
        assert_eq!(list_topics()[0].id, "free-talk");
    }

    #[test]
    fn test_build_live_system_instruction() {
        let topic = get_topic("free-talk").unwrap();
        let prompt = build_live_system_instruction(topic, "es", "zh", "A1");
        assert!(prompt.contains("Spanish"));
        assert!(prompt.contains("Chinese"));
        assert!(prompt.contains("report_turn_and_progress"));
    }

    #[tokio::test]
    async fn test_record_live_turn() {
        let db = DatabasePool::new_in_memory();
        let llm = LlmClient::new();
        let session = start_session(&llm, &db, "user-1", "cafe-order", "es", "zh", "A1")
            .await
            .expect("session start should succeed");
        assert_eq!(session.turn, 1);
        assert!(!session.live_model.is_empty());
        assert_eq!(session.voice_name, "Puck");

        let input = LiveTurnRecordInput {
            session_id: session.session_id.clone(),
            ai_text: "¡Buenos días! ¿Qué le gustaría tomar hoy?".to_string(),
            user_transcript: "Quisiera un café con leche por favor.".to_string(),
            relevance: 95,
            grammar: 90,
            pronunciation: 85,
            better_expression: Some("Un café con leche, por favor.".to_string()),
            tip_native: Some("发音很标准，注意 por favor 的语调！".to_string()),
            completed_goal_indices: vec![0],
            used_hint: false,
        };
        let next_turn = record_live_turn(&db, &input).expect("record live turn should succeed");
        assert_eq!(next_turn, 2);

        let summary = finish_session(&llm, &db, &session.session_id)
            .await
            .expect("finish_session should succeed");
        assert!(!summary.trim().is_empty());

        // Test fallback branch when LLM is unavailable:
        crate::modules::llm::save_llm_setting(&db, "llm_mode", "custom").unwrap();
        crate::modules::llm::save_llm_setting(&db, "primary_base_url", "http://127.0.0.1:9")
            .unwrap();
        crate::modules::llm::save_llm_setting(&db, "primary_api_key", "dummy").unwrap();
        crate::modules::llm::save_llm_setting(&db, "primary_model", "dummy").unwrap();

        let fallback_summary = finish_session(&llm, &db, &session.session_id)
            .await
            .expect("finish_session should succeed with local fallback");
        assert!(fallback_summary.contains("口语练习完成"));
        assert!(fallback_summary.contains("1 轮"));
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
