use crate::modules::database::DatabasePool;
use crate::modules::llm::{self, ChatMessage, LlmClient};
use chrono::Local;
use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SoulMateWorld {
    pub id: String,
    pub user_id: String,
    pub companion_type: String,
    pub companion_name: String,
    pub companion_gender: String,
    pub personality: String,
    pub story_location: String,
    pub intensity: i32,
    pub romance_tension: i32,
    pub surprise: i32,
    pub knowledge: i32,
    pub target_lang: String,
    pub native_lang: String,
    pub cefr_level: String,
    pub relationship_stage: String,
    pub story_summary: String,
    pub memory_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulMateEpisode {
    pub id: String,
    pub world_id: String,
    pub story_date: String,
    pub day_number: i32,
    pub title: String,
    pub teaser: String,
    pub body: String,
    pub status: String,
    pub read_position: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulMateMessage {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoulMateHome {
    pub initialized: bool,
    pub world: Option<SoulMateWorld>,
    pub greeting: String,
    pub state: String,
    pub episode_id: Option<String>,
    pub day_number: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeSoulMateRequest {
    pub user_id: String,
    pub companion_type: String,
    pub companion_name: String,
    pub companion_gender: String,
    pub personality: String,
    pub story_location: String,
    pub intensity: i32,
    pub romance_tension: i32,
    pub surprise: i32,
    pub knowledge: i32,
    pub target_lang: String,
    pub native_lang: String,
    pub cefr_level: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedStory {
    title: String,
    teaser: String,
    body: String,
}

fn today() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn world_from_row(row: &Row<'_>) -> rusqlite::Result<SoulMateWorld> {
    Ok(SoulMateWorld {
        id: row.get(0)?,
        user_id: row.get(1)?,
        companion_type: row.get(2)?,
        companion_name: row.get(3)?,
        companion_gender: row.get(4)?,
        personality: row.get(5)?,
        story_location: row.get(6)?,
        intensity: row.get(7)?,
        romance_tension: row.get(8)?,
        surprise: row.get(9)?,
        knowledge: row.get(10)?,
        target_lang: row.get(11)?,
        native_lang: row.get(12)?,
        cefr_level: row.get(13)?,
        relationship_stage: row.get(14)?,
        story_summary: row.get(15)?,
        memory_summary: row.get(16)?,
    })
}

fn episode_from_row(row: &Row<'_>) -> rusqlite::Result<SoulMateEpisode> {
    Ok(SoulMateEpisode {
        id: row.get(0)?,
        world_id: row.get(1)?,
        story_date: row.get(2)?,
        day_number: row.get(3)?,
        title: row.get(4)?,
        teaser: row.get(5)?,
        body: row.get(6)?,
        status: row.get(7)?,
        read_position: row.get(8)?,
    })
}

fn get_world_optional(db: &DatabasePool, user_id: &str) -> Result<Option<SoulMateWorld>, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, user_id, companion_type, companion_name, companion_gender,
                personality, story_location, intensity, romance_tension, surprise,
                knowledge, target_lang, native_lang, cefr_level, relationship_stage,
                story_summary, memory_summary
         FROM soulmate_worlds WHERE user_id = ?1",
        params![user_id],
        world_from_row,
    )
    .optional()
    .map_err(|e| format!("Failed to query Soul Mate: {e}"))
}

fn get_episode_for_date(
    db: &DatabasePool,
    world_id: &str,
    story_date: &str,
) -> Result<Option<SoulMateEpisode>, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, world_id, story_date, day_number, title, teaser, body, status, read_position
         FROM soulmate_episodes WHERE world_id = ?1 AND story_date = ?2",
        params![world_id, story_date],
        episode_from_row,
    )
    .optional()
    .map_err(|e| format!("Failed to query today's Soul Mate story: {e}"))
}

pub fn get_episode(db: &DatabasePool, episode_id: &str) -> Result<SoulMateEpisode, String> {
    let conn = db.conn()?;
    conn.query_row(
        "SELECT id, world_id, story_date, day_number, title, teaser, body, status, read_position
         FROM soulmate_episodes WHERE id = ?1",
        params![episode_id],
        episode_from_row,
    )
    .map_err(|e| format!("Soul Mate story not found: {e}"))
}

fn validate_request(request: &InitializeSoulMateRequest) -> Result<(), String> {
    if request.user_id.trim().is_empty() {
        return Err("Missing user".to_string());
    }
    if !matches!(
        request.companion_type.as_str(),
        "soul" | "comfort" | "explore"
    ) {
        return Err("Invalid Soul Mate type".to_string());
    }
    if request.companion_name.trim().is_empty() || request.companion_name.chars().count() > 24 {
        return Err("Soul Mate name must contain 1-24 characters".to_string());
    }
    if request.target_lang.trim().is_empty() || request.native_lang.trim().is_empty() {
        return Err("Missing language settings".to_string());
    }
    for value in [
        request.intensity,
        request.romance_tension,
        request.surprise,
        request.knowledge,
    ] {
        if !(0..=3).contains(&value) {
            return Err("Story preference must be between 0 and 3".to_string());
        }
    }
    Ok(())
}

pub fn initialize(
    db: &DatabasePool,
    request: &InitializeSoulMateRequest,
) -> Result<SoulMateWorld, String> {
    validate_request(request)?;
    let world_id = Uuid::new_v4().to_string();
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO soulmate_worlds (
            id, user_id, companion_type, companion_name, companion_gender, personality,
            story_location, intensity, romance_tension, surprise, knowledge,
            target_lang, native_lang, cefr_level
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(user_id) DO UPDATE SET
            companion_type = excluded.companion_type,
            companion_name = excluded.companion_name,
            companion_gender = excluded.companion_gender,
            personality = excluded.personality,
            story_location = excluded.story_location,
            intensity = excluded.intensity,
            romance_tension = excluded.romance_tension,
            surprise = excluded.surprise,
            knowledge = excluded.knowledge,
            target_lang = excluded.target_lang,
            native_lang = excluded.native_lang,
            cefr_level = excluded.cefr_level,
            updated_at = datetime('now')",
        params![
            world_id,
            request.user_id,
            request.companion_type,
            request.companion_name.trim(),
            request.companion_gender,
            request.personality,
            request.story_location,
            request.intensity,
            request.romance_tension,
            request.surprise,
            request.knowledge,
            request.target_lang,
            request.native_lang,
            request.cefr_level,
        ],
    )
    .map_err(|e| format!("Failed to initialize Soul Mate: {e}"))?;
    drop(conn);
    get_world_optional(db, &request.user_id)?.ok_or_else(|| "Soul Mate was not saved".to_string())
}

fn home_state(db: &DatabasePool, episode: Option<&SoulMateEpisode>) -> Result<String, String> {
    let Some(episode) = episode else {
        return Ok("story_available".to_string());
    };
    if episode.status != "read" {
        return Ok("story_in_progress".to_string());
    }
    let conn = db.conn()?;
    let count: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM soulmate_messages WHERE episode_id = ?1",
            params![episode.id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    Ok(if count > 0 {
        "chat_started".to_string()
    } else {
        "story_read".to_string()
    })
}

fn fallback_greeting(world: &SoulMateWorld, state: &str) -> String {
    match (world.target_lang.as_str(), state) {
        ("es", "story_available") => {
            "Hola. Te estaba esperando. Hoy tengo algo inesperado que contarte.".to_string()
        }
        ("es", "story_in_progress") => {
            "Nuestra historia todavía no ha terminado. ¿Seguimos?".to_string()
        }
        ("es", "story_read") => "Ahora quiero saber qué piensas de lo que pasó.".to_string(),
        ("es", _) => "Me alegra que hayas vuelto. ¿Seguimos hablando?".to_string(),
        ("en", "story_available") => {
            "I was waiting for you. Something unexpected happened today.".to_string()
        }
        ("en", "story_in_progress") => "Our story is not over yet. Shall we continue?".to_string(),
        ("en", "story_read") => "Now I really want to know what you think happened.".to_string(),
        ("en", _) => "I'm glad you're back. Shall we keep talking?".to_string(),
        (_, "story_available") => format!(
            "{}一直在等你，今天有件意想不到的事想告诉你。",
            world.companion_name
        ),
        (_, "story_in_progress") => "我们的故事还没有讲完，要继续吗？".to_string(),
        (_, "story_read") => "故事讲完了，现在我想听听你的想法。".to_string(),
        _ => "你回来啦，我们继续聊聊吧。".to_string(),
    }
}

async fn generate_greeting(
    llm: &LlmClient,
    db: &DatabasePool,
    world: &SoulMateWorld,
    state: &str,
    episode: Option<&SoulMateEpisode>,
) -> String {
    let latest = episode
        .map(|e| format!("{} — {}", e.title, e.teaser))
        .unwrap_or_else(|| "No story has been generated today".to_string());
    let vars = [
        ("NAME", world.companion_name.as_str()),
        ("TYPE", world.companion_type.as_str()),
        ("PERSONALITY", world.personality.as_str()),
        ("TARGET_LANG", llm::lang_name(&world.target_lang)),
        ("CEFR", world.cefr_level.as_str()),
        ("STATE", state),
        ("LATEST_STORY", latest.as_str()),
        ("STORY_SUMMARY", world.story_summary.as_str()),
        ("MEMORY_SUMMARY", world.memory_summary.as_str()),
    ];
    let mut messages = llm::build_chat_messages(db, "soulmate-greeting", &vars);
    if messages.is_empty() {
        messages = llm::build_chat_messages_fallback(
            "You are a fictional AI companion in a language-learning app.",
            &format!(
                "As {}, greet the learner in {} at CEFR {} level. State: {}. Reply with one short natural sentence only.",
                world.companion_name,
                llm::lang_name(&world.target_lang),
                world.cefr_level,
                state
            ),
        );
    }
    match llm.chat_with_limits(db, messages, 160, 30).await {
        Ok(text) if !text.trim().is_empty() => clean_plain_text(&text),
        Ok(_) | Err(_) => fallback_greeting(world, state),
    }
}

pub async fn get_home(
    llm: &LlmClient,
    db: &DatabasePool,
    user_id: &str,
) -> Result<SoulMateHome, String> {
    let Some(world) = get_world_optional(db, user_id)? else {
        return Ok(SoulMateHome {
            initialized: false,
            world: None,
            greeting: String::new(),
            state: "uninitialized".to_string(),
            episode_id: None,
            day_number: 0,
        });
    };
    let episode = get_episode_for_date(db, &world.id, &today())?;
    let state = home_state(db, episode.as_ref())?;
    let greeting = generate_greeting(llm, db, &world, &state, episode.as_ref()).await;
    Ok(SoulMateHome {
        initialized: true,
        world: Some(world),
        greeting,
        state,
        episode_id: episode.as_ref().map(|e| e.id.clone()),
        day_number: episode.as_ref().map(|e| e.day_number).unwrap_or(0),
    })
}

fn parse_generated_story(raw: &str) -> Result<GeneratedStory, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let start = cleaned
        .find('{')
        .ok_or_else(|| "Story response has no JSON".to_string())?;
    let end = cleaned
        .rfind('}')
        .ok_or_else(|| "Story response is incomplete".to_string())?;
    let story: GeneratedStory = serde_json::from_str(&cleaned[start..=end])
        .map_err(|e| format!("Failed to parse story JSON: {e}"))?;
    if story.title.trim().is_empty() || story.body.trim().chars().count() < 60 {
        return Err("Generated story is empty or too short".to_string());
    }
    Ok(story)
}

fn fallback_story(world: &SoulMateWorld, day_number: i32) -> GeneratedStory {
    match world.target_lang.as_str() {
        "es" => GeneratedStory {
            title: "La llave sin puerta".to_string(),
            teaser: "Una llave antigua lleva tu nombre, pero no abre ninguna puerta conocida.".to_string(),
            body: format!(
                "Hoy, {} te espera en una cafetería pequeña de {}. Sobre la mesa hay una llave antigua y una nota con tu nombre. Nadie sabe quién la dejó allí. {} cuenta que, en algunas ciudades españolas, las llaves antiguas se regalaban como símbolo de confianza. De pronto, el camarero mira la llave y deja caer una taza. Dice que vio otra igual en una estación cerrada hace veinte años. {} sonríe, acerca la nota y te pregunta: «¿Buscamos la estación juntos esta noche?» La lluvia empieza a golpear las ventanas. En el reverso de la nota aparece una hora: 23:17. Es el día {} de vuestra historia, y por primera vez parece que alguien más conoce vuestro secreto.",
                world.companion_name, world.story_location, world.companion_name, world.companion_name, day_number
            ),
        },
        "en" => GeneratedStory {
            title: "The Key Without a Door".to_string(),
            teaser: "An old key carries your name, but it opens no known door.".to_string(),
            body: format!(
                "Today, {} waits for you in a small café in {}. An old key and a note with your name lie on the table. Nobody knows who left them. {} explains that old keys were sometimes given as symbols of trust. Suddenly, the waiter sees the key and drops a cup. He says he saw another one at a station that closed twenty years ago. {} moves the note closer and asks, “Should we look for the station together tonight?” Rain begins to hit the windows. On the back of the note there is one time: 23:17. It is day {} of your story, and for the first time it seems that someone else knows your secret.",
                world.companion_name, world.story_location, world.companion_name, world.companion_name, day_number
            ),
        },
        _ => GeneratedStory {
            title: "没有门的钥匙".to_string(),
            teaser: "一把写着你名字的旧钥匙，却打不开任何已知的门。".to_string(),
            body: format!(
                "今天，{}在{}的一间小咖啡馆等你。桌上放着一把旧钥匙，还有一张写着你名字的纸条，没有人知道是谁留下的。{}告诉你，在一些古老城市里，钥匙曾经代表信任。服务员看到它时突然失手打碎了杯子，因为他曾在一座关闭二十年的车站见过同样的钥匙。{}把纸条推到你面前，问你今晚是否愿意一起寻找那座车站。窗外开始下雨，纸条背面只写着一个时间：23:17。这是你们故事的第{}天，而现在似乎还有另一个人知道这个秘密。",
                world.companion_name, world.story_location, world.companion_name, world.companion_name, day_number
            ),
        },
    }
}

pub async fn generate_today_episode(
    llm: &LlmClient,
    db: &DatabasePool,
    user_id: &str,
) -> Result<SoulMateEpisode, String> {
    let world = get_world_optional(db, user_id)?
        .ok_or_else(|| "Soul Mate is not initialized".to_string())?;
    let story_date = today();
    if let Some(existing) = get_episode_for_date(db, &world.id, &story_date)? {
        return Ok(existing);
    }
    let conn = db.conn()?;
    let day_number: i32 = conn
        .query_row(
            "SELECT COUNT(*) + 1 FROM soulmate_episodes WHERE world_id = ?1",
            params![world.id],
            |row| row.get(0),
        )
        .unwrap_or(1);
    drop(conn);

    let vars = [
        ("NAME", world.companion_name.as_str()),
        ("TYPE", world.companion_type.as_str()),
        ("PERSONALITY", world.personality.as_str()),
        ("LOCATION", world.story_location.as_str()),
        ("TARGET_LANG", llm::lang_name(&world.target_lang)),
        ("CEFR", world.cefr_level.as_str()),
        ("DAY", &day_number.to_string()),
        ("INTENSITY", &world.intensity.to_string()),
        ("ROMANCE", &world.romance_tension.to_string()),
        ("SURPRISE", &world.surprise.to_string()),
        ("KNOWLEDGE", &world.knowledge.to_string()),
        ("STORY_SUMMARY", world.story_summary.as_str()),
        ("MEMORY_SUMMARY", world.memory_summary.as_str()),
    ];
    let mut messages = llm::build_chat_messages(db, "soulmate-story", &vars);
    if messages.is_empty() {
        messages = llm::build_chat_messages_fallback(
            "You write serialized fiction for language learners and output strict JSON only.",
            &format!(
                "Write day {} in {} at CEFR {}. Companion: {}. Use suspense, a safe romantic spark, a surprise, and one natural cultural fact. Return JSON with title, teaser, body.",
                day_number,
                llm::lang_name(&world.target_lang),
                world.cefr_level,
                world.companion_name
            ),
        );
    }
    let generated = match llm.chat_for_reading_content(db, messages).await {
        Ok(raw) => {
            parse_generated_story(&raw).unwrap_or_else(|_| fallback_story(&world, day_number))
        }
        Err(_) => fallback_story(&world, day_number),
    };

    let episode_id = Uuid::new_v4().to_string();
    let conn = db.conn()?;
    let inserted = conn
        .execute(
            "INSERT OR IGNORE INTO soulmate_episodes
         (id, world_id, story_date, day_number, title, teaser, body, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'reading')",
            params![
                episode_id,
                world.id,
                story_date,
                day_number,
                generated.title.trim(),
                generated.teaser.trim(),
                generated.body.trim(),
            ],
        )
        .map_err(|e| format!("Failed to save today's Soul Mate story: {e}"))?;
    drop(conn);
    if inserted == 0 {
        return get_episode_for_date(db, &world.id, &story_date)?
            .ok_or_else(|| "Today's story could not be loaded".to_string());
    }
    get_episode(db, &episode_id)
}

pub fn mark_story_read(db: &DatabasePool, episode_id: &str) -> Result<SoulMateEpisode, String> {
    let episode = get_episode(db, episode_id)?;
    if episode.status == "read" {
        return Ok(episode);
    }
    let relationship_stage = match episode.day_number {
        0..=2 => "new",
        3..=6 => "familiar",
        7..=13 => "trusted",
        _ => "bonded",
    };
    let summary_line = format!(
        "Day {}: {} — {}\n",
        episode.day_number, episode.title, episode.teaser
    );
    let conn = db.conn()?;
    conn.execute(
        "UPDATE soulmate_episodes
         SET status = 'read', read_position = 100, read_at = datetime('now')
         WHERE id = ?1",
        params![episode_id],
    )
    .map_err(|e| format!("Failed to finish Soul Mate story: {e}"))?;
    conn.execute(
        "UPDATE soulmate_worlds
         SET story_summary = story_summary || ?1,
             relationship_stage = ?2,
             updated_at = datetime('now')
         WHERE id = ?3",
        params![summary_line, relationship_stage, episode.world_id],
    )
    .map_err(|e| format!("Failed to update Soul Mate history: {e}"))?;
    drop(conn);
    get_episode(db, episode_id)
}

fn get_messages(db: &DatabasePool, episode_id: &str) -> Result<Vec<SoulMateMessage>, String> {
    let conn = db.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, role, content, created_at FROM soulmate_messages
             WHERE episode_id = ?1 ORDER BY id ASC",
        )
        .map_err(|e| format!("Failed to prepare Soul Mate chat: {e}"))?;
    let rows = stmt
        .query_map(params![episode_id], |row| {
            Ok(SoulMateMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query Soul Mate chat: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read Soul Mate chat: {e}"))?;
    Ok(rows)
}

fn save_message(
    db: &DatabasePool,
    world_id: &str,
    episode_id: &str,
    role: &str,
    content: &str,
) -> Result<SoulMateMessage, String> {
    let conn = db.conn()?;
    conn.execute(
        "INSERT INTO soulmate_messages (world_id, episode_id, role, content)
         VALUES (?1, ?2, ?3, ?4)",
        params![world_id, episode_id, role, content],
    )
    .map_err(|e| format!("Failed to save Soul Mate message: {e}"))?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, role, content, created_at FROM soulmate_messages WHERE id = ?1",
        params![id],
        |row| {
            Ok(SoulMateMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    )
    .map_err(|e| format!("Failed to reload Soul Mate message: {e}"))
}

fn fallback_opening(world: &SoulMateWorld, episode: &SoulMateEpisode) -> String {
    match world.target_lang.as_str() {
        "es" => "Ahora que conoces la historia, dime: ¿qué harías tú con esa pista?".to_string(),
        "en" => {
            "Now that you know the story, tell me: what would you do with that clue?".to_string()
        }
        _ => format!("故事讲完了。关于“{}”，你会怎么选择？", episode.title),
    }
}

async fn generate_chat_opening(
    llm: &LlmClient,
    db: &DatabasePool,
    world: &SoulMateWorld,
    episode: &SoulMateEpisode,
) -> String {
    let vars = [
        ("NAME", world.companion_name.as_str()),
        ("TYPE", world.companion_type.as_str()),
        ("TARGET_LANG", llm::lang_name(&world.target_lang)),
        ("CEFR", world.cefr_level.as_str()),
        ("TITLE", episode.title.as_str()),
        ("STORY", episode.body.as_str()),
    ];
    let messages = llm::build_chat_messages(db, "soulmate-chat-opening", &vars);
    match llm.chat_with_limits(db, messages, 220, 45).await {
        Ok(text) if !text.trim().is_empty() => clean_plain_text(&text),
        Ok(_) | Err(_) => fallback_opening(world, episode),
    }
}

pub async fn get_chat(
    llm: &LlmClient,
    db: &DatabasePool,
    user_id: &str,
    episode_id: &str,
) -> Result<Vec<SoulMateMessage>, String> {
    let world = get_world_optional(db, user_id)?
        .ok_or_else(|| "Soul Mate is not initialized".to_string())?;
    let episode = get_episode(db, episode_id)?;
    if episode.world_id != world.id || episode.status != "read" {
        return Err("Finish today's story before chatting".to_string());
    }
    let existing = get_messages(db, episode_id)?;
    if !existing.is_empty() {
        return Ok(existing);
    }
    let opening = generate_chat_opening(llm, db, &world, &episode).await;
    save_message(db, &world.id, episode_id, "assistant", &opening)?;
    get_messages(db, episode_id)
}

fn fallback_reply(world: &SoulMateWorld) -> String {
    match world.target_lang.as_str() {
        "es" => {
            "Me gusta tu forma de verlo. Guardaré esa idea para lo que ocurra mañana.".to_string()
        }
        "en" => "I like the way you see it. I'll remember that idea for what happens tomorrow."
            .to_string(),
        _ => "我喜欢你的想法，我会记住它，看看明天会发生什么。".to_string(),
    }
}

fn clean_plain_text(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .trim_matches('"')
        .trim()
        .to_string()
}

pub async fn submit_turn(
    llm: &LlmClient,
    db: &DatabasePool,
    user_id: &str,
    episode_id: &str,
    user_message: &str,
) -> Result<SoulMateMessage, String> {
    let text = user_message.trim();
    if text.is_empty() {
        return Err("Message cannot be empty".to_string());
    }
    let world = get_world_optional(db, user_id)?
        .ok_or_else(|| "Soul Mate is not initialized".to_string())?;
    let episode = get_episode(db, episode_id)?;
    if episode.world_id != world.id || episode.status != "read" {
        return Err("Soul Mate chat is not available".to_string());
    }
    save_message(db, &world.id, episode_id, "user", text)?;
    let memory_line = format!("Day {} user: {}\n", episode.day_number, text);
    let conn = db.conn()?;
    conn.execute(
        "UPDATE soulmate_worlds
         SET memory_summary = memory_summary || ?1, updated_at = datetime('now')
         WHERE id = ?2",
        params![memory_line, world.id],
    )
    .map_err(|e| format!("Failed to update Soul Mate memory: {e}"))?;
    drop(conn);

    let conversation = get_messages(db, episode_id)?
        .into_iter()
        .map(|message| format!("{}: {}", message.role, message.content))
        .collect::<Vec<_>>()
        .join("\n");
    let vars = [
        ("NAME", world.companion_name.as_str()),
        ("TYPE", world.companion_type.as_str()),
        ("PERSONALITY", world.personality.as_str()),
        ("TARGET_LANG", llm::lang_name(&world.target_lang)),
        ("NATIVE_LANG", llm::lang_name(&world.native_lang)),
        ("CEFR", world.cefr_level.as_str()),
        ("TITLE", episode.title.as_str()),
        ("STORY", episode.body.as_str()),
        ("STORY_SUMMARY", world.story_summary.as_str()),
        ("MEMORY_SUMMARY", world.memory_summary.as_str()),
        ("CONVERSATION", conversation.as_str()),
    ];
    let mut messages = llm::build_chat_messages(db, "soulmate-dialogue", &vars);
    if messages.is_empty() {
        messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "You are {}, a fictional AI companion. Reply only in {} at CEFR {}. Keep replies to 1-3 short sentences and continue today's story conversation.",
                    world.companion_name,
                    llm::lang_name(&world.target_lang),
                    world.cefr_level
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: conversation,
            },
        ];
    }
    let reply = match llm.chat_with_limits(db, messages, 500, 60).await {
        Ok(value) if !value.trim().is_empty() => clean_plain_text(&value),
        Ok(_) | Err(_) => fallback_reply(&world),
    };
    save_message(db, &world.id, episode_id, "assistant", &reply)
}

pub fn reset(db: &DatabasePool, user_id: &str) -> Result<bool, String> {
    let conn = db.conn()?;
    let deleted = conn
        .execute(
            "DELETE FROM soulmate_worlds WHERE user_id = ?1",
            params![user_id],
        )
        .map_err(|e| format!("Failed to reset Soul Mate: {e}"))?;
    Ok(deleted > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_request() -> InitializeSoulMateRequest {
        InitializeSoulMateRequest {
            user_id: "u1".to_string(),
            companion_type: "explore".to_string(),
            companion_name: "Sofía".to_string(),
            companion_gender: "female".to_string(),
            personality: "curious".to_string(),
            story_location: "Madrid".to_string(),
            intensity: 2,
            romance_tension: 1,
            surprise: 3,
            knowledge: 2,
            target_lang: "es".to_string(),
            native_lang: "zh".to_string(),
            cefr_level: "A1".to_string(),
        }
    }

    fn setup() -> DatabasePool {
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute(
            "INSERT INTO users (id, nickname, wizard_completed) VALUES ('u1', 'Test', 1)",
            [],
        )
        .unwrap();
        drop(conn);
        db
    }

    #[test]
    fn initializes_one_world_per_user() {
        let db = setup();
        let first = initialize(&db, &test_request()).unwrap();
        assert_eq!(first.companion_name, "Sofía");
        let mut changed = test_request();
        changed.companion_name = "Luna".to_string();
        let second = initialize(&db, &changed).unwrap();
        assert_eq!(second.companion_name, "Luna");
        let count: i32 = db
            .conn()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM soulmate_worlds", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn rejects_invalid_story_preferences() {
        let db = setup();
        let mut request = test_request();
        request.surprise = 4;
        assert!(initialize(&db, &request).is_err());
    }

    #[test]
    fn marks_story_read_only_once() {
        let db = setup();
        let world = initialize(&db, &test_request()).unwrap();
        let conn = db.conn().unwrap();
        conn.execute(
            "INSERT INTO soulmate_episodes
             (id, world_id, story_date, day_number, title, teaser, body)
             VALUES ('e1', ?1, '2026-01-01', 1, 'Title', 'Teaser', 'A sufficiently long story body used by the test so validation is irrelevant here.')",
            params![world.id],
        )
        .unwrap();
        drop(conn);
        mark_story_read(&db, "e1").unwrap();
        mark_story_read(&db, "e1").unwrap();
        let summary: String = db
            .conn()
            .unwrap()
            .query_row(
                "SELECT story_summary FROM soulmate_worlds WHERE id = ?1",
                params![world.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(summary.matches("Day 1").count(), 1);
    }

    #[test]
    fn reset_cascades_story_and_messages() {
        let db = setup();
        let world = initialize(&db, &test_request()).unwrap();
        let conn = db.conn().unwrap();
        conn.execute(
            "INSERT INTO soulmate_episodes
             (id, world_id, story_date, day_number, title, body)
             VALUES ('e1', ?1, '2026-01-01', 1, 'Title', 'Body')",
            params![world.id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO soulmate_messages (world_id, episode_id, role, content)
             VALUES (?1, 'e1', 'assistant', 'Hi')",
            params![world.id],
        )
        .unwrap();
        drop(conn);
        assert!(reset(&db, "u1").unwrap());
        for table in ["soulmate_worlds", "soulmate_episodes", "soulmate_messages"] {
            let sql = format!("SELECT COUNT(*) FROM {table}");
            let count: i32 = db
                .conn()
                .unwrap()
                .query_row(&sql, [], |row| row.get(0))
                .unwrap();
            assert_eq!(count, 0, "{table} should be empty");
        }
    }

    #[test]
    fn parses_fenced_story_json() {
        let raw = "```json\n{\"title\":\"T\",\"teaser\":\"S\",\"body\":\"This story body is intentionally much longer than sixty characters so it passes validation without trouble.\"}\n```";
        let story = parse_generated_story(raw).unwrap();
        assert_eq!(story.title, "T");
    }
}
