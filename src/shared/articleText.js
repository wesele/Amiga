export function extractWordTexts(text) {
  if (!text) return [];
  const matches = text.match(/\b\p{L}{2,}\b/gu);
  if (!matches) return [];
  return [...new Set(matches.map((word) => word.toLowerCase()))];
}

export function getContext(fullText, word) {
  const source = typeof fullText === "string" ? fullText : String(fullText || "");
  const target = typeof word === "string" ? word : String(word || "");
  const idx = source.indexOf(target);
  if (idx < 0) return target;
  const start = Math.max(0, idx - 30);
  const end = Math.min(source.length, idx + target.length + 30);
  return source.slice(start, end).trim();
}

export function cleanHtmlText(text) {
  if (!text) return "";
  const str = typeof text === "string" ? text : String(text);
  return str
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<a\b[^>]*>\s*(?:leer(?:\s+m[áa]s)?|read\s+more|continue\s+reading|seguir\s+leyendo)\s*<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'");
}

function normalizeForComparison(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function isSummaryDuplicateOfTitle(title, summary) {
  const normSummary = normalizeForComparison(cleanHtmlText(summary));
  if (!normSummary) return true;
  const normTitle = normalizeForComparison(cleanHtmlText(title));
  if (!normTitle) return false;
  if (normSummary === normTitle) return true;
  if (normTitle.includes(normSummary)) return true;
  if (normSummary.startsWith(normTitle) && normSummary.length - normTitle.length <= 30) {
    return true;
  }
  return false;
}

export function cleanRssSummary(title, rawBody) {
  const cleaned = cleanHtmlText(rawBody).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (isSummaryDuplicateOfTitle(title, cleaned)) return "";
  return cleaned;
}

export function splitTextIntoSentences(text) {
  const cleaned = cleanHtmlText(text).trim();
  if (!cleaned) return [];

  let segments = [];
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
      for (const item of segmenter.segment(cleaned)) {
        const seg = (item.segment || "").trim();
        if (seg) segments.push(seg);
      }
    } catch (_) {
      segments = [];
    }
  }

  if (segments.length === 0) {
    const rawSegments = cleaned
      .split(/(?<=[.!?。！？…]+['"”’」』)]*)(?:\s+|$)|(?<=[。！？…]['"”’」』)]*)/u)
      .map((s) => s.trim())
      .filter(Boolean);
    segments = rawSegments;
  }

  if (segments.length === 0) {
    return [cleaned];
  }
  return segments;
}

export function tokenizeArticleText(text, isNewWordFn, options = {}) {
  let isNewFn = isNewWordFn;
  let opts = options;
  if (typeof isNewWordFn === "object" && isNewWordFn !== null) {
    opts = isNewWordFn;
    isNewFn = undefined;
  }
  if (!text) return [];
  const cleanText = cleanHtmlText(text);
  const contextSource = opts?.contextSourceText || cleanText;
  const parts = cleanText.split(/(\s+)/);
  const result = [];

  for (const part of parts) {
    if (part.trim() === "" && part.length > 0) {
      result.push({ text: part, isWord: false, isNewWord: false, context: "" });
      continue;
    }

    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    let lastIdx = 0;
    const tempStr = part;

    while ((match = boldRegex.exec(tempStr)) !== null) {
      if (match.index > lastIdx) {
        pushSplitTokens(result, tempStr.slice(lastIdx, match.index), contextSource, isNewFn);
      }
      const boldText = match[1];
      const isWord = true;
      const isNewWord = typeof isNewFn === "function" ? Boolean(isNewFn(boldText)) : false;
      result.push({
        text: boldText,
        isWord,
        isNewWord,
        context: getContext(contextSource, boldText),
      });
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < tempStr.length) {
      pushSplitTokens(result, tempStr.slice(lastIdx), contextSource, isNewFn);
    }
  }

  return result;
}

function pushSplitTokens(result, value, fullText, isNewWordFn) {
  for (const token of value.split(/(?<=\P{L})(?=\p{L})|(?<=\p{L})(?=\P{L})/u)) {
    if (token.trim()) {
      const isWord = /^\p{L}/u.test(token);
      const isNewWord = isWord && typeof isNewWordFn === "function" ? Boolean(isNewWordFn(token)) : false;
      result.push({
        text: token,
        isWord,
        isNewWord,
        context: getContext(fullText, token),
      });
    } else {
      result.push({ text: token, isWord: false, isNewWord: false, context: "" });
    }
  }
}

export function tokenizeParagraphSentences(text, isNewWordFn, options = {}) {
  let isNewFn = isNewWordFn;
  let opts = options;
  if (typeof isNewWordFn === "object" && isNewWordFn !== null) {
    opts = isNewWordFn;
    isNewFn = undefined;
  }
  const cleanedParagraph = cleanHtmlText(text).trim();
  if (!cleanedParagraph) return [];

  const sentences = splitTextIntoSentences(cleanedParagraph);
  const contextSourceText = opts?.contextSourceText || cleanedParagraph;

  return sentences.map((sentenceText) => ({
    text: sentenceText,
    tokens: tokenizeArticleText(sentenceText, isNewFn, {
      ...opts,
      contextSourceText,
    }),
  }));
}

export function buildArticleReadSegments({ title = "", paragraphs = [] } = {}) {
  const segments = [];
  const cleanTitle = cleanHtmlText(title).trim();
  if (cleanTitle) {
    segments.push({
      isTitle: true,
      paragraphIndex: -1,
      sentenceIndex: -1,
      text: cleanTitle,
    });
  }

  if (Array.isArray(paragraphs)) {
    paragraphs.forEach((p, paragraphIndex) => {
      let sentenceTexts = [];
      if (Array.isArray(p)) {
        for (const item of p) {
          const raw = typeof item === "string" ? item : item?.text || "";
          sentenceTexts.push(...splitTextIntoSentences(raw));
        }
      } else if (typeof p === "string") {
        sentenceTexts = splitTextIntoSentences(p);
      } else if (p && typeof p.text === "string") {
        sentenceTexts = splitTextIntoSentences(p.text);
      }

      sentenceTexts.forEach((sentenceText, sentenceIndex) => {
        segments.push({
          isTitle: false,
          paragraphIndex,
          sentenceIndex,
          text: sentenceText,
        });
      });
    });
  }

  return segments;
}
