/// Database migration definitions
/// Each migration: (version_number, description, SQL)
pub fn all_migrations() -> Vec<(i32, &'static str, &'static str)> {
    vec![
        (1, "Initial schema - core tables", MIGRATION_V1),
        (2, "Add bilingual_cache to news_articles", MIGRATION_V2),
        (
            3,
            "Add prompts table for LLM prompt management",
            MIGRATION_V3,
        ),
        (4, "Add chat sessions and messages tables", MIGRATION_V4),
        (5, "Add contact_type to chat_sessions", MIGRATION_V5),
        (
            6,
            "Merge user_vocab mastery 0 into unseen (drop 状态'未掌握')",
            MIGRATION_V6,
        ),
        (
            7,
            "Wipe user_vocab legacy data (was bulk-set mastery=2 by old init_user_vocab)",
            MIGRATION_V7,
        ),
        (
            8,
            "Add unique index on vocab_bank(word, cefr_level, language) and import default content (zh/en/es A1+A2) from vocabulary.json",
            MIGRATION_V8,
        ),
        (
            9,
            "Move news_articles.bilingual_cache into per-native_lang table news_bilingual_cache",
            MIGRATION_V9,
        ),
        (
            10,
            "Wipe legacy chat history and scope chat_sessions to (user_id, target_language)",
            MIGRATION_V10,
        ),
        (
            11,
            "Add age_range to users (wizard collects 4 buckets instead of exact birth_year)",
            MIGRATION_V11,
        ),
        (
            12,
            "Add unique index on news_articles(source) to prevent duplicates on refresh",
            MIGRATION_V12,
        ),
        (
            13,
            "Track current news batch visibility so refresh replaces the visible list without deleting reading history",
            MIGRATION_V13,
        ),
        (
            14,
            "Deduplicate news_reading_log rows on cloud sync import",
            MIGRATION_V14,
        ),
        (
            15,
            "Add path_section_progress for progression path lesson tracking",
            MIGRATION_V15,
        ),
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

const MIGRATION_V6: &str = r#"
-- Merge "已展示" (mastery=1) and "未掌握" (mastery=0) into a single "已展示" state.
-- Drop the obsolete mastery=0 records (now equivalent to unseen).
DELETE FROM user_vocab WHERE mastery = 0;
"#;

const MIGRATION_V7: &str = r#"
-- Reset user_vocab to recover from a legacy bug where the wizard's
-- init_user_vocab() bulk-inserted every CEFR-level word as mastery=2
-- (source='wizard_init'). That made "已掌握词汇" report inflated counts.
-- Wipe all per-user mastery rows so each user starts fresh; the no-op
-- init_user_vocab() in code means new records only appear via real
-- reading/review actions.
DELETE FROM user_vocab;
"#;

const MIGRATION_V8: &str = r#"
-- Wipe user_vocab first to satisfy the FK from user_vocab.word_id → vocab_bank.id.
-- Wiping user_vocab is acceptable here: a content update (adding Chinese / English
-- graded lists) is a reasonable moment to reset per-user mastery, which was just
-- bulk-inserted by the legacy init path in earlier versions.
DELETE FROM user_vocab;
DELETE FROM vocab_bank;

-- Enforce uniqueness so the import function (which uses INSERT OR IGNORE) can
-- be re-run safely and won't duplicate rows when the JSON source is updated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_bank_unique
  ON vocab_bank(word, cefr_level, language);
"#;

const MIGRATION_V9: &str = r#"
-- Per-article bilingual translations must be cached once per user native
-- language, otherwise a Chinese user and an English user would either
-- share a Chinese-only cache or invalidate each other's translations.
-- The legacy `news_articles.bilingual_cache` TEXT column held a single
-- Vec<String> for the whole article regardless of native_lang, so we
-- move it into a dedicated table with a (article_id, native_lang) key.

CREATE TABLE IF NOT EXISTS news_bilingual_cache (
    article_id INTEGER NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
    native_lang TEXT NOT NULL DEFAULT 'zh',
    paragraphs_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (article_id, native_lang)
);

-- Migrate any existing single-language cache rows. We cannot recover the
-- original native_lang from the old column, so we default to 'zh'; if
-- that's wrong, the next request from a different native_lang will simply
-- re-translate and overwrite.
INSERT OR IGNORE INTO news_bilingual_cache (article_id, native_lang, paragraphs_json)
SELECT id, 'zh', bilingual_cache
FROM news_articles
WHERE bilingual_cache IS NOT NULL AND bilingual_cache != '';
"#;

const MIGRATION_V10: &str = r#"
-- Per (user, target_language, contact_type) we now keep an independent
-- chat history. The previous schema shared a single history across all
-- target languages, which caused cross-language contamination in the
-- system prompt (vocab/weaknesses/summary) and the recent-message
-- context. Wipe the legacy data and add a target_language column with
-- an index scoped to the new lookup key.

-- CASCADE on chat_messages.session_id handles the messages table.
DELETE FROM chat_sessions;

ALTER TABLE chat_sessions
    ADD COLUMN target_language TEXT NOT NULL DEFAULT 'es';

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_lang
    ON chat_sessions(user_id, target_language, contact_type);
"#;

const MIGRATION_V11: &str = r#"
-- Wizard now collects a 4-bucket age range (under_18 / 18_36 / 37_54 / over_54)
-- instead of an exact birth_year. Keep the legacy column for now; we just stop
-- reading it from the new wizard.
ALTER TABLE users ADD COLUMN age_range;
"#;

const MIGRATION_V12: &str = r#"
-- Clean up duplicates (keep the row with the smallest id per source URL).
-- Rows with NULL source are untouched.
DELETE FROM news_articles WHERE id NOT IN (
    SELECT MIN(id) FROM news_articles GROUP BY source
) AND source IS NOT NULL;

-- Prevent future duplicates on refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_source_unique ON news_articles(source);
"#;

const MIGRATION_V13: &str = r#"
-- Refresh should replace the visible list immediately, but deleting old rows
-- breaks the FK from news_reading_log.article_id -> news_articles.id. Keep old
-- rows for history and hide them from the list via an is_current flag.
ALTER TABLE news_articles ADD COLUMN is_current INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_news_region_current
  ON news_articles(region, is_current, hot_rank, fetched_at);
"#;

const MIGRATION_V14: &str = r#"
CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_log_user_article_read_at
  ON news_reading_log(user_id, article_id, read_at);
"#;

const MIGRATION_V15: &str = r#"
CREATE TABLE IF NOT EXISTS path_section_progress (
    user_id TEXT NOT NULL REFERENCES users(id),
    pair_key TEXT NOT NULL,
    section_id TEXT NOT NULL,
    stars INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, pair_key, section_id)
);

CREATE INDEX IF NOT EXISTS idx_path_progress_user_pair
  ON path_section_progress(user_id, pair_key);
"#;
