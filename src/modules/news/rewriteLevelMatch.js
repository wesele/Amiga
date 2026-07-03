/** 改写等级是否与用户当前等级一致（大小写不敏感；缺省视为非 stale） */
export function isRewriteLevelStale(rewriteLevel, userCefr) {
  if (!rewriteLevel || !userCefr) return false;
  return rewriteLevel.toUpperCase() !== userCefr.toUpperCase();
}

/** 列表徽章：{ show, level, stale } */
export function rewriteLevelBadge(article, userCefr) {
  if (!article?.rewritten_body) return { show: false };
  const level = article.rewrite_level?.toUpperCase() || null;
  return {
    show: true,
    level,
    stale: isRewriteLevelStale(level, userCefr),
  };
}

/** 是否应在阅读器展示刷新横幅 */
export function shouldOfferRewriteRefresh(article, userCefr) {
  if (!article?.rewritten_body) return false;
  return isRewriteLevelStale(article.rewrite_level, userCefr);
}