<template>
  <div class="speaking-dialogue">
    <PageHeader
      :title="topicTitle"
      variant="news"
      :back-label="t('common.back')"
      @back="confirmExit"
    >
      <template #actions>
        <span class="voice-badge">🎙️ {{ voiceName }}</span>
      </template>
    </PageHeader>

    <div v-if="booting" class="state-box">{{ t('speaking.preparing') }}</div>
    <div v-else-if="bootError" class="state-box error">
      <p>{{ bootError }}</p>
      <button class="btn-secondary" @click="boot">{{ t('common.retry') }}</button>
    </div>

    <template v-else>
      <!-- Top Scenario Micro-Goals Bar -->
      <section class="goals-bar">
        <div class="goals-header">
          <div class="goals-title-row">
            <span class="goals-icon">🎯</span>
            <span class="goals-title">{{ t('speaking.goalsTitle') }}</span>
          </div>
          <span class="goals-counter">
            {{ live.completedGoalIndices.value.length }}/{{ goalKeys.length }}
          </span>
        </div>

        <div class="goals-chips">
          <div
            v-for="(k, idx) in goalKeys"
            :key="k"
            class="goal-chip"
            :class="{ done: live.completedGoalIndices.value.includes(idx) }"
          >
            <span class="chip-status">
              {{ live.completedGoalIndices.value.includes(idx) ? '✓' : idx + 1 }}
            </span>
            <span class="chip-text">{{ getGoalText(k) }}</span>
          </div>
        </div>

        <div v-if="allGoalsDone" class="goals-celebration">
          🎉 {{ t('speaking.goalsAllDone') }}
        </div>
      </section>

      <!-- Live Voice Stage & Avatar -->
      <section class="live-stage">
        <div
          class="avatar-wrapper"
          :class="{
            'ai-talking': live.isAiSpeaking.value,
            'user-talking': !live.isMicMuted.value && live.userAudioLevel.value > 0.05,
          }"
        >
          <div class="halo halo-outer" :style="haloStyle" />
          <div class="halo halo-inner" />
          <div class="avatar-core">
            <AmigaIcon :size="52" />
          </div>
        </div>

        <div class="stage-status">
          <div class="status-indicator">
            <span
              class="status-dot"
              :class="{
                speaking: live.isAiSpeaking.value,
                muted: live.isMicMuted.value,
                active: !live.isMicMuted.value && !live.isAiSpeaking.value,
              }"
            />
            <span class="status-text">{{ stageStatusText }}</span>
          </div>

          <button
            v-if="live.isAiSpeaking.value"
            class="interrupt-btn"
            @click="live.interruptAi()"
          >
            🛑 {{ t('speaking.interruptAi') }}
          </button>
        </div>

        <!-- Missing / Invalid API Key Banner -->
        <div v-if="showConfigBanner" class="config-banner">
          <p class="config-prompt">{{ t('speaking.configureLiveKeyPrompt') }}</p>
          <button class="btn-config" @click="goToConfig">
            {{ t('speaking.goConfigure') }}
          </button>
        </div>
      </section>

      <!-- Streaming Conversation Timeline -->
      <section class="chat-stream">
        <div
          v-for="msg in displayMessages"
          :key="msg.id"
          class="chat-bubble-row"
          :class="msg.role"
        >
          <!-- AI Bubble -->
          <div v-if="msg.role === 'ai'" class="ai-bubble">
            <div class="bubble-content">
              <p class="bubble-text">{{ msg.text }}</p>
              <p v-if="msg.translation" class="bubble-translation">
                {{ msg.translation }}
              </p>
            </div>

            <div class="bubble-actions">
              <button
                class="pill-action-btn"
                :title="t('speaking.replay')"
                @click="replayAiMessage(msg)"
              >
                🔊 {{ t('speaking.replay') }}
              </button>
              <button
                class="pill-action-btn"
                :disabled="assistBusy"
                :title="t('speaking.translate')"
                @click="translateBubble(msg)"
              >
                🌐 {{ t('speaking.translate') }}
              </button>
            </div>
          </div>

          <!-- User Bubble -->
          <div v-else class="user-bubble">
            <div class="bubble-content">
              <p class="bubble-text">{{ msg.text }}</p>
            </div>

            <!-- Silent Coaching Pill -->
            <div v-if="msg.coaching" class="coaching-pill">
              <div v-if="typeof msg.coaching.total === 'number'" class="coaching-score-badge">
                ★ {{ msg.coaching.total }}
              </div>
              <div v-if="msg.coaching.betterExpression" class="better-expression">
                <span class="better-text">
                  💡 {{ t('speaking.betterWay') }}: {{ msg.coaching.betterExpression }}
                </span>
                <button
                  class="speaker-icon-btn"
                  @click="playPhrase(msg.coaching.betterExpression)"
                >
                  🔊
                </button>
              </div>
              <p v-if="msg.coaching.tipNative" class="tip-native">
                {{ msg.coaching.tipNative }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Scaffolding & Rescue Bar -->
      <section class="assist-dock">
        <div class="rescue-chips">
          <button
            class="rescue-chip hint"
            :disabled="assistBusy"
            @click="loadHint"
          >
            💡 {{ t('speaking.hint') }}
          </button>
          <button
            class="rescue-chip"
            @click="askSlowDown"
          >
            🐢 {{ t('speaking.rescueSlowDown') }}
          </button>
          <button
            class="rescue-chip rescue"
            @click="askRescue"
          >
            🆘 {{ t('speaking.rescueHelpMe') }}
          </button>
        </div>

        <div v-if="hint" class="hint-box">
          <div class="hint-header">
            <span class="hint-title">{{ t('speaking.hintLabel') }}</span>
            <div class="hint-actions">
              <button class="hint-play-btn" @click="playPhrase(hint)">🔊</button>
              <button class="hint-close-btn" @click="hint = ''">×</button>
            </div>
          </div>
          <p class="hint-text">{{ hint }}</p>
        </div>

        <p v-if="actionError" class="action-error">{{ actionError }}</p>
      </section>

      <!-- Bottom Hands-Free Control Bar -->
      <footer class="control-bar">
        <button
          class="mic-toggle-btn"
          :class="{ muted: live.isMicMuted.value, active: !live.isMicMuted.value }"
          @click="live.toggleMute()"
        >
          <span class="mic-icon">{{ live.isMicMuted.value ? '🔇' : '🎙️' }}</span>
          <span class="wave-container" :class="{ running: !live.isMicMuted.value }">
            <span class="wave-bar b1" />
            <span class="wave-bar b2" />
            <span class="wave-bar b3" />
            <span class="wave-bar b4" />
          </span>
          <span class="mic-label">
            {{ live.isMicMuted.value ? t('speaking.resumeSpeaking') : t('speaking.pauseToThink') }}
          </span>
        </button>

        <button class="finish-btn" @click="finishEarly">
          {{ t('speaking.finishEarly') }}
        </button>
      </footer>
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
import { speakText, stopSpeech } from "@/shared/speechTts.js";
import { useGeminiLiveSession } from "./useGeminiLiveSession.js";
import { saveLiveSessionSnapshot } from "./liveSessionCache.js";
import {
  speakingStartSession,
  speakingRecordLiveTurn,
  speakingHint,
  speakingTranslate,
} from "@/shared/api.js";

const props = defineProps({
  topicId: { type: String, required: true },
});

const { t } = useI18n();
const router = useRouter();
const targetLangStore = useTargetLangStore();

const live = useGeminiLiveSession();

const booting = ref(true);
const bootError = ref("");
const sessionId = ref("");
const voiceName = ref("Aoede");
const goalKeys = ref(["g1", "g2", "g3"]);
const initialOpeningLine = ref("");
const initialTranslation = ref("");
const hint = ref("");
const usedHint = ref(false);
const assistBusy = ref(false);
const actionError = ref("");
const sessionData = ref(null);
const targetLang = ref("es");
const nativeLang = ref("zh");

const topicTitle = computed(() => {
  const key = `speaking.topics.${props.topicId}`;
  const label = t(key);
  return label === key ? props.topicId : label;
});

const allGoalsDone = computed(() => {
  return (
    goalKeys.value.length > 0 &&
    live.completedGoalIndices.value.length >= goalKeys.value.length
  );
});

const showConfigBanner = computed(() => {
  if (live.status.value === "error") return true;
  const key = sessionData.value?.live_api_key || "";
  const base = sessionData.value?.live_base_url || "";
  if (!key) return true;
  if (key.startsWith("nvapi-") && (!base || base.includes("generativelanguage.googleapis.com"))) {
    return true;
  }
  return false;
});

const stageStatusText = computed(() => {
  if (live.status.value === "connecting") {
    return t("speaking.connectingLive");
  }
  if (live.isAiSpeaking.value) {
    return t("speaking.aiSpeaking");
  }
  if (live.isMicMuted.value) {
    return t("speaking.micMutedState");
  }
  return t("speaking.listeningHandsFree");
});

const displayMessages = computed(() => {
  if (live.messages.value && live.messages.value.length > 0) {
    return live.messages.value;
  }
  if (initialOpeningLine.value) {
    return [
      {
        id: "initial-opening",
        role: "ai",
        text: initialOpeningLine.value,
        translation: initialTranslation.value || "",
        audioChunks: [],
      },
    ];
  }
  return [];
});

const latestAiText = computed(() => {
  for (let i = displayMessages.value.length - 1; i >= 0; i--) {
    if (displayMessages.value[i].role === "ai" && displayMessages.value[i].text) {
      return displayMessages.value[i].text;
    }
  }
  return initialOpeningLine.value || "";
});

const haloStyle = computed(() => {
  const level = live.isAiSpeaking.value
    ? live.aiAudioLevel.value
    : live.userAudioLevel.value;
  const scale = 1 + Math.min(0.5, Math.max(0, level * 0.6));
  return { transform: `scale(${scale})` };
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
    sessionData.value = session;
    sessionId.value = session.session_id;
    voiceName.value = session.voice_name || "Aoede";
    goalKeys.value = session.goals?.length ? session.goals : ["g1", "g2", "g3"];
    initialOpeningLine.value = session.ai_text || "";

    const goalTexts = goalKeys.value
      .map((k, idx) => `${idx}: ${getGoalText(k)}`)
      .join("\n");
    const fullSystemInstruction =
      (session.system_instruction || "") +
      `\n\nScenario Micro-Goals (indices 0, 1, 2):\n${goalTexts}`;

    live.connect({
      apiKey: session.live_api_key,
      baseUrl: session.live_base_url,
      model: session.live_model || "gemini-3.8-live",
      voiceName: voiceName.value,
      systemInstruction: fullSystemInstruction,
      openingLine: session.ai_text,
      onTurnRecorded: handleTurnRecorded,
    });

    if (session.ai_text) {
      speakText(session.ai_text, targetLang.value);
    }
  } catch (e) {
    bootError.value = e?.message || String(e);
  } finally {
    booting.value = false;
  }
}

async function handleTurnRecorded(turnData) {
  try {
    await speakingRecordLiveTurn({
      session_id: sessionId.value,
      ai_text: turnData.aiText || "",
      user_transcript: turnData.userTranscript || "",
      relevance: turnData.relevanceScore ?? 0,
      grammar: turnData.grammarScore ?? 0,
      pronunciation: turnData.pronunciationScore ?? 0,
      better_expression: turnData.betterExpression || null,
      tip_native: turnData.tipNative || null,
      completed_goal_indices: turnData.completedGoalIndices || [],
      used_hint: usedHint.value,
    });
  } catch (err) {
    console.warn("speakingRecordLiveTurn error:", err);
  }
}

function getGoalText(k) {
  const key = `speaking.goals.${props.topicId}.${k}`;
  const val = t(key);
  return val === key ? k : val;
}

function replayAiMessage(msg) {
  if (msg.audioChunks && msg.audioChunks.length > 0) {
    live.replayMessageAudio(msg);
  } else if (msg.text) {
    speakText(msg.text, targetLang.value);
  }
}

async function translateBubble(msg) {
  if (msg.translation) {
    msg.translation = "";
    if (msg.id === "initial-opening") {
      initialTranslation.value = "";
    }
    return;
  }
  assistBusy.value = true;
  actionError.value = "";
  try {
    const text = msg.text || "";
    const res = await speakingTranslate(sessionId.value, text);
    msg.translation = res;
    if (msg.id === "initial-opening") {
      initialTranslation.value = res;
    }
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
    const res = await speakingHint(sessionId.value, latestAiText.value);
    hint.value = res;
    speakText(res, targetLang.value);
  } catch (e) {
    actionError.value = e?.message || String(e);
  } finally {
    assistBusy.value = false;
  }
}

function askSlowDown() {
  live.sendTextPrompt("Could you please repeat that more slowly and simply?");
}

function askRescue() {
  live.sendTextPrompt(
    "I'm not sure how to reply. Could you give me a simple example sentence in the target language and help me continue?",
  );
}

function playPhrase(phrase) {
  if (!phrase) return;
  speakText(phrase, targetLang.value);
}

function goToConfig() {
  router.push({ path: "/profile/multimodal-config" });
}

async function finishEarly() {
  stopSpeech();

  const coachingItems = displayMessages.value
    .filter(
      (m) =>
        m.role === "user" &&
        m.coaching &&
        (m.coaching.betterExpression || m.coaching.tipNative),
    )
    .map((m) => ({
      youSaid: m.text,
      betterExpression: m.coaching.betterExpression || "",
      tipNative: m.coaching.tipNative || "",
      score: m.coaching.total ?? null,
    }));

  saveLiveSessionSnapshot(sessionId.value, {
    turnCount: live.turnCount.value,
    completedGoalsCount: live.completedGoalIndices.value.length,
    totalGoalsCount: goalKeys.value.length,
    averageScore: live.averageScore.value,
    coachingItems,
  });

  try {
    await live.disconnect();
  } catch (e) {}

  router.replace({
    name: "speaking-summary",
    params: { topicId: props.topicId },
    query: { sessionId: sessionId.value },
  });
}

function confirmExit() {
  stopSpeech();
  try {
    live.disconnect();
  } catch (e) {}
  router.push({ name: "speaking" });
}

onBeforeUnmount(() => {
  stopSpeech();
  try {
    live.disconnect();
  } catch (e) {}
});
</script>

<style scoped>
.speaking-dialogue {
  min-height: 100%;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  padding-bottom: 16px;
  position: relative;
}

.voice-badge {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.state-box {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-light);
}

.state-box.error {
  color: var(--red);
}

/* Goals Bar */
.goals-bar {
  margin: 10px 14px 6px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid var(--border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.goals-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.goals-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.goals-icon {
  font-size: 14px;
}

.goals-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.2px;
}

.goals-counter {
  font-size: 12px;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 2px 8px;
  border-radius: 999px;
}

.goals-chips {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.goal-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 12px;
  color: #475569;
  transition: all 0.2s ease;
}

.goal-chip.done {
  background: #f0fdf4;
  border-color: #86efac;
  color: #15803d;
}

.chip-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.goal-chip.done .chip-status {
  background: #22c55e;
  color: #ffffff;
}

.chip-text {
  flex: 1;
  line-height: 1.35;
}

.goals-celebration {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #dcfce7;
  color: #15803d;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
}

/* Live Stage */
.live-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 8px;
}

.avatar-wrapper {
  position: relative;
  width: 68px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.halo {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  transition: transform 0.15s ease-out;
}

.halo-outer {
  width: 76px;
  height: 76px;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0) 70%);
}

.avatar-wrapper.ai-talking .halo-outer {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(59, 130, 246, 0) 75%);
  animation: ai-pulse 1.2s infinite ease-in-out;
}

.avatar-wrapper.user-talking .halo-outer {
  background: radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, rgba(16, 185, 129, 0) 75%);
}

@keyframes ai-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.18);
    opacity: 1;
  }
}

.avatar-core {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.status-dot.active {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
}

.status-dot.speaking {
  background: #3b82f6;
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.6);
}

.status-dot.muted {
  background: #f59e0b;
}

.status-text {
  font-size: 12px;
  color: var(--text-light);
}

.interrupt-btn {
  padding: 3px 8px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #dc2626;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* Config Banner */
.config-banner {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: #fffbeb;
  border: 1px solid #fde68a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  max-width: 440px;
}

.config-prompt {
  margin: 0;
  font-size: 12px;
  color: #92400e;
  line-height: 1.3;
}

.btn-config {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: #f59e0b;
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

/* Chat Stream */
.chat-stream {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px 14px;
  overflow-y: auto;
}

.chat-bubble-row {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.chat-bubble-row.ai {
  align-items: flex-start;
}

.chat-bubble-row.user {
  align-items: flex-end;
}

.ai-bubble {
  max-width: 88%;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 14px 14px 14px 2px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.user-bubble {
  max-width: 88%;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 14px 14px 2px 14px;
  padding: 12px 14px;
}

.bubble-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.45;
  color: var(--text);
  word-break: break-word;
}

.bubble-translation {
  margin: 8px 0 0;
  padding-top: 6px;
  border-top: 1px dashed var(--border);
  font-size: 13px;
  color: var(--text-light);
  line-height: 1.4;
}

.bubble-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.pill-action-btn {
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.pill-action-btn:active {
  background: #e2e8f0;
}

/* Coaching Pill */
.coaching-pill {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  font-size: 12px;
  width: 100%;
}

.coaching-score-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: #059669;
  background: #d1fae5;
  padding: 1px 6px;
  border-radius: 999px;
  margin-bottom: 4px;
}

.better-expression {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  color: #0f766e;
  font-weight: 600;
}

.better-text {
  flex: 1;
}

.speaker-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}

.tip-native {
  margin: 4px 0 0;
  font-size: 11px;
  color: #64748b;
  line-height: 1.35;
}

/* Assist Dock */
.assist-dock {
  padding: 6px 14px 10px;
}

.rescue-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.rescue-chip {
  flex-shrink: 0;
  padding: 7px 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--white);
  color: #334155;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.rescue-chip.hint {
  border-color: #cbd5e1;
}

.rescue-chip.rescue {
  border-color: #fed7aa;
  background: #fffaf5;
}

.rescue-chip:active {
  background: #f1f5f9;
}

.hint-box {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.hint-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.hint-title {
  font-size: 12px;
  font-weight: 700;
  color: #166534;
}

.hint-actions {
  display: flex;
  gap: 4px;
}

.hint-play-btn,
.hint-close-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  color: #166534;
}

.hint-text {
  margin: 0;
  font-size: 14px;
  color: #14532d;
  line-height: 1.4;
}

.action-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--red);
}

/* Bottom Hands-Free Control Bar */
.control-bar {
  position: sticky;
  bottom: 0;
  width: 100%;
  box-sizing: border-box;
  max-width: 480px;
  margin: 0 auto;
  padding: 10px 16px 14px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 100;
}

.mic-toggle-btn {
  width: 100%;
  max-width: 320px;
  padding: 12px 18px;
  border: none;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 700;
  font-size: 15px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.mic-toggle-btn.active {
  background: var(--green);
  color: var(--white);
}

.mic-toggle-btn.muted {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.wave-container {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 14px;
}

.wave-bar {
  width: 3px;
  height: 6px;
  background: currentColor;
  border-radius: 2px;
  opacity: 0.8;
}

.wave-container.running .b1 {
  animation: wave 1s infinite ease-in-out 0s;
}

.wave-container.running .b2 {
  animation: wave 1s infinite ease-in-out 0.2s;
}

.wave-container.running .b3 {
  animation: wave 1s infinite ease-in-out 0.4s;
}

.wave-container.running .b4 {
  animation: wave 1s infinite ease-in-out 0.1s;
}

@keyframes wave {
  0%, 100% {
    height: 4px;
  }
  50% {
    height: 14px;
  }
}

.mic-label {
  font-size: 14px;
}

.finish-btn {
  border: none;
  background: transparent;
  color: var(--text-light);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 4px 8px;
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
