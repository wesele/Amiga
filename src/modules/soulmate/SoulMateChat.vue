<template>
  <div class="chat-page" :class="{ 'tv-content-pane tv-content-pane--fixed tv-chat': isTvLayoutMode }">
    <PageHeader :title="chatTitle" />

    <!-- Phone: stacked messages + input. TV: left transcript (2/3) | right options (1/3). -->
    <div class="chat-body">
      <main ref="messageList" class="message-list" aria-live="polite">
        <div v-if="loading" class="chat-state">{{ t("app.loading") }}</div>
        <div v-else-if="loadError" class="chat-state error">{{ loadError }}</div>
        <template v-else>
          <div
            v-for="message in displayMessages"
            :key="message.id"
            class="message-row"
            :class="`role-${message.role}`"
          >
            <div class="bubble">
              <template v-for="(token, tokenIndex) in messageTokens(message)" :key="tokenIndex">
                <span
                  v-if="token.isWord"
                  class="message-word"
                  :tabindex="isTvLayoutMode ? 0 : undefined"
                  @click.stop="onWordTap(token)"
                  @keydown.enter.prevent="onWordTap(token)"
                  @keydown.space.prevent="onWordTap(token)"
                >{{ token.text }}</span>
                <span v-else>{{ token.text }}</span>
              </template>
            </div>
          </div>
          <div v-if="sending" class="message-row role-assistant">
            <div class="bubble typing"><i /><i /><i /></div>
          </div>
        </template>
      </main>

      <!-- Phone: free-text -->
      <form v-if="!isTvLayoutMode" class="input-bar" @submit.prevent="send">
        <input
          v-model="input"
          :placeholder="t('soulmate.chatPlaceholder')"
          :disabled="sending || loading || !canReply"
          maxlength="1000"
          @focus="rememberScrollAnchor"
        />
        <button type="submit" :disabled="!input.trim() || sending || !canReply">
          {{ t("soulmate.send") }}
        </button>
      </form>

      <!-- TV: right rail options (~1/3 width) -->
      <section
        v-else
        class="reply-panel"
        role="group"
        :aria-label="t('soulmate.replyOptionsHint')"
      >
        <p class="options-hint">{{ tvOptionsHint }}</p>
        <div v-if="optionsLoading" class="options-loading">
          <span class="mini-typing"><i /><i /><i /></span>
        </div>
        <div v-else class="reply-options">
          <button
            v-for="(option, index) in replyOptions"
            :key="`${index}-${option}`"
            ref="optionButtons"
            type="button"
            class="reply-option"
            data-tv-preferred-focus
            :disabled="sending || optionsLoading || !canReply"
            @click="sendOption(option)"
          >{{ option }}</button>
        </div>
      </section>
    </div>

    <Transition name="popup">
      <WordPopup
        v-if="selectedWord"
        :word="selectedWord.text"
        :context="selectedWord.context"
        :source-lang="targetLang"
        :native-lang="getLocale()"
        mode="word"
        @close="selectedWord = null"
        @known="setWordMastery(2)"
        @unknown="setWordMastery(1)"
      />
    </Transition>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import WordPopup from "@/shared/components/WordPopup.vue";
import { tokenizeArticleText } from "@/shared/articleText.js";
import { isTvLayoutMode } from "@/shared/appMode.js";
import { useI18n, getLocale } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import {
  getSoulMateChat,
  getSoulMateReplyOptions,
  getSoulMateWorld,
  submitSoulMateTurn,
} from "@/shared/backend/soulmate.js";
import {
  addDiscoveredWord,
  lookupWordIds,
  updateWordMastery,
} from "@/shared/backend/vocabulary.js";

const props = defineProps({ episodeId: { type: String, required: true } });
const { t } = useI18n();
const messages = ref([]);
const input = ref("");
const replyOptions = ref([]);
const loading = ref(true);
const sending = ref(false);
const optionsLoading = ref(false);
const loadError = ref("");
const userId = ref("");
const targetLang = ref("es");
const companionName = ref("");
const selectedWord = ref(null);
const messageList = ref(null);
/** Template refs for TV option buttons (array when v-for). */
const optionButtons = ref([]);
const chatTitle = computed(() =>
  t("soulmate.chatTitle", { name: companionName.value || t("soulmate.title") }),
);

/** Full history on TV (left pane scrolls); phone keeps a short window if ever needed. */
const displayMessages = computed(() => messages.value || []);

const canReply = computed(() => {
  if (sending.value || loading.value || loadError.value) return false;
  const last = messages.value[messages.value.length - 1];
  return Boolean(last && last.role === "assistant");
});

const tvOptionsHint = computed(() => {
  if (optionsLoading.value) return t("soulmate.replyOptionsLoading");
  if (sending.value) return t("soulmate.replyWaiting");
  if (!canReply.value) return t("soulmate.replyWaiting");
  if (replyOptions.value.length === 0) return t("soulmate.replyOptionsEmpty");
  return t("soulmate.replyOptionsHint");
});

let fullViewportHeight = 0;
let keyboardOpen = false;
let bottomOffset = 0;
let optionsRequestId = 0;

function getVisualViewport() {
  return typeof window === "undefined" ? null : window.visualViewport || null;
}

function rememberScrollAnchor() {
  const list = messageList.value;
  if (!list) return;
  bottomOffset = Math.max(0, list.scrollHeight - list.scrollTop - list.clientHeight);
}

function restoreScrollAnchor() {
  requestAnimationFrame(() => {
    const list = messageList.value;
    if (!list) return;
    list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight - bottomOffset);
  });
}

function onViewportResize() {
  const viewport = getVisualViewport();
  if (!viewport) return;
  const wasKeyboardOpen = keyboardOpen;
  keyboardOpen = fullViewportHeight - viewport.height > 80;
  if (!keyboardOpen) fullViewportHeight = viewport.height;
  if (keyboardOpen || wasKeyboardOpen) restoreScrollAnchor();
}

/** Always pin the left pane to the latest companion / user line. */
async function scrollBottom() {
  await nextTick();
  requestAnimationFrame(() => {
    const list = messageList.value;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  });
}

// Auto-scroll whenever the transcript changes (new turn, typing, load).
watch(
  () => [messages.value.length, sending.value, loading.value],
  () => { scrollBottom(); },
);

onMounted(async () => {
  const viewport = getVisualViewport();
  if (viewport) {
    fullViewportHeight = viewport.height;
    viewport.addEventListener("resize", onViewportResize);
  }
  try {
    if (!props.episodeId) throw new Error(t("soulmate.chatLoadFail"));
    const context = await loadLearningContext({ fallbackToFirstGoal: true });
    userId.value = context.user?.id || "";
    targetLang.value = context.targetLang || "es";
    const world = await getSoulMateWorld(userId.value, targetLang.value);
    companionName.value = world?.companion_name || "";
    messages.value = await getSoulMateChat(userId.value, targetLang.value, props.episodeId);
  } catch (e) {
    loadError.value = e?.message || t("soulmate.chatLoadFail");
  } finally {
    loading.value = false;
    await scrollBottom();
    if (isTvLayoutMode && !loadError.value) await refreshReplyOptions();
  }
});

onUnmounted(() => {
  getVisualViewport()?.removeEventListener("resize", onViewportResize);
  optionsRequestId += 1;
});

function messageTokens(message) {
  return tokenizeArticleText(message?.content || "");
}

function onWordTap(token) {
  const selection = window.getSelection?.();
  if (selection?.toString().trim()) return;
  selectedWord.value = token;
}

async function setWordMastery(mastery) {
  const word = selectedWord.value;
  selectedWord.value = null;
  if (!word || !userId.value) return;
  try {
    const ids = await lookupWordIds([word.text], targetLang.value);
    const wordId = ids[0] || await addDiscoveredWord(
      userId.value,
      word.text,
      targetLang.value,
      word.context,
    );
    if (ids.length > 0 || mastery > 1) {
      await updateWordMastery(userId.value, wordId, mastery, "soulmate_chat");
    }
  } catch (_) {
    // ignore vocab errors
  }
}

function fallbackOptions() {
  return [
    t("soulmate.fallbackOptionAgree"),
    t("soulmate.fallbackOptionMore"),
    t("soulmate.fallbackOptionNext"),
  ];
}

/** Put remote focus on the first reply option after buttons are mounted & enabled. */
async function focusFirstReplyOption() {
  if (!isTvLayoutMode) return;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await nextTick();
    const list = Array.isArray(optionButtons.value)
      ? optionButtons.value
      : optionButtons.value
        ? [optionButtons.value]
        : [];
    const btn = list.find((el) => el && !el.disabled)
      || document.querySelector?.(".tv-chat .reply-option:not(:disabled)");
    if (btn && typeof btn.focus === "function") {
      btn.focus({ preventScroll: true });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
}

async function refreshReplyOptions() {
  if (!isTvLayoutMode || !userId.value || !canReply.value) {
    replyOptions.value = [];
    optionsLoading.value = false;
    return;
  }
  const requestId = ++optionsRequestId;
  optionsLoading.value = true;
  replyOptions.value = [];
  try {
    const options = await getSoulMateReplyOptions(
      userId.value,
      targetLang.value,
      props.episodeId,
    );
    if (requestId !== optionsRequestId) return;
    replyOptions.value = Array.isArray(options)
      ? options.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
      : [];
    if (replyOptions.value.length < 2) {
      replyOptions.value = fallbackOptions();
    }
  } catch {
    if (requestId !== optionsRequestId) return;
    replyOptions.value = fallbackOptions();
  } finally {
    if (requestId !== optionsRequestId) return;
    // Unmount spinner first so option buttons exist before focusing.
    optionsLoading.value = false;
    await focusFirstReplyOption();
  }
}

async function submitMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || sending.value || !canReply.value) return;

  replyOptions.value = [];
  messages.value.push({ id: `local-${Date.now()}`, role: "user", content: trimmed });
  sending.value = true;
  await scrollBottom();
  try {
    const reply = await submitSoulMateTurn(
      userId.value,
      targetLang.value,
      props.episodeId,
      trimmed,
    );
    messages.value.push(reply);
  } catch {
    messages.value.push({
      id: `error-${Date.now()}`,
      role: "assistant",
      content: t("soulmate.replyFail"),
    });
  } finally {
    sending.value = false;
    await scrollBottom();
    if (isTvLayoutMode) await refreshReplyOptions();
  }
}

async function send() {
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  await submitMessage(text);
}

async function sendOption(option) {
  await submitMessage(option);
}
</script>

<style scoped>
.chat-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: linear-gradient(#fff8fb, var(--bg) 36%);
}

.chat-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.message-row { display: flex; max-width: 86%; }
.role-assistant { align-self: flex-start; }
.role-user { align-self: flex-end; }
.bubble {
  padding: 11px 14px;
  border-radius: 18px 18px 18px 5px;
  background: var(--surface);
  color: var(--text);
  font-size: 15px;
  line-height: 1.5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  white-space: pre-wrap;
  word-break: break-word;
}
.message-word {
  cursor: pointer;
  border-radius: 3px;
  user-select: text;
  -webkit-user-select: text;
}
.message-word:hover { background: var(--blue-bg); }
.message-word:focus-visible {
  outline: 2px solid var(--primary, #1cb0f6);
  background: var(--blue-bg, rgba(28, 176, 246, 0.15));
}
.role-user .bubble {
  border-radius: 18px 18px 5px 18px;
  background: #ff5d8f;
  color: #fff;
}
.input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px 12px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}
.input-bar input {
  flex: 1;
  min-width: 0;
  border: none;
  border-radius: 21px;
  background: var(--bg);
  color: var(--text);
  padding: 11px 15px;
  font: inherit;
  outline: none;
}
.input-bar button {
  border: none;
  border-radius: 18px;
  background: #ff5d8f;
  color: white;
  padding: 9px 15px;
  font: inherit;
  font-weight: 700;
}
.input-bar button:disabled { opacity: 0.45; }

.reply-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px 16px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  max-height: 48%;
  overflow-y: auto;
}
.options-hint {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-light);
}
.reply-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reply-option {
  border: 2px solid rgba(255, 93, 143, 0.4);
  border-radius: 14px;
  background: #fff8fb;
  color: var(--text);
  padding: 14px 16px;
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}
.reply-option:disabled { opacity: 0.45; cursor: default; }
.reply-option:focus,
.reply-option:focus-visible {
  outline: 3px solid #ff5d8f !important;
  outline-offset: 2px;
  background: #ffe8f0;
  box-shadow: none !important;
  transform: none !important;
}
.options-loading { padding: 8px 0 4px; }
.mini-typing { display: inline-flex; gap: 4px; }
.mini-typing i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-lighter);
  animation: blink 1.1s infinite alternate;
}
.mini-typing i:nth-child(2) { animation-delay: 0.2s; }
.mini-typing i:nth-child(3) { animation-delay: 0.4s; }

.chat-state { margin: auto; color: var(--text-lighter); }
.chat-state.error { color: var(--red); }
.typing { display: flex; gap: 4px; padding: 15px 18px; }
.typing i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-lighter);
  animation: blink 1.1s infinite alternate;
}
.typing i:nth-child(2) { animation-delay: 0.2s; }
.typing i:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  to { opacity: 0.25; transform: translateY(-2px); }
}

/* ——— TV: left transcript (~2/3) | right options (~1/3) ——— */
.tv-chat .chat-body {
  flex-direction: row;
  align-items: stretch;
  gap: 0;
  min-height: 0;
}

.tv-chat .message-list {
  flex: 2 1 0;
  min-width: 0;
  width: auto;
  padding: 20px 22px 24px;
  gap: 14px;
  border-right: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255, 248, 251, 0.5), transparent 40%);
}

.tv-chat .message-row {
  max-width: 94%;
}

.tv-chat .bubble {
  font-size: 18px;
  padding: 14px 18px;
  max-width: 100%;
}

.tv-chat .reply-panel {
  flex: 1 1 0;
  width: auto;
  min-width: 0;
  max-width: none;
  max-height: none;
  height: 100%;
  padding: 18px 16px 20px;
  border-top: none;
  border-left: none;
  gap: 12px;
  overflow-y: auto;
  background: var(--surface);
  box-shadow: -8px 0 24px rgba(40, 20, 30, 0.04);
}

.tv-chat .options-hint {
  font-size: 15px;
  line-height: 1.4;
}

.tv-chat .reply-options {
  gap: 12px;
  flex: 1;
}

.tv-chat .reply-option {
  font-size: 17px;
  padding: 16px 14px;
  min-height: 56px;
  width: 100%;
  box-sizing: border-box;
}
</style>
