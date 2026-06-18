/// Database migration definitions
/// Each migration: (version_number, description, SQL)

pub fn all_migrations() -> Vec<(i32, &'static str, &'static str)> {
    vec![
        (1, "Initial schema - core tables", MIGRATION_V1),
        (2, "Add bilingual_cache to news_articles", MIGRATION_V2),
        (3, "Add prompts table for LLM prompt management", MIGRATION_V3),
        (4, "Add chat sessions and messages tables", MIGRATION_V4),
        (5, "Add contact_type to chat_sessions", MIGRATION_V5),
    ]
}

const MIGRATION_V1: &str = r#"
-- Users table (single-user local mode)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL DEFAULT '学习者',
    avatar TEXT NOT NULL DEFAULT '😊',
    native_language TEXT NOT NULL DEFAULT 'zh',
    country TEXT NOT NULL DEFAULT 'CN',
    gender TEXT DEFAULT 'private',
    birth_year INTEGER,
    wizard_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_date TEXT
);

-- Learning goals (one per target language)
CREATE TABLE IF NOT EXISTS learning_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    target_language TEXT NOT NULL DEFAULT 'es',
    cefr_level TEXT NOT NULL DEFAULT 'A1',
    daily_minutes INTEGER NOT NULL DEFAULT 15,
    objective TEXT NOT NULL DEFAULT 'daily_conversation',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Built-in graded vocabulary bank
CREATE TABLE IF NOT EXISTS vocab_bank (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word TEXT NOT NULL,
    lemma TEXT,
    pos TEXT,
    cefr_level TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'es',
    definition_zh TEXT,
    definition_es TEXT,
    example TEXT,
    frequency INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vocab_bank_level ON vocab_bank(cefr_level);
CREATE INDEX IF NOT EXISTS idx_vocab_bank_lang ON vocab_bank(language);

-- User vocabulary mastery tracking
CREATE TABLE IF NOT EXISTS user_vocab (
    user_id TEXT NOT NULL REFERENCES users(id),
    word_id INTEGER NOT NULL REFERENCES vocab_bank(id),
    mastery INTEGER NOT NULL DEFAULT 0,
    source TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, word_id)
);

-- News articles cache
CREATE TABLE IF NOT EXISTS news_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_title TEXT NOT NULL,
    original_body TEXT,
    rewritten_body TEXT,
    rewrite_level TEXT,
    source TEXT,
    image_url TEXT,
    region TEXT,
    hot_rank INTEGER,
    new_words TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_news_region ON news_articles(region);
CREATE INDEX IF NOT EXISTS idx_news_fetched ON news_articles(fetched_at);

-- News reading log
CREATE TABLE IF NOT EXISTS news_reading_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    article_id INTEGER NOT NULL REFERENCES news_articles(id),
    words_looked_up TEXT,
    words_known TEXT,
    words_unknown TEXT,
    reading_time_sec INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    read_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- App settings (key-value store)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Streak records (daily activity)
CREATE TABLE IF NOT EXISTS streak_records (
    user_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL,
    articles_read INTEGER NOT NULL DEFAULT 0,
    words_learned INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
);
"#;

const MIGRATION_V2: &str = r#"
ALTER TABLE news_articles ADD COLUMN bilingual_cache TEXT;
"#;

const MIGRATION_V3: &str = r#"
CREATE TABLE IF NOT EXISTS prompts (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    system_prompt TEXT NOT NULL,
    user_prompt_template TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

const MIGRATION_V4: &str = r#"
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL DEFAULT '新对话',
    user_profile_json TEXT NOT NULL DEFAULT '{}',
    conversation_summary TEXT NOT NULL DEFAULT '',
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
"#;

const MIGRATION_V5: &str = r#"
ALTER TABLE chat_sessions ADD COLUMN contact_type TEXT NOT NULL DEFAULT 'amiga';
ALTER TABLE chat_sessions ADD COLUMN last_message TEXT NOT NULL DEFAULT '';
"#;
