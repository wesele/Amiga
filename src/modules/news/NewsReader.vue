<template>
  <div class="news-reader">
    <!-- Header -->
    <header class="reader-header">
      <button class="back-btn" @click="goBack">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="header-info">
        <div class="header-title">{{ article?.original_title }}</div>
        <div class="header-source" v-if="article?.source">{{ formatSource(article.source) }}</div>
      </div>
    </header>

    <!-- Loading / Rewrite prompt -->
    <div v-if="!article" class="loading-center">加载中…</div>
    <div v-else-if="!article.rewritten_body && !rewriting" class="rewrite-prompt">
      <p>这篇文章尚未改写为你当前级别的版本。</p>
      <button class="btn-rewrite" @click="doRewrite">AI 智能改写</button>
    </div>
    <div v-else-if="rewriting" class="loading-center">
      <div class="spinner" />
      <p>AI 正在改写文章…</p>
    </div>

    <!-- Article body -->
    <div v-else class="article-body">
      <div class="article-text">
        <template v-for="(token, idx) in tokens" :key="idx">
          <span v-if="token.isNewWord" class="word new-word" @click.stop="onWordTap(token)">
            {{ token.text }}
          </span>
          <span v-else-if="token.isWord" class="word" @click.stop="onWordTap(token)">
            {{ token.text }}
          </span>
          <span v-else>{{ token.text }}</span>
        </template>
      </div>
    </div>

    <!-- Word popup -->
    <Transition name="popup">
      <WordPopup
        v-if="selectedWord"
        :word="selectedWord.text"
        :context="selectedWord.context"
        @close="selectedWord = null"
        @known="onWordKnown"
        @unknown="onWordUnknown"
      />
    </Transition>

    <!-- Bottom stats -->
    <div v-if="article?.rewritten_body" class="reading-stats">
      <span>已查 {{ lookedUp }} 词</span>
      <span>✅ {{ known }} 认识</span>
      <span>❌ {{ unknown }} 不认识</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useRouter } from "vue-router";
import { getArticle, rewriteArticle, translateWord, saveReadingLog, updateWordMastery, getCurrentUser } from "@/shared/api.js";
import WordPopup from "./components/WordPopup.vue";

const props = defineProps({ id: [String, Number] });
const router = useRouter();

const article = ref(null);
const rewriting = ref(false);
const selectedWord = ref(null);
const lookedUp = ref(0);
const known = ref(0);
const unknown = ref(0);
const knownWordIds = ref(new Set());
const startTime = ref(Date.now());
let userId = "";

onMounted(async () => {
  startTime.value = Date.now();
  try {
    const user = await getCurrentUser();
    userId = user.id;
    const art = await getArticle(Number(props.id));
    article.value = art;
    if (!art.rewritten_body) {
      await doRewrite();
    }
  } catch (e) {
    console.error("Failed to load article:", e);
  }
});

onBeforeUnmount(async () => {
  if (userId && article.value) {
    const elapsed = Math.round((Date.now() - startTime.value) / 1000);
    try {
      await saveReadingLog({
        user_id: userId,
        article_id: Number(props.id),
        words_looked_up: JSON.stringify(Array.from(knownWordIds.value)),
        words_known: JSON.stringify([]),
        words_unknown: JSON.stringify([]),
        reading_time_sec: elapsed,
        completed: true,
      });
    } catch (e) {
      console.error("Failed to save reading log:", e);
    }
  }
});

async function doRewrite() {
  rewriting.value = true;
  try {
    const result = await rewriteArticle(Number(props.id), "A1", userId);
    article.value = result;
  } catch (e) {
    console.error("Failed to rewrite article:", e);
    // Show original if rewrite fails
  } finally {
    rewriting.value = false;
  }
}

// Tokenize article body
const tokens = ref([]);
function parseText(text) {
  if (!text) return;
  // Split by spaces but keep punctuation
  const parts = text.split(/(\s+)/);
  const result = [];
  let inBold = false;

  for (const part of parts) {
    if (part.trim() === "" && part.length > 0) {
      // Space token
      result.push({ text: part, isWord: false, isNewWord: false, context: "" });
      continue;
    }

    // Check for **bold** markers
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    let lastIdx = 0;
    const tempStr = part;

    while ((match = boldRegex.exec(tempStr)) !== null) {
      // Add text before match
      if (match.index > lastIdx) {
        const prefix = tempStr.slice(lastIdx, match.index);
        for (const w of prefix.split(/(?<=\W)(?=\w)|(?<=\w)(?=\W)/)) {
          if (w.trim()) {
            result.push({ text: w, isWord: /^\p{L}/u.test(w), isNewWord: false, context: getContext(text, w) });
          } else {
            result.push({ text: w, isWord: false, isNewWord: false, context: "" });
          }
        }
      }
      // Bold word
      result.push({ text: match[1], isWord: true, isNewWord: true, context: getContext(text, match[1]) });
      lastIdx = match.index + match[0].length;
    }

    // Remaining text after last bold
    if (lastIdx < tempStr.length) {
      const suffix = tempStr.slice(lastIdx);
      for (const w of suffix.split(/(?<=\W)(?=\w)|(?<=\w)(?=\W)/)) {
        if (w.trim()) {
          result.push({ text: w, isWord: /^\p{L}/u.test(w), isNewWord: false, context: getContext(text, w) });
        } else {
          result.push({ text: w, isWord: false, isNewWord: false, context: "" });
        }
      }
    }
  }
  tokens.value = result;
}

function getContext(fullText, word) {
  const idx = fullText.indexOf(word);
  if (idx < 0) return word;
  const start = Math.max(0, idx - 30);
  const end = Math.min(fullText.length, idx + word.length + 30);
  return fullText.slice(start, end).trim();
}

watch(() => article.value?.rewritten_body, (val) => {
  if (val) parseText(val);
});

watch(() => article.value?.original_body, (val) => {
  if (val && !article.value?.rewritten_body) parseText(val);
});

function onWordTap(token) {
  if (!token.isWord) return;
  selectedWord.value = token;
  lookedUp.value++;
}

function onWordKnown() {
  known.value++;
  selectedWord.value = null;
}

function onWordUnknown() {
  unknown.value++;
  selectedWord.value = null;
}

function goBack() {
  router.push("/news");
}

function formatSource(source) {
  if (!source || source === "sample") return "示例";
  try {
    const url = new URL(source);
    return url.hostname;
  } catch {
    return source?.slice(0, 30) || "";
  }
}
</script>

<style scoped>
.news-reader {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
  position: relative;
}

.reader-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 12px 4px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.back-btn {
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background var(--transition);
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--surface-variant);
}

.header-info {
  flex: 1;
  min-width: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.header-source {
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 2px;
}

.loading-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-light);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.rewrite-prompt {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  text-align: center;
  color: var(--text-light);
}

.btn-rewrite {
  padding: 12px 32px;
  border-radius: var(--radius-md);
  background: var(--green);
  color: #fff;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all var(--transition);
}

.btn-rewrite:hover {
  background: var(--green-hover);
}

/* Article text */
.article-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 20px 80px;
}

.article-text {
  font-size: 17px;
  line-height: 2.0;
  color: var(--text);
  user-select: none;
}

.word {
  cursor: pointer;
  padding: 0 1px;
  border-radius: 3px;
  transition: background 0.1s;
}

.word:hover {
  background: var(--blue-bg);
}

.word.new-word {
  font-weight: 800;
  color: var(--purple);
  background: var(--purple-bg);
  border-radius: 3px;
}

.word.new-word:hover {
  background: var(--purple);
  color: #fff;
}

/* Bottom stats */
.reading-stats {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  padding-bottom: calc(12px + var(--safe-bottom));
  border-top: 1px solid var(--border);
  background: var(--surface);
  font-size: 12px;
  color: var(--text-light);
  flex-shrink: 0;
}

/* Popup transition */
.popup-enter-active,
.popup-leave-active {
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
}
.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
