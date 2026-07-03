/** Merge API rows into Map<articleId, translation> */
export function buildTitleTranslationMap(rows) {
  const map = new Map();
  if (!rows?.length) return map;
  for (const row of rows) {
    if (row?.article_id != null && row.title_translation) {
      map.set(row.article_id, row.title_translation);
    }
  }
  return map;
}

/** Card copy: prefer cached translation; loading/failed states */
export function titlePreviewState(article, translationMap, { loading = false, failed = false } = {}) {
  const translation = translationMap?.get?.(article?.id);
  return {
    show: Boolean(translation),
    text: translation || "",
    loading: loading && !translation,
    failed: failed && !translation,
  };
}