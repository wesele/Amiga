use crate::modules::database::DatabasePool;
use crate::modules::llm as llm_mod;
use tauri::State;

// We need to store the LlmClient as Tauri state too
pub struct LlmState {
    pub client: llm_mod::LlmClient,
}

#[tauri::command]
pub async fn rewrite_article_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    article_id: i32,
    cefr_level: String,
    user_id: String,
    target_lang: String,
) -> Result<serde_json::Value, String> {
    use crate::modules::news as news_mod;
    use crate::modules::vocabulary as vocab_mod;

    // Get article
    let article = news_mod::get_article(&db, article_id)?;
    let original = article.original_body.unwrap_or_default();

    // Get unknown words for new word selection, scoped to the article's
    // target language so an English learner gets English words, not the
    // Spanish defaults.
    let unknown_words = vocab_mod::get_unknown_words(&db, &user_id, &cefr_level, 20, &target_lang)?;
    let new_words: Vec<String> = unknown_words.iter().map(|w| w.word.clone()).collect();

    // Rewrite using LLM
    let result = llm_mod::rewrite_article(
        &llm.client,
        &db,
        &original,
        &article.original_title,
        &cefr_level,
        &new_words,
        &target_lang,
    )
    .await?;

    // Save rewritten article
    let new_words_json = serde_json::to_string(&result.new_words_used).unwrap_or_default();
    news_mod::save_rewritten_article(
        &db,
        article_id,
        &result.rewritten,
        &cefr_level,
        &new_words_json,
    )?;

    // Return updated article
    let updated = news_mod::get_article(&db, article_id)?;
    serde_json::to_value(updated).map_err(|e| format!("Serialization error: {}", e))
}

#[tauri::command]
pub async fn translate_word_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    word: String,
    context: String,
    source_lang: String,
    native_lang: String,
) -> Result<llm_mod::TranslationResult, String> {
    llm_mod::translate_word(
        &llm.client,
        &db,
        &word,
        &context,
        &source_lang,
        &native_lang,
    )
    .await
}

#[tauri::command]
pub async fn test_llm_connection_cmd(
    llm: State<'_, LlmState>,
    config: llm_mod::ModelConfig,
) -> Result<llm_mod::TestResult, String> {
    Ok(llm.client.test_connection(&config).await)
}

#[tauri::command]
pub async fn save_llm_config_cmd(
    db: State<'_, DatabasePool>,
    key: String,
    config: llm_mod::ModelConfig,
) -> Result<(), String> {
    let prefix = &key; // "primary" or "backup"
    llm_mod::save_llm_setting(&db, &format!("{}_base_url", prefix), &config.base_url)?;
    llm_mod::save_llm_setting(&db, &format!("{}_api_key", prefix), &config.api_key)?;
    llm_mod::save_llm_setting(&db, &format!("{}_model", prefix), &config.model)?;
    Ok(())
}

#[tauri::command]
pub async fn get_llm_config_cmd(db: State<'_, DatabasePool>) -> Result<llm_mod::LlmConfig, String> {
    llm_mod::get_llm_config(&db)
}

#[tauri::command]
pub async fn save_setting_cmd(
    db: State<'_, DatabasePool>,
    key: String,
    value: String,
) -> Result<(), String> {
    llm_mod::save_setting(&db, &key, &value)
}

#[tauri::command]
pub async fn get_setting_cmd(
    db: State<'_, DatabasePool>,
    key: String,
) -> Result<Option<String>, String> {
    llm_mod::get_setting(&db, &key)
}

#[tauri::command]
pub async fn get_bilingual_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    article_id: i32,
    source_lang: String,
    native_lang: String,
) -> Result<Vec<String>, String> {
    use crate::modules::news as news_mod;

    // Check cache first
    if let Some(cache) = news_mod::get_bilingual_cache(&db, article_id)? {
        if let Ok(translations) = serde_json::from_str::<Vec<String>>(&cache) {
            return Ok(translations);
        }
    }

    // Get article and split into paragraphs
    let article = news_mod::get_article(&db, article_id)?;
    let body = article
        .rewritten_body
        .or(article.original_body)
        .unwrap_or_default();

    let paragraphs: Vec<String> = body
        .split("\n\n")
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();

    if paragraphs.is_empty() {
        return Ok(vec![]);
    }

    // Translate all paragraphs
    let translations =
        llm_mod::translate_paragraphs(&llm.client, &db, &paragraphs, &source_lang, &native_lang)
            .await?;

    // Save cache
    let cache_json = serde_json::to_string(&translations).unwrap_or_default();
    news_mod::save_bilingual_cache(&db, article_id, &cache_json)?;

    Ok(translations)
}

#[tauri::command]
pub async fn translate_text_cmd(
    db: State<'_, DatabasePool>,
    llm: State<'_, LlmState>,
    text: String,
    source_lang: String,
    native_lang: String,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let paragraphs = vec![text.trim().to_string()];
    let results =
        llm_mod::translate_paragraphs(&llm.client, &db, &paragraphs, &source_lang, &native_lang)
            .await?;
    Ok(results.into_iter().next().unwrap_or_default())
}
