<template>
  <div class="speaking-dialogue">
    <PageHeader
      :title="topicTitle"
      variant="news"
      :back-label="t('common.back')"
      @back="confirmExit"
    >
      <template #actions>
        <span class="turn-badge">{{ turn }}/{{ totalTurns }}</span>
      </template>
    </PageHeader>

    <div v-if="booting" class="state-box">{{ t('speaking.preparing') }}</div>
    <div v-else-if="bootError" class="state-box error">
      <p>{{ bootError }}</p>
      <button class="btn-secondary" @click="boot">{{ t('common.retry') }}</button>
    </div>

    <template v-else>
      <section class="ai-panel">
        <div class="ai-avatar" :class="{ speaking: ttsBusy }">
          <AmigaIcon :size="48" />
        </div>
        <p v-if="showAiText" class="ai-text">{{ aiText }}</p>
        <p v-else class="ai-hint">{{ t('speaking.listenPrompt') }}</p>
        <p v-if="translation" class="translation">{{ translation }}</p>
        <p v-if="hint" class="hint-box">{{ t('speaking.hintLabel') }}: {{ hint }}</p>
      </section>

      <section class="assist-row">
        <button class="assist-btn" :disabled="ttsBusy" @click="replayAi">{{ t('speaking.replay') }}</button>
        <button class="assist-btn" @click="toggleAiText">{{ showAiText ? t('speaking.hideText') : t('speaking.showText') }}</button>
        <button class="assist-btn" :disabled="assistBusy" @click="loadTranslation">{{ t('speaking.translate') }}</button>
        <button class="assist-btn" :disabled="assistBusy" @click="loadHint">{{ t('speaking.hint') }}</button>
      </section>

      <section v-if="lastScore" class="score-panel" :class="{ pass: lastScore.pass }">
        <p class="score-line">{{ t('speaking.youSaid') }}: {{ lastScore.transcript }}</p>
        <p class="score-line">{{ t('speaking.score') }}: {{ lastScore.total }}</p>
        <p v-if="lastScore.feedback" class="score-feedback">{{ lastScore.feedback }}</p>
        <p v-if="lastScore.feedback_target && !lastScore.pass" class="score-target">{{ lastScore.feedback_target }}</p>
        <p v-if="!lastScore.pass" class="retry-note">{{ t('speaking.retryNote') }}</p>
      </section>

      <section class="record-panel">
        <button
          class="record-btn"
          :class="{ recording: recording }"
          :disabled="scoring || ttsBusy"
          @click="toggleRecord"
        >
          {{ recording ? t('speaking.stopRecord') : t('speaking.startRecord') }}
        </button>
        <p v-if="scoring" class="record-status">{{ t('speaking.scoring') }}</p>
        <p v-else-if="actionError" class="record-error">{{ actionError }}</p>
      </section>

      <button class="finish-btn" :disabled="scoring" @click="finishEarly">
        {{ t('speaking.finishEarly') }}
      </button>
    </template>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import PageHeader from "@/shared/components/PageHeader.vue";
import AmigaIcon from "@/shared/components/AmigaIcon.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";
import { useAudioRecorder } from "@/shared/useAudioRecorder.js";
import { speakText, stopSpeech } from "@/shared/speechTts.js";
import {
  speakingStartSession,
  speakingScoreTurn,
  speakingHint,
  speakingTranslate,
  speakingFinish,
} from "@/shared/backend/speaking.js";

const props = defineProps({
  topicId: { type: String, required: true },
});

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const recorder = useAudioRecorder();

const booting = ref(true);
const bootError = ref("");
const sessionId = ref("");
const turn = ref(1);
const totalTurns = ref(8);
const aiText = ref("");
const showAiText = ref(false);
const translation = ref("");
const hint = ref("");
const usedHint = ref(false);
const ttsBusy = ref(false);
const recording = ref(false);
const scoring = ref(false);
const assistBusy = ref(false);
const actionError = ref("");
const lastScore = ref(null);
const targetLang = ref("es");
const nativeLang = ref("zh");

const topicTitle = computed(() => {
  const key = `speaking.topics.${props.topicId}`;
  const label = t(key);
  return label === key ? props.topicId : label;
});

boot();

async function boot() {
  booting.value = true;
  bootError.value = "";
  try {
    await targetLangStore.load();
    const ctx = await loadLearningContext({ targetLangStore, fallbackToFirstGoal: true });
    targetLang.value = ctx.targetLang || targetLangStore.code || "es";
    nativeLang.value = ctx.nativeLang || ctx.user?.native_language || "zh";
    const session = await speakingStartSession(
      ctx.user.id,
      props.topicId,
      targetLang.value,
      nativeLang.value,
      ctx.cefr || "A1",
    );
    sessionId.value = session.session_id;
    turn.value = session.turn;
    totalTurns.value = session.total_turns;
    aiText.value = session.ai_text;
  } catch (e) {
    bootError.value = e?.message || String(e);
  } finally {
    booting.value = false;
  }
  if (!bootError.value && aiText.value) {
    playAiLine();
  }
}

function playAiLine() {
  return new Promise((resolve) => {
    if (!aiText.value) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      ttsBusy.value = false;
      resolve();
    };
    speakText(aiText.value, targetLang.value, {
      onStart: () => { ttsBusy.value = true; },
      onEnd: finish,
    });
    const fallbackMs = Math.min(120_000, Math.max(15_000, aiText.value.length * 150));
    setTimeout(finish, fallbackMs);
  });
}

function replayAi() {
  actionError.value = "";
  playAiLine();
}

function toggleAiText() {
  showAiText.value = !showAiText.value;
}

async function loadTranslation() {
  assistBusy.value = true;
  actionError.value = "";
  try {
    translation.value = await speakingTranslate(sessionId.value);
  } catch (e) {
    actionError.value = e?.message || String(e);
  } finally {
    assistBusy.value = false;
  }
}

async function loadHint() {
  assistBusy.value = true;
  actionError.value = "";
  usedHint.value = true;
  try {
    hint.value = await speakingHint(sessionId.value);
    speakText(hint.value, targetLang.value);
  } catch (e) {
    actionError.value = e?.message || String(e);
  } finally {
    assistBusy.value = false;
  }
}

async function toggleRecord() {
  actionError.value = "";
  if (recording.value) {
    recording.value = false;
    scoring.value = true;
    try {
      const audio = await recorder.stop();
      const result = await speakingScoreTurn(
        sessionId.value,
        audio.base64,
        audio.format,
        usedHint.value,
      );
      lastScore.value = result;
      if (result.pass) {
        translation.value = "";
        hint.value = "";
        usedHint.value = false;
        showAiText.value = false;
        if (result.completed) {
          await goSummary();
          return;
        }
        if (result.next_ai_text) {
          aiText.value = result.next_ai_text;
          turn.value = result.turn;
          await playAiLine();
        }
      }
    } catch (e) {
      actionError.value = e?.message || String(e);
    } finally {
      scoring.value = false;
    }
    return;
  }

  try {
    stopSpeech();
    await recorder.start();
    recording.value = true;
    lastScore.value = null;
  } catch (e) {
    actionError.value = e?.message || String(e);
  }
}

async function finishEarly() {
  await goSummary();
}

async function goSummary() {
  router.replace({
    name: "speaking-summary",
    params: { topicId: props.topicId },
    query: { sessionId: sessionId.value },
  });
}

function confirmExit() {
  router.push({ name: "speaking" });
}

onBeforeUnmount(() => {
  stopSpeech();
  recorder.cancel();
});
</script>

<style scoped>
.speaking-dialogue {
  min-height: 100%;
  background: var(--bg);
  padding-bottom: 24px;
}

.turn-badge {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-light);
}

.state-box {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-light);
}

.state-box.error {
  color: var(--red);
}

.ai-panel {
  margin: 16px;
  padding: 20px 16px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid var(--border);
  text-align: center;
}

.ai-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  margin-bottom: 12px;
}

.ai-avatar.speaking {
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  50% { transform: scale(1.06); }
}

.ai-text,
.ai-hint {
  margin: 0;
  font-size: 18px;
  line-height: 1.5;
  color: var(--text);
}

.ai-hint {
  color: var(--text-light);
  font-size: 15px;
}

.translation,
.hint-box {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--text-light);
  line-height: 1.4;
}

.hint-box {
  color: var(--blue);
}

.assist-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 0 16px;
}

.assist-btn {
  padding: 10px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--white);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.assist-btn:disabled {
  opacity: 0.5;
}

.score-panel {
  margin: 16px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: #fff5f5;
  border: 1px solid #ffc9c9;
}

.score-panel.pass {
  background: var(--green-bg);
  border-color: #b8e986;
}

.score-line,
.score-feedback,
.score-target,
.retry-note {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 1.4;
}

.record-panel {
  padding: 16px;
  text-align: center;
}

.record-btn {
  width: 100%;
  max-width: 280px;
  padding: 16px;
  border: none;
  border-radius: 999px;
  background: var(--green);
  color: var(--white);
  font-size: 16px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.record-btn.recording {
  background: var(--red);
}

.record-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.record-status,
.record-error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--text-light);
}

.record-error {
  color: var(--red);
}

.finish-btn {
  display: block;
  margin: 0 auto;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: var(--text-light);
  font-family: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.btn-secondary {
  margin-top: 12px;
  padding: 10px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--white);
  font-family: inherit;
  cursor: pointer;
}
</style>
