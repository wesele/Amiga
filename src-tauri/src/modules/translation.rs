use crate::modules::database::DatabasePool;
use crate::modules::llm::{translate_paragraphs, LlmClient};
use crate::modules::news as news_mod;

/// Return bilingual paragraph translations for an article, using cache when available.
pub async fn get_bilingual_article_translation(
    llm: &LlmClient,
    db: &DatabasePool,
    article_id: i32,
    source_lang: &str,
    native_lang: &str,
) -> Result<Vec<String>, String> {
    if let Some(cache) = news_mod::get_bilingual_cache(db, article_id, native_lang)? {
        if let Ok(translations) = serde_json::from_str::<Vec<String>>(&cache) {
            return Ok(translations);
        }
    }

    let article = news_mod::get_article(db, article_id)?;
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

    let translations =
        translate_paragraphs(llm, db, &paragraphs, source_lang, native_lang).await?;

    let cache_json = serde_json::to_string(&translations).unwrap_or_default();
    news_mod::save_bilingual_cache(db, article_id, native_lang, &cache_json)?;

    Ok(translations)
}

/// Translate a single text block (paragraph) into the user's native language.
pub async fn translate_text(
    llm: &LlmClient,
    db: &DatabasePool,
    text: &str,
    source_lang: &str,
    native_lang: &str,
) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let paragraphs = vec![text.trim().to_string()];
    let results =
        translate_paragraphs(llm, db, &paragraphs, source_lang, native_lang).await?;
    Ok(results.into_iter().next().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::database::DatabasePool;

    #[tokio::test]
    async fn test_translate_text_empty_returns_empty() {
        let llm = LlmClient::new();
        let db = DatabasePool::new_in_memory();
        let result = translate_text(&llm, &db, "   ", "es", "zh").await.unwrap();
        assert_eq!(result, "");
    }

    #[tokio::test]
    async fn test_get_bilingual_empty_body_returns_empty() {
        let llm = LlmClient::new();
        let db = DatabasePool::new_in_memory();
        let conn = db.conn().unwrap();
        conn.execute(
            "INSERT INTO news_articles (original_title, original_body, region, hot_rank)
             VALUES ('Empty', '', 'world', 1)",
            [],
        )
        .unwrap();
        let article_id = conn.last_insert_rowid() as i32;
        drop(conn);

        let result = get_bilingual_article_translation(&llm, &db, article_id, "es", "zh")
            .await
            .unwrap();
        assert!(result.is_empty());
    }
}