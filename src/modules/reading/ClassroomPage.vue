<template>
  <div class="classroom-page" :class="{ 'is-tv': isTvLayoutMode }">
    <div class="classroom-main" :inert="panelOpen">
      <header class="classroom-header">
        <button
          class="icon-button classroom-back"
          :aria-label="t('classroom.back')"
          :title="t('classroom.back')"
          @click="back"
        >
          <ClassroomIcon name="back" />
        </button>
        <div class="classroom-heading">
          <span class="classroom-eyebrow">{{ t("classroom.title") }}</span>
          <h1>{{ data?.chapter.title || t("classroom.preparing") }}</h1>
        </div>
        <span
          v-if="room"
          class="classroom-progress-label"
          :aria-label="
            t('classroom.progress', {
              done: room.session.value.completed_beats.length,
              total: totalBeats,
            })
          "
          >{{ room.session.value.completed_beats.length }}<span> / {{ totalBeats }}</span></span
        >
        <button
          v-if="room"
          class="icon-button"
          :aria-label="t('classroom.lessonMenu')"
          :title="t('classroom.lessonMenu')"
          @click="openPanel('settings')"
        >
          <ClassroomIcon name="more" />
        </button>
      </header>
      <progress
        v-if="room"
        class="classroom-progress"
        :value="room.progress.value"
        max="100"
        :aria-label="
          t('classroom.progress', {
            done: room.session.value.completed_beats.length,
            total: totalBeats,
          })
        "
      />
      <nav
        v-if="chapterPosition >= 0 && chapters.length > 1"
        class="classroom-chapters"
        :aria-label="t('classroom.chapters')"
      >
        <button
          :disabled="!previousChapter || loading || regenerating"
          @click="goToChapter(previousChapter)"
        >
          <ClassroomIcon name="back" />{{ t("classroom.previous") }}
        </button>
        <span>{{ chapterPosition + 1 }} / {{ chapters.length }}</span>
        <button
          :disabled="!nextChapter || loading || regenerating"
          @click="goToChapter(nextChapter)"
        >
          {{ t("classroom.next") }}<ClassroomIcon name="next" />
        </button>
      </nav>
      <main v-if="regenerating" class="classroom-empty" role="status">
        <h2>{{ t("classroom.regenerating") }}</h2>
      </main>
      <main v-else-if="loading || loadError" class="classroom-empty" role="status">
        <h2>{{ loadError ? t("classroom.prepareFailed") : t("classroom.preparing") }}</h2>
        <p v-if="loadError">{{ loadError }}</p>
        <button v-if="loadError" @click="load">{{ t("classroom.retry") }}</button>
      </main>
      <template v-else-if="room">
        <main class="classroom-stage">
          <div class="classroom-board-meta">
            <div class="board-mark">
              <span aria-hidden="true">✦</span>
              <h2 class="board-topic" :title="beatTopic">{{ beatTopic }}</h2>
            </div>
            <button
              v-if="room.board.value.items.length && data.article.audio_path"
              class="board-audio"
              :aria-label="t(sourceAudio ? 'classroom.stopSource' : 'classroom.sourceAudio')"
              @click="toggleSource"
            >
              <ClassroomIcon name="audio" /><span>{{
                time(room.node.value.source.start_sec)
              }}</span>
            </button>
          </div>
          <ClassroomBoard
            :board="room.board.value"
            :target-language="data.plan.target_language"
            :teaching-language="
              room.session.value.teaching_language === 'target'
                ? data.plan.target_language
                : data.plan.native_language
            "
          />
          <div class="board-ledge" :title="beatPositionLabel">
            <span class="classroom-beat-position" role="status">{{ beatPositionLabel }}</span>
            <span
              v-for="position in totalBeats"
              :key="position"
              class="board-ledge-mark"
              :class="{ 'is-current': position === room.beatPosition.value + 1 }"
              aria-hidden="true"
            ></span>
          </div>
        </main>
        <footer class="classroom-controls">
          <p v-if="regenerateError" class="classroom-message" role="alert">
            {{ t("classroom.regenerateFailed") }} {{ regenerateError }}
          </p>
          <section class="classroom-teacher" :aria-label="t('classroom.teacher')">
            <div class="teacher-status">
              <span
                class="teacher-light"
                :class="{ 'is-speaking': room.live.speaking.value }"
                aria-hidden="true"
              ></span
              ><span>{{ t("classroom.teacher") }}</span
              ><span class="classroom-state" role="status">{{
                t(`classroom.${room.connecting.value ? "connecting" : room.phase.value}`)
              }}</span>
            </div>
            <p class="teacher-caption">
              {{
                room.teacherCaption.value ||
                t(
                  room.connecting.value
                    ? "classroom.connecting"
                    : isTeaching
                      ? "classroom.teacherPreparing"
                      : "classroom.settleIn",
                )
              }}
            </p>
          </section>
          <p
            v-if="room.notice.value || room.live.error.value || room.live.micError.value"
            class="classroom-message"
            role="status"
          >
            {{ room.live.error.value || room.notice.value || room.live.micError.value }}
          </p>
          <div v-if="room.saveError.value" class="classroom-message" role="alert">
            {{ room.saveError.value }}
            <button @click="room.persist">{{ t("classroom.saveRetry") }}</button>
          </div>
          <form v-if="composerOpen" class="classroom-composer" @submit.prevent="send">
            <input
              ref="composerInput"
              v-model="draft"
              :disabled="!room.live.connected.value || room.phase.value === 'completed'"
              :placeholder="t('classroom.input')"
              :aria-label="t('classroom.input')"
              maxlength="2000"
              @focus="pauseForTyping"
            /><button
              class="icon-button"
              type="submit"
              :aria-label="t('classroom.send')"
              :disabled="!draft.trim() || !room.live.connected.value"
            >
              <ClassroomIcon name="send" />
            </button>
          </form>
          <div class="classroom-actions">
            <button
              class="icon-button"
              :disabled="classroomBusy || room.beatPosition.value === 0"
              :aria-label="t('classroom.previousBeat')"
              :title="t('classroom.previousBeat')"
              @click="moveBeat(-1)"
            >
              <ClassroomIcon name="previousBeat" />
            </button>
            <button
              class="icon-button mic-button"
              :class="{ 'is-on': room.live.micEnabled.value }"
              :disabled="!room.live.connected.value"
              :aria-label="t(room.live.micEnabled.value ? 'classroom.micOn' : 'classroom.micOff')"
              :title="t(room.live.micEnabled.value ? 'classroom.micOn' : 'classroom.micOff')"
              @click="toggleMic"
            >
              <ClassroomIcon :name="room.live.micEnabled.value ? 'mic' : 'micOff'" />
            </button>
            <button class="classroom-primary" :disabled="classroomBusy" @click="mainAction">
              <ClassroomIcon :name="isTeaching ? 'pause' : 'play'" /><span>{{ mainLabel }}</span>
            </button>
            <button
              class="icon-button"
              :class="{ 'is-on': composerOpen }"
              :aria-label="t('classroom.askTeacher')"
              :aria-expanded="composerOpen"
              :title="t('classroom.askTeacher')"
              @click="toggleComposer"
            >
              <ClassroomIcon name="ask" />
            </button>
            <button
              class="icon-button"
              :disabled="classroomBusy || room.beatPosition.value + 1 === totalBeats"
              :aria-label="t('classroom.nextBeat')"
              :title="t('classroom.nextBeat')"
              @click="moveBeat(1)"
            >
              <ClassroomIcon name="nextBeat" />
            </button>
          </div>
          <button v-if="canSkip" class="classroom-skip" @click="room.skipInteraction">
            {{ t("classroom.skip") }} →
          </button>
        </footer>
      </template>
    </div>
    <div
      v-if="panelOpen && room"
      class="classroom-panel-backdrop"
      @click.self="closePanel"
      @keydown.esc.stop="closePanel"
    >
      <section
        ref="panelElement"
        class="classroom-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="t('classroom.lessonMenu')"
        tabindex="-1"
        @keydown="trapPanelFocus"
      >
        <div class="panel-heading">
          <h2>{{ t("classroom.lessonMenu") }}</h2>
          <button class="icon-button" :aria-label="t('classroom.closePanel')" @click="closePanel">
            <ClassroomIcon name="close" />
          </button>
        </div>
        <div class="panel-tabs" role="tablist" :aria-label="t('classroom.lessonMenu')">
          <button
            v-for="tab in panelTabs"
            :id="`classroom-tab-${tab.key}`"
            :key="tab.key"
            role="tab"
            :aria-selected="panelTab === tab.key"
            :aria-controls="`classroom-panel-${tab.key}`"
            @click="panelTab = tab.key"
          >
            {{ t(tab.label) }}
          </button>
        </div>
        <div
          :id="`classroom-panel-${panelTab}`"
          class="panel-content"
          role="tabpanel"
          :aria-labelledby="`classroom-tab-${panelTab}`"
        >
          <template v-if="panelTab === 'settings'">
            <label for="classroom-language" class="setting-label">{{
              t("classroom.teachingLanguage")
            }}</label>
            <select
              id="classroom-language"
              :value="room.session.value.teaching_language"
              :disabled="room.connecting.value || room.changingLanguage.value"
              @change="changeTeachingLanguage($event.target.value)"
            >
              <option value="native">
                {{
                  t("classroom.nativeTeaching", {
                    language: languageName(data.plan.native_language),
                  })
                }}
              </option>
              <option value="target">
                {{
                  t("classroom.targetTeaching", {
                    language: languageName(data.plan.target_language),
                  })
                }}
              </option>
            </select>
            <p class="classroom-language-hint">
              <span class="classroom-level">{{ data.plan.cefr_level }}</span
              >{{ t("classroom.levelTeachingHint", { level: data.plan.cefr_level }) }}
            </p>
            <label class="classroom-preference"
              ><span>{{ t("classroom.listenOnly") }}</span
              ><input
                type="checkbox"
                :checked="room.session.value.interaction_mode === 'listen_only'"
                @change="room.setInteractionMode($event.target.checked ? 'listen_only' : 'guided')"
            /></label>
            <p class="panel-hint">{{ t("classroom.hint") }}</p>
            <button class="panel-link" @click="configure">{{ t("classroom.configure") }} →</button>
            <div class="classroom-regenerate">
              <template v-if="confirmRegeneration">
                <p class="panel-hint">{{ t("classroom.regenerateConfirm") }}</p>
                <button
                  ref="regenerateControl"
                  class="panel-link"
                  @click="setRegenerateConfirmation(false)"
                >
                  {{ t("common.cancel") }}
                </button>
                <button
                  class="panel-link"
                  :disabled="room.connecting.value || room.changingLanguage.value"
                  @click="regenerateCourse"
                >
                  {{ t("classroom.regenerate") }}
                </button>
              </template>
              <button
                v-else
                ref="regenerateControl"
                class="panel-link"
                :disabled="room.connecting.value || room.changingLanguage.value"
                @click="setRegenerateConfirmation(true)"
              >
                {{ t("classroom.regenerate") }}
              </button>
            </div>
          </template>
          <template v-else-if="panelTab === 'outline'"
            ><h3>{{ t("classroom.goals") }}</h3>
            <ul class="classroom-goals">
              <li v-for="goal in data.plan.goals" :key="goal">{{ goal }}</li>
            </ul>
            <ol class="classroom-outline">
              <li
                v-for="(item, index) in data.plan.nodes"
                :key="item.id"
                :aria-current="index === room.session.value.node_index ? 'step' : undefined"
              >
                <span>{{ String(index + 1).padStart(2, "0") }}</span
                >{{ item.title }}
              </li>
            </ol>
            <div v-if="room.phase.value === 'completed'" class="classroom-summary">
              <h3>{{ t("classroom.lessonSummary") }}</h3>
              <p>{{ room.session.value.summary }}</p>
              <button v-if="nextChapter" class="panel-link" @click="goToChapter(nextChapter)">
                {{ t("classroom.next") }} →
              </button>
            </div></template
          >
          <template v-else
            ><p v-if="!room.transcript.value.length" class="panel-hint">
              {{ t("classroom.noTranscript") }}
            </p>
            <div v-for="(turn, i) in room.transcript.value" :key="i" class="classroom-turn">
              <span>{{ t(turn.role === "user" ? "classroom.student" : "classroom.teacher") }}</span>
              <p>{{ turn.text }}</p>
            </div></template
          >
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useRouter, onBeforeRouteLeave } from "vue-router";
import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { useI18n, getLocale } from "@/shared/i18n";
import { isTvLayoutMode } from "@/shared/appMode.js";
import { pushInPageBackHandler } from "@/shared/inPageBack.js";
import {
  getChapterClassroom,
  generateChapterTeachingPlan,
  saveChapterClassroom,
  getClassroomLiveConfig,
  getImportedArticleChapters,
} from "@/shared/api.js";
import { validateSession } from "./classroom/teachingPlan.js";
import { useClassroom } from "./classroom/useClassroom.js";
import ClassroomBoard from "./classroom/ClassroomBoard.vue";
import ClassroomIcon from "./classroom/ClassroomIcon.vue";

const props = defineProps({ id: [String, Number], chapterId: [String, Number] });
const { t } = useI18n();
const router = useRouter();
const loading = ref(true),
  loadError = ref(""),
  data = shallowRef(null),
  room = shallowRef(null);
const regenerating = ref(false),
  confirmRegeneration = ref(false),
  regenerateControl = ref(null),
  regenerateError = ref("");
const draft = ref(""),
  panelOpen = ref(false),
  panelTab = ref("settings"),
  panelElement = ref(null),
  composerOpen = ref(false),
  composerInput = ref(null),
  chapters = ref([]),
  sourceAudio = shallowRef(null);
const chapterPosition = computed(() =>
  chapters.value.findIndex((c) => Number(c.id) === Number(props.chapterId)),
);
const previousChapter = computed(() => chapters.value[chapterPosition.value - 1]);
const nextChapter = computed(() =>
  chapterPosition.value < 0 ? null : chapters.value[chapterPosition.value + 1],
);
const panelTabs = [
  { key: "outline", label: "classroom.outline" },
  { key: "settings", label: "classroom.lessonSettings" },
  { key: "record", label: "classroom.transcript" },
];
let panelTrigger = null;
let loadToken = 0,
  releaseBack = () => {};
const totalBeats = computed(() => room.value?.totalBeats || 0);
const beatTopic = computed(
  () =>
    room.value?.beat.value.objective?.trim() ||
    room.value?.node.value.title ||
    t("classroom.board"),
);
const beatPositionLabel = computed(() =>
  t("classroom.beatPosition", {
    current: (room.value?.beatPosition.value ?? -1) + 1,
    total: totalBeats.value,
  }),
);
const classroomBusy = computed(
  () =>
    room.value?.connecting.value ||
    room.value?.changingLanguage.value ||
    room.value?.changingBeat.value,
);
const canSkip = computed(
  () =>
    !room.value?.session.value.teach_selected_beat &&
    (["inviting", "awaiting_answer", "feedback"].includes(room.value?.phase.value) ||
      room.value?.session.value.interactions[room.value?.node.value.id]?.status ===
        "awaiting_answer"),
);
const isTeaching = computed(() =>
  ["teaching", "inviting", "answering", "feedback", "listening"].includes(room.value?.phase.value),
);
async function openPanel(tab = "settings") {
  panelTrigger = document.activeElement;
  if (isTeaching.value) room.value.pause();
  panelTab.value = tab;
  panelOpen.value = true;
  await nextTick();
  panelElement.value?.focus();
}
async function closePanel() {
  panelOpen.value = false;
  confirmRegeneration.value = false;
  await nextTick();
  panelTrigger?.focus?.();
}
function trapPanelFocus(event) {
  if (event.key !== "Tab") return;
  const elements = [
    ...panelElement.value.querySelectorAll(
      'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]',
    ),
  ];
  const first = elements[0],
    last = elements.at(-1);
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === panelElement.value)
  ) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
async function toggleComposer() {
  composerOpen.value = !composerOpen.value;
  if (composerOpen.value) {
    pauseForTyping();
    await nextTick();
    composerInput.value?.focus();
  }
}
const mainLabel = computed(() => {
  if (room.value?.connecting.value) return t("classroom.starting");
  const phase = room.value?.phase.value;
  if (["teaching", "inviting", "answering", "feedback", "listening"].includes(phase))
    return t("classroom.pause");
  if (room.value?.session.value.teach_selected_beat) return t("classroom.resume");
  if (phase === "completed") return t("classroom.review");
  if (phase !== "ready") return t("classroom.resume");
  return t(
    room.value?.session.value.completed_beats.length || room.value?.transcript.value.length
      ? "classroom.resume"
      : "classroom.start",
  );
});
function time(seconds) {
  const n = Math.floor(seconds || 0);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
function languageName(code) {
  try {
    return new Intl.DisplayNames([getLocale()], { type: "language" }).of(code);
  } catch {
    return code;
  }
}
async function changeTeachingLanguage(mode) {
  stopSource();
  await room.value.setTeachingLanguage(mode);
}
function installRoom(result, chapterId) {
  if (result.session) validateSession(result.session, result.plan);
  room.value = useClassroom({
    plan: result.plan,
    savedSession: result.session,
    saveSession: (session) => saveChapterClassroom(chapterId, session),
    getConfig: getClassroomLiveConfig,
  });
  data.value = result;
}
async function load() {
  const token = ++loadToken;
  const articleId = Number(props.id);
  const chapterId = Number(props.chapterId);
  loading.value = true;
  loadError.value = "";
  regenerating.value = false;
  regenerateError.value = "";
  panelOpen.value = false;
  confirmRegeneration.value = false;
  composerOpen.value = false;
  draft.value = "";
  stopSource();
  const previousRoom = room.value;
  room.value = null;
  data.value = null;
  try {
    await previousRoom?.close();
    const articleChapters = await getImportedArticleChapters(articleId).catch(() => []);
    if (token !== loadToken) return;
    chapters.value = articleChapters;
    let result = await getChapterClassroom(chapterId);
    if (token !== loadToken) return;
    if (Number(result.chapter.article_id) !== articleId) throw new Error("章节与文章不匹配");
    data.value = result;
    if (!result.plan) result = await generateChapterTeachingPlan(chapterId);
    if (token === loadToken) installRoom(result, chapterId);
  } catch (error) {
    if (token === loadToken) loadError.value = String(error?.message || error);
  } finally {
    if (token === loadToken) loading.value = false;
  }
}
async function setRegenerateConfirmation(show) {
  confirmRegeneration.value = show;
  await nextTick();
  regenerateControl.value?.focus();
}
async function regenerateCourse() {
  if (regenerating.value || !room.value) return;
  const token = loadToken;
  const chapterId = Number(props.chapterId);
  const previousRoom = room.value;
  regenerating.value = true;
  regenerateError.value = "";
  room.value = null;
  stopSource();
  void closePanel();
  composerOpen.value = false;
  draft.value = "";
  try {
    await previousRoom.close();
    if (token !== loadToken) return;
    const result = await generateChapterTeachingPlan(chapterId, true);
    if (token === loadToken) installRoom(result, chapterId);
  } catch (error) {
    if (token === loadToken) {
      room.value = previousRoom;
      regenerateError.value = String(error?.message || error);
    }
  } finally {
    if (token === loadToken) regenerating.value = false;
  }
}
function stopSource() {
  if (sourceAudio.value) {
    const audio = sourceAudio.value;
    sourceAudio.value = null;
    audio.onloadedmetadata = audio.ontimeupdate = audio.onended = audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
}
function toggleSource() {
  if (sourceAudio.value) {
    stopSource();
    return;
  }
  room.value.pause();
  void room.value.live.stopMic();
  const path = data.value.article.audio_path;
  const src = /^(https?|blob|data|asset):/i.test(path)
    ? path
    : isTauri()
      ? convertFileSrc(path)
      : path;
  const audio = new Audio(src);
  sourceAudio.value = audio;
  audio.onloadedmetadata = () => {
    audio.currentTime = room.value.node.value.source.start_sec;
    void audio.play().catch(() => {
      if (sourceAudio.value !== audio) return;
      room.value.notice.value = t("classroom.noAudio");
      stopSource();
    });
  };
  audio.ontimeupdate = () => {
    if (audio.currentTime >= room.value.node.value.source.end_sec) stopSource();
  };
  audio.onended = stopSource;
  audio.onerror = () => {
    room.value.notice.value = t("classroom.noAudio");
    stopSource();
  };
  audio.load();
}
function mainAction() {
  stopSource();
  if (
    ["teaching", "inviting", "answering", "feedback", "listening"].includes(room.value.phase.value)
  )
    room.value.pause();
  else room.value.resume();
}
function moveBeat(offset) {
  stopSource();
  void room.value.moveBeat(offset);
}
function toggleMic() {
  stopSource();
  if (room.value.live.micEnabled.value) void room.value.live.stopMic();
  else {
    if (isTeaching.value) room.value.pause();
    void room.value.live.startMic();
  }
}
function pauseForTyping() {
  if (
    ["teaching", "inviting"].includes(room.value.phase.value) &&
    room.value.phase.value !== "inviting"
  )
    room.value.pause();
}
function send() {
  stopSource();
  room.value.ask(draft.value);
  draft.value = "";
}
function back() {
  void router.push({
    name: "reading-article",
    params: { id: props.id },
    query: { type: "imported", chapter: props.chapterId },
  });
}
function goToChapter(chapter) {
  if (!chapter) return;
  void router.push({
    name: "reading-classroom",
    params: { id: props.id, chapterId: chapter.id },
  });
}
function configure() {
  void router.push("/profile/multimodal-config");
}
function visibility() {
  if (document.hidden) {
    stopSource();
    void room.value?.suspend();
  }
}
onBeforeRouteLeave(async () => {
  stopSource();
  await room.value?.close();
});
watch([() => props.id, () => props.chapterId], load, { immediate: true });
onMounted(() => {
  releaseBack = pushInPageBackHandler(() => {
    if (panelOpen.value) {
      void closePanel();
      return "navigated";
    }
    if (composerOpen.value) {
      composerOpen.value = false;
      return "navigated";
    }
    back();
    return "navigated";
  });
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", visibility);
});
onBeforeUnmount(() => {
  loadToken += 1;
  releaseBack();
  stopSource();
  document.removeEventListener("visibilitychange", visibility);
  window.removeEventListener("pagehide", visibility);
  void room.value?.close();
});
</script>

<style scoped>
.classroom-page {
  --chalk: #f1f1de;
  --chalk-muted: #a1b6ab;
  --chalk-yellow: #e9d793;
  --classroom-dark: #142c25;
  height: 100%;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: #10251f;
  color: var(--chalk);
}
.classroom-main {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.classroom-page button {
  font: inherit;
  cursor: pointer;
  border: 0;
  color: inherit;
  background: transparent;
}
.classroom-page button:disabled {
  opacity: 0.36;
  cursor: default;
}
.classroom-page button:focus-visible,
.classroom-page input:focus-visible,
.classroom-page select:focus-visible {
  outline: 2px solid #d7cd94;
  outline-offset: 4px;
}
.classroom-page .icon-button {
  width: 42px;
  height: 42px;
  min-width: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--chalk-muted);
}
.classroom-page .icon-button:hover {
  background: #ffffff0b;
  color: var(--chalk);
}
.classroom-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 11px 10px;
}
.classroom-heading {
  flex: 1;
  min-width: 0;
}
.classroom-eyebrow {
  display: block;
  font-size: 10px;
  letter-spacing: 0.09em;
  color: var(--chalk-muted);
  margin-bottom: 5px;
}
.classroom-heading h1 {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.classroom-progress-label {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.classroom-progress-label > span {
  color: #8da79a;
  font-size: 11px;
}
.classroom-progress {
  appearance: none;
  flex-shrink: 0;
  width: 100%;
  height: 2px;
  border: 0;
  display: block;
}
.classroom-progress::-webkit-progress-bar {
  background: #ffffff09;
}
.classroom-progress::-webkit-progress-value {
  background: #96b99d;
}
.classroom-chapters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 2px 12px 0;
  color: var(--chalk-muted);
  font-size: 12px;
}
.classroom-chapters button {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  padding: 0 6px;
  border-radius: 8px;
}
.classroom-chapters button:hover:not(:disabled) {
  background: #ffffff0b;
  color: var(--chalk);
}
.classroom-chapters svg {
  width: 16px;
  height: 16px;
}
.classroom-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 12px 12px 0;
  padding: 0 20px;
  border: 1px solid #c7dac01c;
  border-radius: 12px;
  background:
    radial-gradient(ellipse at 35% 25%, #3d5b431b, transparent 75%),
    radial-gradient(ellipse at 80% 90%, #020e0b66, transparent 70%), #18372c;
  box-shadow:
    inset 0 0 50px #00000025,
    0 1px 0 #ffffff0a;
}
.classroom-stage::before {
  content: "";
  position: absolute;
  inset: 5px;
  border: 1px solid #e2e9d706;
  border-radius: 8px;
  pointer-events: none;
}
.classroom-board-meta {
  min-height: 46px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  color: #a8bcaa;
  flex-shrink: 0;
  font-size: 10px;
}
.board-mark {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.board-mark > span {
  font-size: 13px;
  color: #c8d6b8;
}
.board-topic {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.classroom-beat-position {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.board-audio {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  min-height: 34px;
  font-variant-numeric: tabular-nums;
  font-size: 10px !important;
}
.board-audio :deep(svg) {
  width: 15px;
  height: 15px;
}
.board-ledge {
  height: 16px;
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
  padding: 0 9px 4px 0;
  flex-shrink: 0;
}
.board-ledge-mark {
  flex: 0 1 14px;
  height: 3px;
  border-radius: 2px;
  background: #729184;
}
.board-ledge-mark.is-current {
  height: 5px;
  background: var(--chalk-yellow);
}
.classroom-controls {
  flex-shrink: 0;
  padding: 14px 24px 17px;
}
.classroom-teacher {
  margin-bottom: 14px;
}
.teacher-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: var(--chalk-muted);
}
.teacher-light {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #9dc5a6;
  box-shadow: 0 0 7px #9dc5a630;
  flex-shrink: 0;
}
.teacher-light.is-speaking {
  animation: teacher-breathe 1.6s ease-in-out infinite;
}
.classroom-state {
  margin-left: auto;
  font-size: 9px;
  opacity: 0.8;
  max-width: 65%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.teacher-caption {
  margin-top: 8px;
  min-height: 20px;
  max-height: 40px;
  font-size: 13px;
  color: #d1dcd0;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.classroom-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: clamp(2px, 1.5vw, 12px);
}
.classroom-page .classroom-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 1 160px;
  gap: 6px;
  border-radius: 24px;
  min-height: 46px;
  min-width: 0;
  padding: 10px clamp(6px, 2.5vw, 25px);
  font-size: 13px;
  font-weight: 600;
  color: #183226;
  background: #d5e2b7;
  box-shadow: 0 2px 12px #00000012;
}
.classroom-primary :deep(svg) {
  width: 16px;
  height: 16px;
}
.classroom-page .is-on {
  color: #e5eacb;
  background: #ffffff0b;
}
.classroom-composer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 13px;
  padding: 2px 4px 2px 14px;
  background: #ffffff09;
  border: 1px solid #ffffff14;
  border-radius: 12px;
}
.classroom-composer input {
  width: 100%;
  min-width: 0;
  height: 40px;
  border: 0;
  background: transparent;
  color: var(--chalk);
  font: inherit;
  font-size: 14px;
}
.classroom-composer input::placeholder {
  color: #b3c4b18c;
}
.classroom-page .classroom-skip {
  display: block;
  margin: 10px auto 0;
  font-size: 11px;
  color: #e6dcab;
  padding: 3px 8px;
}
.classroom-message {
  font-size: 11px;
  line-height: 1.5;
  color: #e0cd9c;
  margin: 0 0 10px;
  max-height: 46px;
  overflow: auto;
  overflow-wrap: anywhere;
}
.classroom-message button {
  text-decoration: underline;
}
.classroom-empty {
  flex: 1;
  padding: 45px 28px;
}
.classroom-empty h2 {
  font-size: 16px;
  font-weight: 400;
}
.classroom-empty p {
  margin: 20px 0;
  color: var(--chalk-muted);
}
.classroom-empty button {
  padding: 10px 20px;
  border: 1px solid #ffffff30;
  border-radius: 20px;
}
.classroom-panel-backdrop {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: #04100bc4;
  backdrop-filter: blur(5px);
  padding-top: 60px;
}
.classroom-panel {
  width: 100%;
  max-width: 620px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 330px;
  background: #f3f5ef;
  color: #263b31;
  border-radius: 22px 22px 0 0;
  box-shadow: 0 -10px 45px #0003;
  padding: 12px 22px 26px;
  outline: none;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-heading h2 {
  font-size: 16px;
  font-weight: 600;
}
.classroom-panel .icon-button {
  color: #617366;
}
.classroom-panel .icon-button:hover {
  color: #263b31;
  background: #1832260a;
}
.panel-tabs {
  display: flex;
  gap: 16px;
  margin: 10px 0 20px;
  border-bottom: 1px solid #233f2f18;
}
.panel-tabs button {
  min-height: 42px;
  padding: 0 0 12px;
  color: #79867c;
  font-size: 12px;
  border-bottom: 2px solid transparent;
}
.panel-tabs button[aria-selected="true"] {
  border-color: #294837;
  color: #294837;
  font-weight: 600;
}
.panel-content {
  overflow: auto;
  min-height: 0;
  font-size: 13px;
}
.setting-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 10px;
}
.panel-content select {
  width: 100%;
  min-height: 44px;
  border: 1px solid #24453226;
  border-radius: 10px;
  background: #fff9;
  color: #263b31;
  padding: 0 12px;
  font: inherit;
}
.classroom-language-hint {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  margin: 10px 0 24px;
  color: #6b7a6c;
  font-size: 11px;
  line-height: 1.6;
}
.classroom-level {
  color: #48634b;
  background: #e4eadd;
  padding: 0 5px;
  border-radius: 4px;
}
.classroom-preference {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 50px;
  border-top: 1px solid #233f2f18;
  border-bottom: 1px solid #233f2f18;
}
.classroom-preference input {
  width: 18px;
  height: 18px;
  accent-color: #42654c;
}
.panel-hint {
  color: #79877b;
  font-size: 11px;
  line-height: 1.7;
  margin: 16px 0;
}
.classroom-panel .panel-link {
  font-size: 12px;
  font-weight: 500;
  padding: 10px 0;
  color: #36573d;
}
.classroom-regenerate {
  margin-top: 10px;
  border-top: 1px solid #233f2f24;
  padding-top: 8px;
}
.classroom-regenerate .panel-link + .panel-link {
  margin-inline-start: 20px;
}
.panel-content h3 {
  font-size: 12px;
  margin: 0 0 10px;
}
.classroom-goals {
  padding-left: 16px;
  color: #6b7a6c;
  line-height: 1.8;
  margin-bottom: 18px;
}
.classroom-outline {
  list-style: none;
}
.classroom-outline li {
  display: flex;
  gap: 12px;
  padding: 13px 0;
  border-top: 1px solid #233f2f12;
  font-size: 13px;
  line-height: 1.6;
}
.classroom-outline li > span {
  font-size: 11px;
  color: #9ba79b;
  padding-top: 2px;
}
.classroom-outline [aria-current] {
  color: #315e3c;
  font-weight: 600;
}
.classroom-turn {
  border-bottom: 1px solid #233f2f12;
  padding: 12px 0;
}
.classroom-turn > span {
  color: #849181;
  font-size: 10px;
}
.classroom-turn p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.7;
  margin-top: 6px;
}
.classroom-summary {
  margin-top: 24px;
  line-height: 1.8;
}
@keyframes teacher-breathe {
  50% {
    opacity: 0.4;
    box-shadow: 0 0 10px #9dc5a650;
  }
}
@media (prefers-reduced-motion: reduce) {
  .teacher-light.is-speaking {
    animation: none;
  }
}
@media (max-width: 360px) {
  .classroom-stage {
    margin: 8px 8px 0;
    padding: 0 14px;
  }
  .classroom-controls {
    padding: 12px 17px;
  }
}
@media (min-width: 800px) {
  .classroom-stage {
    padding: 0 5vw;
    margin: 16px 24px 0;
  }
  .classroom-controls {
    width: min(100%, 760px);
    align-self: center;
    padding-bottom: 22px;
  }
}
</style>
