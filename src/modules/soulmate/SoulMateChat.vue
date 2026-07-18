<template>
  <div class="chat-page">
    <PageHeader :title="chatTitle" />
    <main ref="messageList" class="message-list">
      <div v-if="loading" class="chat-state">{{ t("app.loading") }}</div>
      <div v-else-if="loadError" class="chat-state error">{{ loadError }}</div>
      <template v-else>
        <div v-for="message in messages" :key="message.id" class="message-row" :class="`role-${message.role}`">
          <div class="bubble">
            <template v-for="(token, tokenIndex) in messageTokens(message)" :key="tokenIndex">
              <span v-if="token.isWord" class="message-word" @click.stop="onWordTap(token)">{{ token.text }}</span>
              <span v-else>{{ token.text }}</span>
            </template>
          </div>
        </div>
        <div v-if="sending" class="message-row role-assistant"><div class="bubble typing"><i/><i/><i/></div></div>
      </template>
    </main>
    <form class="input-bar" @submit.prevent="send">
      <input
        v-model="input"
        :placeholder="t('soulmate.chatPlaceholder')"
        :disabled="sending || loading"
        maxlength="1000"
        @focus="rememberScrollAnchor"
      />
      <button type="submit" :disabled="!input.trim() || sending">{{ t("soulmate.send") }}</button>
    </form>

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
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import WordPopup from "@/shared/components/WordPopup.vue";
import { tokenizeArticleText } from "@/shared/articleText.js";
import { useI18n, getLocale } from "@/shared/i18n";
import { loadLearningContext } from "@/shared/learningContext.js";
import { getSoulMateChat, getSoulMateHome, submitSoulMateTurn } from "@/shared/backend/soulmate.js";
import {
  addDiscoveredWord,
  lookupWordIds,
  updateWordMastery,
} from "@/shared/backend/vocabulary.js";

const props = defineProps({ episodeId: { type: String, required: true } });
const { t } = useI18n();
const messages = ref([]);
const input = ref("");
const loading = ref(true);
const sending = ref(false);
const loadError = ref("");
const userId = ref("");
const targetLang = ref("es");
const companionName = ref("");
const selectedWord = ref(null);
const messageList = ref(null);
const chatTitle = computed(() => t("soulmate.chatTitle", { name: companionName.value || t("soulmate.title") }));
let fullViewportHeight = 0;
let keyboardOpen = false;
let bottomOffset = 0;

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

onMounted(async () => {
  const viewport = getVisualViewport();
  if (viewport) {
    fullViewportHeight = viewport.height;
    viewport.addEventListener("resize", onViewportResize);
  }
  try {
    const context = await loadLearningContext({ fallbackToFirstGoal: true });
    userId.value = context.user?.id || "";
    targetLang.value = context.targetLang || "es";
    const home = await getSoulMateHome(userId.value, targetLang.value);
    companionName.value = home.world?.companion_name || "";
    messages.value = await getSoulMateChat(userId.value, targetLang.value, props.episodeId);
  } catch (e) {
    loadError.value = e?.message || t("soulmate.chatLoadFail");
  } finally {
    loading.value = false;
    await scrollBottom();
  }
});

onUnmounted(() => {
  getVisualViewport()?.removeEventListener("resize", onViewportResize);
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
    // Translation remains usable even when vocabulary tracking is unavailable.
  }
}

async function scrollBottom() {
  await nextTick();
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight;
}

async function send() {
  const text = input.value.trim();
  if (!text || sending.value) return;
  input.value = "";
  const optimistic = { id: `local-${Date.now()}`, role: "user", content: text };
  messages.value.push(optimistic);
  sending.value = true;
  await scrollBottom();
  try {
    const reply = await submitSoulMateTurn(userId.value, targetLang.value, props.episodeId, text);
    messages.value.push(reply);
  } catch {
    messages.value.push({ id: `error-${Date.now()}`, role: "assistant", content: t("soulmate.replyFail") });
  } finally {
    sending.value = false;
    await scrollBottom();
  }
}
</script>

<style scoped>
.chat-page { height: 100%; min-height: 0; display: flex; flex-direction: column; background: linear-gradient(#fff8fb, var(--bg) 36%); }
.message-list { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 16px; display: flex; flex-direction: column; gap: 11px; }
.message-row { display: flex; max-width: 86%; }
.role-assistant { align-self: flex-start; }
.role-user { align-self: flex-end; }
.bubble { padding: 11px 14px; border-radius: 18px 18px 18px 5px; background: var(--surface); color: var(--text); font-size: 15px; line-height: 1.5; box-shadow: 0 2px 8px rgba(0,0,0,.05); white-space: pre-wrap; word-break: break-word; }
.message-word { cursor: pointer; border-radius: 3px; user-select: text; -webkit-user-select: text; -webkit-tap-highlight-color: transparent; }
.message-word:hover { background: var(--blue-bg); }
.role-user .bubble { border-radius: 18px 18px 5px 18px; background: #ff5d8f; color: #fff; }
/* AppShell owns the bottom safe-area strip, including the Android IME inset.
 * Adding --safe-bottom here would reserve it twice and push the input upward. */
.input-bar { display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding: 10px 12px; background: var(--surface); border-top: 1px solid var(--border); }
.input-bar input { flex: 1; min-width: 0; border: none; border-radius: 21px; background: var(--bg); color: var(--text); padding: 11px 15px; font: inherit; outline: none; }
.input-bar button { border: none; border-radius: 18px; background: #ff5d8f; color: white; padding: 9px 15px; font: inherit; font-weight: 700; }
.input-bar button:disabled { opacity: .45; }
.chat-state { margin: auto; color: var(--text-lighter); }
.chat-state.error { color: var(--red); }
.typing { display: flex; gap: 4px; padding: 15px 18px; }
.typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--text-lighter); animation: blink 1.1s infinite alternate; }
.typing i:nth-child(2) { animation-delay: .2s; }
.typing i:nth-child(3) { animation-delay: .4s; }
@keyframes blink { to { opacity: .25; transform: translateY(-2px); } }
</style>
