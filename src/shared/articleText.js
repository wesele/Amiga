export function extractWordTexts(text) {
  if (!text) return [];
  const matches = text.match(/\b\p{L}{2,}\b/gu);
  if (!matches) return [];
  return [...new Set(matches.map((word) => word.toLowerCase()))];
}

export function getContext(fullText, word) {
  const idx = fullText.indexOf(word);
  if (idx < 0) return word;
  const start = Math.max(0, idx - 30);
  const end = Math.min(fullText.length, idx + word.length + 30);
  return fullText.slice(start, end).trim();
}

export function tokenizeArticleText(text) {
  if (!text) return [];
  const parts = text.split(/(\s+)/);
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
        pushSplitTokens(result, tempStr.slice(lastIdx, match.index), text);
      }
      result.push({
        text: match[1],
        isWord: true,
        isNewWord: false,
        context: getContext(text, match[1]),
      });
      lastIdx = match.index + match[0].length;
    }

    if (lastIdx < tempStr.length) {
      pushSplitTokens(result, tempStr.slice(lastIdx), text);
    }
  }

  return result;
}

function pushSplitTokens(result, value, fullText) {
  for (const token of value.split(/(?<=\P{L})(?=\p{L})|(?<=\p{L})(?=\P{L})/u)) {
    if (token.trim()) {
      result.push({
        text: token,
        isWord: /^\p{L}/u.test(token),
        isNewWord: false,
        context: getContext(fullText, token),
      });
    } else {
      result.push({ text: token, isWord: false, isNewWord: false, context: "" });
    }
  }
}
