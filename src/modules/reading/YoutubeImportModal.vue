<template>
  <div v-if="show" class="modal-backdrop" @click.self="onBackdropClick">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">{{ t('reading.importModalTitle') }}</h3>
        <button class="close-btn" :disabled="step === 3 && isProcessing" @click="close">×</button>
      </div>

      <!-- Step Indicator -->
      <div class="step-indicator">
        <div class="step-item" :class="{ active: step === 1, done: step > 1 }">
          <span class="step-num">1</span>
          <span class="step-text">{{ t('reading.stepUrl') }}</span>
        </div>
        <div class="step-line" :class="{ filled: step > 1 }" />
        <div class="step-item" :class="{ active: step === 2, done: step > 2 }">
          <span class="step-num">2</span>
          <span class="step-text">{{ t('reading.stepPreview') }}</span>
        </div>
        <div class="step-line" :class="{ filled: step > 2 }" />
        <div class="step-item" :class="{ active: step === 3, done: isCompleted }">
          <span class="step-num">3</span>
          <span class="step-text">{{ t('reading.stepProgress') }}</span>
        </div>
      </div>

      <!-- Step 1: Input URL -->
      <div v-if="step === 1" class="step-content">
        <div class="input-row">
          <input
            v-model="videoUrl"
            type="text"
            class="url-input"
            :placeholder="t('reading.urlPlaceholder')"
            @keydown.enter="parseUrl"
          />
          <button class="btn-paste" type="button" @click="pasteClipboard">
            {{ t('reading.pasteFromClipboard') }}
          </button>
        </div>

        <p v-if="parseError" class="error-msg">{{ parseError }}</p>

        <div class="modal-footer">
          <button class="btn-secondary" @click="close">{{ t('common.cancel') }}</button>
          <button class="btn-primary" :disabled="!videoUrl.trim() || parsing" @click="parseUrl">
            {{ parsing ? t('common.loading') : t('reading.nextStep') }}
          </button>
        </div>
      </div>

      <!-- Step 2: Preview & Validation -->
      <div v-else-if="step === 2" class="step-content">
        <div v-if="meta" class="preview-box">
          <div class="preview-row">
            <span class="label">{{ t('reading.videoTitle') }}:</span>
            <span class="val strong">{{ meta.title }}</span>
          </div>
          <div v-if="meta.channel" class="preview-row">
            <span class="label">{{ t('reading.channel') }}:</span>
            <span class="val">{{ meta.channel }}</span>
          </div>
          <div v-if="meta.duration_sec != null" class="preview-row">
            <span class="label">{{ t('reading.duration') }}:</span>
            <span class="val">{{ formatDuration(meta.duration_sec) }}</span>
          </div>
          <div v-if="meta.filesize_approx_mb != null" class="preview-row">
            <span class="label">{{ t('reading.approxAudioSize') }}:</span>
            <span class="val">~{{ meta.filesize_approx_mb.toFixed(1) }} MB</span>
          </div>
          <div class="preview-row">
            <span class="label">{{ t('reading.subtitleSource') }}:</span>
            <span class="val" :class="{ 'text-success': meta.has_manual_subtitles, 'text-warning': meta.has_auto_captions && !meta.has_manual_subtitles, 'text-danger': !hasSubtitles }">
              {{ subtitleSourceText }}
            </span>
          </div>
        </div>

        <p v-if="!hasSubtitles" class="warning-banner">
          ⚠️ {{ t('reading.noSubtitleWarning') }}
        </p>

        <div class="tools-row">
          <button class="btn-link" :disabled="updatingComponent" @click="handleUpdateYtdlp">
            {{ updatingComponent ? t('reading.updatingYtdlp') : t('reading.updateYtdlp') }}
          </button>
          <span v-if="updateStatus" class="update-status">{{ updateStatus }}</span>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="step = 1">{{ t('common.back') }}</button>
          <button class="btn-primary" :disabled="!hasSubtitles" @click="startImportProcess">
            {{ t('reading.startImport') }}
          </button>
        </div>
      </div>

      <!-- Step 3: Progress & Cancellation -->
      <div v-else-if="step === 3" class="step-content">
        <div class="progress-box">
          <div class="phase-badge">{{ currentPhaseText }}</div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }" />
          </div>
          <div class="progress-info">
            <span>{{ progressPercent.toFixed(0) }}%</span>
            <span v-if="speedText">{{ speedText }}</span>
          </div>
          <p class="status-msg">{{ progressMsg }}</p>
        </div>

        <div class="modal-footer">
          <button
            v-if="!isCompleted && !importFailed"
            class="btn-danger"
            @click="cancelImportProcess"
          >
            {{ t('reading.cancelImport') }}
          </button>
          <button
            v-else-if="importFailed"
            class="btn-secondary"
            @click="step = 2"
          >
            {{ t('reading.retry') }}
          </button>
          <button
            v-else
            class="btn-primary"
            @click="onSuccessClose"
          >
            {{ t('common.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "@/shared/i18n";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import {
  fetchYoutubeMetadata,
  startYoutubeImport,
  getYoutubeImportProgress,
  cancelYoutubeImport,
  updateYtdlp,
} from "@/shared/backend/reading.js";

const props = defineProps({
  show: Boolean,
  userId: String,
  targetLang: String,
  cefrLevel: String,
});

const emit = defineEmits(["close", "imported"]);

const { t } = useI18n();

const step = ref(1);
const videoUrl = ref("");
const parsing = ref(false);
const parseError = ref("");
const meta = ref(null);

const updatingComponent = ref(false);
const updateStatus = ref("");

const taskId = ref("");
const isProcessing = ref(false);
const isCompleted = ref(false);
const importFailed = ref(false);
const currentPhase = ref("analyzing");
const progressPercent = ref(0);
const progressSpeed = ref(null);
const progressMsg = ref("");

let unlistenProgress = null;

const hasSubtitles = computed(() => {
  return !!(meta.value?.has_manual_subtitles || meta.value?.has_auto_captions);
});

const subtitleSourceText = computed(() => {
  if (meta.value?.has_manual_subtitles) return t("reading.manualSubtitle");
  if (meta.value?.has_auto_captions) return t("reading.autoSubtitle");
  return t("reading.noSubtitleWarning");
});

const currentPhaseText = computed(() => {
  switch (currentPhase.value) {
    case "analyzing": return t("reading.phaseAnalyzing");
    case "subtitles": return t("reading.phaseSubtitles");
    case "audio": return t("reading.phaseAudio");
    case "saving": return t("reading.phaseSaving");
    case "completed": return t("reading.phaseCompleted");
    default: return "";
  }
});

const speedText = computed(() => {
  if (progressSpeed.value != null && progressSpeed.value > 0) {
    return `${progressSpeed.value.toFixed(1)} MB/s`;
  }
  return "";
});

onMounted(async () => {
  try {
    const isTauriEnv = typeof isTauri === "function" ? isTauri() : !!isTauri;
    if (isTauriEnv) {
      unlistenProgress = await listen(
        "youtube-import-progress",
        (event) => {
          const payload = event.payload;
          if (payload && (!taskId.value || payload.task_id === taskId.value)) {
            handleProgressEvent(payload);
          }
        }
      );
    }
  } catch (e) {
    console.warn("Could not attach Tauri progress listener:", e);
  }
});

let pollTimer = null;

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling(tId) {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!isProcessing.value || !tId) {
      stopPolling();
      return;
    }
    try {
      const res = await getYoutubeImportProgress(tId);
      if (res && res.task_id === tId) {
        handleProgressEvent(res);
      }
    } catch {
      // ignore
    }
  }, 400);
}

onBeforeUnmount(() => {
  stopPolling();
  if (unlistenProgress) {
    unlistenProgress();
    unlistenProgress = null;
  }
});

function handleProgressEvent(payload) {
  currentPhase.value = payload.phase;
  progressPercent.value = Math.max(0, Math.min(100, payload.percent || 0));
  progressSpeed.value = payload.speed_mb_s;
  progressMsg.value = payload.message || "";

  if (payload.phase === "completed") {
    isCompleted.value = true;
    isProcessing.value = false;
    stopPolling();
  } else if (payload.phase === "error") {
    importFailed.value = true;
    isProcessing.value = false;
    stopPolling();
  }
}

function formatDuration(sec) {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

async function pasteClipboard() {
  try {
    if (navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text) videoUrl.value = text.trim();
    }
  } catch (e) {
    console.warn("Failed to read clipboard:", e);
  }
}

async function parseUrl() {
  if (!videoUrl.value.trim() || parsing.value) return;
  parsing.value = true;
  parseError.value = "";
  meta.value = null;

  try {
    const res = await fetchYoutubeMetadata(videoUrl.value.trim(), props.targetLang || "es");
    meta.value = res;
    step.value = 2;
  } catch (e) {
    console.error("Failed to fetch metadata:", e);
    parseError.value = e?.message || String(e);
  } finally {
    parsing.value = false;
  }
}

async function handleUpdateYtdlp() {
  updatingComponent.value = true;
  updateStatus.value = "";
  try {
    const res = await updateYtdlp();
    updateStatus.value = res || t("reading.ytdlpUpdated");
  } catch (e) {
    updateStatus.value = e?.message || String(e);
  } finally {
    updatingComponent.value = false;
  }
}

async function startImportProcess() {
  step.value = 3;
  taskId.value = `task_${Date.now()}`;
  isProcessing.value = true;
  isCompleted.value = false;
  importFailed.value = false;
  progressPercent.value = 5;
  currentPhase.value = "analyzing";
  progressMsg.value = t("reading.phaseAnalyzing") + "...";

  startPolling(taskId.value);

  try {
    await startYoutubeImport(
      taskId.value,
      videoUrl.value.trim(),
      props.targetLang || "es",
      props.userId || "u1",
      props.cefrLevel || "A2",
      meta.value,
    );
  } catch (e) {
    console.error("Failed to start import:", e);
    stopPolling();
    importFailed.value = true;
    isProcessing.value = false;
    progressMsg.value = e?.message || String(e);
  }
}

async function cancelImportProcess() {
  if (!taskId.value) return;
  stopPolling();
  try {
    await cancelYoutubeImport(taskId.value);
  } catch (e) {
    console.error("Cancel error:", e);
  }
  isProcessing.value = false;
  importFailed.value = true;
  progressMsg.value = t("common.cancel");
}

function onSuccessClose() {
  emit("imported");
  close();
}

function onBackdropClick() {
  if (step.value === 3 && isProcessing.value) return;
  close();
}

function close() {
  if (step.value === 3 && isProcessing.value) {
    cancelImportProcess();
  }
  step.value = 1;
  videoUrl.value = "";
  meta.value = null;
  parseError.value = "";
  updateStatus.value = "";
  isProcessing.value = false;
  isCompleted.value = false;
  importFailed.value = false;
  emit("close");
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-card {
  width: 100%;
  max-width: 440px;
  background: var(--white, #fff);
  border-radius: var(--radius-lg, 16px);
  padding: 20px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text, #333);
}

.close-btn {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: var(--text-light, #888);
}

.step-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-lighter, #999);
}

.step-item.active {
  color: var(--green, #2ecc71);
  font-weight: 700;
}

.step-item.done {
  color: var(--green, #2ecc71);
}

.step-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.step-item.active .step-num {
  background: var(--green, #2ecc71);
  color: #fff;
  border-color: var(--green, #2ecc71);
}

.step-line {
  flex: 1;
  height: 2px;
  background: var(--border, #eee);
  margin: 0 8px;
}

.step-line.filled {
  background: var(--green, #2ecc71);
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.input-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.url-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border, #ddd);
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  box-sizing: border-box;
}

.btn-paste {
  align-self: flex-start;
  padding: 6px 12px;
  background: var(--surface-variant, #f0f0f0);
  border: 1px solid var(--border, #ddd);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.preview-box {
  background: var(--surface, #f9f9f9);
  padding: 12px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}

.preview-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.preview-row .label {
  color: var(--text-light, #777);
  flex-shrink: 0;
}

.preview-row .val {
  text-align: right;
  word-break: break-all;
}

.preview-row .val.strong {
  font-weight: 600;
  color: var(--text, #333);
}

.text-success { color: #2ecc71; font-weight: 600; }
.text-warning { color: #e67e22; font-weight: 600; }
.text-danger { color: #e74c3c; font-weight: 600; }

.warning-banner {
  margin: 0;
  padding: 8px 12px;
  background: #fff3cd;
  color: #856404;
  font-size: 12px;
  border-radius: 6px;
}

.tools-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.btn-link {
  background: none;
  border: none;
  color: #3498db;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.update-status {
  color: var(--text-light, #777);
  font-size: 11px;
}

.progress-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 16px 0;
}

.phase-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--green, #2ecc71);
  background: var(--green-bg, #e8f8f0);
  padding: 4px 10px;
  border-radius: 999px;
}

.progress-bar-bg {
  width: 100%;
  height: 8px;
  background: var(--border, #eee);
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--green, #2ecc71);
  transition: width 0.3s ease;
}

.progress-info {
  width: 100%;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-light, #888);
}

.status-msg {
  margin: 0;
  font-size: 13px;
  text-align: center;
  color: var(--text, #333);
}

.error-msg {
  color: #e74c3c;
  font-size: 12px;
  margin: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.btn-primary, .btn-secondary, .btn-danger {
  padding: 8px 16px;
  border-radius: var(--radius-md, 8px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-primary {
  background: var(--green, #2ecc71);
  color: #fff;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--surface-variant, #f0f0f0);
  color: var(--text, #333);
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fca5a5;
}
</style>
