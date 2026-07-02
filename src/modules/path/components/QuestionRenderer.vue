<template>
  <div class="question-renderer">
    <p v-if="promptText" class="prompt">{{ promptText }}</p>

    <QuestionImage
      v-if="showMainImage"
      :image-url="question.imageUrl"
      :image-svg="question.imageSvg"
      :image-desc="question.imageDesc"
      :alt="question.typeName"
    />

    <button
      v-if="hasAudio"
      type="button"
      class="audio-btn"
      :disabled="audioBusy"
      @click="playAudio"
    >
      🔊 {{ t("path.playAudio") }}
    </button>

    <div
      v-if="isChoiceType"
      class="options"
      :class="{
        'reveal-incorrect': incorrectReveal,
        'reveal-correct': correctReveal,
      }"
    >
      <button
        v-for="(opt, idx) in choiceOptions"
        :key="idx"
        type="button"
        class="option-btn"
        :class="optionClass(idx)"
        :disabled="showResult"
        @click="selectChoice(idx)"
      >
        <QuestionImage
          v-if="choiceImage(idx)"
          class="option-image"
          :image-url="choiceImage(idx).imageUrl"
          :image-svg="choiceImage(idx).imageSvg"
          :image-desc="choiceImage(idx).desc"
        />
        <span v-else class="option-text">{{ opt }}</span>
      </button>
    </div>

    <div
      v-else-if="question.type === 'T03'"
      class="matching"
      :class="{
        'reveal-incorrect': incorrectReveal,
        'reveal-correct': correctReveal,
      }"
    >
      <div class="match-col">
        <button
          v-for="(left, idx) in leftItems"
          :key="'l' + idx"
          type="button"
          class="match-item"
          :class="leftMatchClass(idx)"
          :disabled="showResult || isLeftMatched(idx)"
          @click="selectLeft(idx)"
        >
          {{ left }}
        </button>
      </div>
      <div class="match-col">
        <button
          v-for="(right, idx) in rightItems"
          :key="'r' + idx"
          type="button"
          class="match-item"
          :class="rightMatchClass(idx, right)"
          :disabled="showResult || isRightMatched(idx)"
          @click="selectRight(idx)"
        >
          {{ right }}
        </button>
      </div>
    </div>

    <div
      v-else-if="question.type === 'T06'"
      class="word-order"
      :class="{
        'reveal-incorrect': incorrectReveal,
        'reveal-correct': correctReveal,
      }"
    >
      <div class="built-sentence" :class="builtSentenceClass">
        <button
          v-for="(word, idx) in builtWords"
          :key="'b' + idx"
          type="button"
          class="word-chip built"
          :disabled="showResult"
          @click="removeWord(idx)"
        >
          {{ word }}
        </button>
        <span v-if="builtWords.length === 0" class="placeholder">{{ t("path.tapWords") }}</span>
      </div>
      <div class="word-bank">
        <button
          v-for="(word, idx) in bankWords"
          :key="'w' + idx"
          type="button"
          class="word-chip"
          :disabled="showResult || word.used"
          @click="addWord(idx)"
        >
          {{ word.text }}
        </button>
      </div>
    </div>

    <div v-else-if="question.type === 'T09' || question.type === 'T10'" class="text-input-wrap">
      <input
        ref="textInputEl"
        v-model="textAnswer"
        class="text-input"
        :class="textInputClass"
        :placeholder="question.hint || t('path.typeAnswer')"
        :disabled="showResult"
        enterkeyhint="go"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        @input="emitAnswer"
        @keydown.enter.prevent="onEnterKey"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useI18n } from "@/shared/i18n";
import QuestionImage from "./QuestionImage.vue";
import {
  isCorrectReveal,
  isIncorrectReveal,
  textInputResultClass,
} from "../answerRevealFeedback.js";
import {
  builtSentenceRevealState,
  leftMatchRevealState,
  rightMatchRevealState,
} from "../matchingRevealFeedback.js";
import {
  hasQuestionAudio,
  QUESTION_AUDIO_AUTO_PLAY_MS,
  shouldAutoPlayQuestionAudio,
  speakQuestionAudio,
} from "../questionAudio.js";
import {
  isTextInputQuestionType,
  shouldSubmitOnEnter,
} from "../textInputSubmit.js";

const props = defineProps({
  question: { type: Object, required: true },
  answer: { type: [Number, String, Array, null], default: null },
  showResult: { type: Boolean, default: false },
  isCorrect: { type: Boolean, default: false },
});

const emit = defineEmits(["update:answer", "submit"]);
const { t } = useI18n();
const audioBusy = ref(false);
const textInputEl = ref(null);
const selectedLeft = ref(null);
const selectedRight = ref(null);
const matchedPairs = ref([]);
const builtWords = ref([]);
const bankWords = ref([]);
const textAnswer = ref("");

const isChoiceType = computed(() =>
  ["T01", "T02", "T05", "T07", "T08", "T12"].includes(props.question.type),
);

const incorrectReveal = computed(() =>
  isIncorrectReveal({
    showResult: props.showResult,
    isCorrect: props.isCorrect,
  }),
);

const correctReveal = computed(() =>
  isCorrectReveal({
    showResult: props.showResult,
    isCorrect: props.isCorrect,
  }),
);

const textInputClass = computed(() =>
  textInputResultClass({
    showResult: props.showResult,
    isCorrect: props.isCorrect,
  }),
);

const builtSentenceClass = computed(() =>
  builtSentenceRevealState({
    showResult: props.showResult,
    isCorrect: props.isCorrect,
  }),
);

const hasAudio = computed(() => hasQuestionAudio(props.question));

const showMainImage = computed(() =>
  props.question.type === "T01" &&
  (props.question.imageUrl || props.question.imageSvg),
);

const promptText = computed(() => {
  const q = props.question;
  if (q.type === "T05") return q.sentence?.replace(/_{2,}/, "______") || q.sentence;
  if (q.type === "T07") return q.sourceText;
  if (q.type === "T08") return q.question || t("path.listenChoose");
  if (q.type === "T12") return q.scenario;
  if (q.type === "T09") return q.hint;
  if (q.type === "T10") return q.sourceText;
  if (q.type === "T01") return t("path.chooseByImage");
  if (q.type === "T02") return t("path.listenChooseImage");
  if (q.type === "T03") return t("path.matchPairs");
  if (q.type === "T06") return t("path.buildSentence");
  return "";
});

const choiceOptions = computed(() => {
  if (props.question.type === "T02") {
    return (props.question.imageOptions || []).map((o) => o.desc);
  }
  return props.question.options || [];
});

const leftItems = computed(() => (props.question.pairs || []).map((p) => p.left));
const rightItems = ref([]);

function shuffleRights() {
  const rights = (props.question.pairs || []).map((p) => p.right);
  for (let i = rights.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rights[i], rights[j]] = [rights[j], rights[i]];
  }
  rightItems.value = rights;
}

function choiceImage(idx) {
  if (props.question.type !== "T02") return null;
  return props.question.imageOptions?.[idx] || null;
}

function optionClass(idx) {
  if (!props.showResult) {
    return props.answer === idx ? "selected" : "";
  }
  if (idx === props.question.answerIdx) return "correct";
  if (props.answer === idx && !props.isCorrect) return "wrong";
  return "";
}

function leftMatchClass(idx) {
  if (!props.showResult) {
    return {
      selected: selectedLeft.value === idx,
      matched: isLeftMatched(idx),
    };
  }
  return leftMatchRevealState({
    showResult: props.showResult,
    isCorrect: props.isCorrect,
    leftIdx: idx,
    matchedPairs: matchedPairs.value,
    question: props.question,
  });
}

function rightMatchClass(idx, rightText) {
  if (!props.showResult) {
    return {
      selected: selectedRight.value === idx,
      matched: isRightMatched(idx),
    };
  }
  return rightMatchRevealState({
    showResult: props.showResult,
    isCorrect: props.isCorrect,
    rightIdx: idx,
    rightText,
    matchedPairs: matchedPairs.value,
    question: props.question,
  });
}

function selectChoice(idx) {
  emit("update:answer", idx);
}

function isLeftMatched(idx) {
  return matchedPairs.value.some((p) => p.leftIdx === idx);
}

function isRightMatched(idx) {
  return matchedPairs.value.some((p) => p.rightIdx === idx);
}

function selectLeft(idx) {
  selectedLeft.value = idx;
  tryMatch();
}

function selectRight(idx) {
  selectedRight.value = idx;
  tryMatch();
}

function tryMatch() {
  if (selectedLeft.value == null || selectedRight.value == null) return;
  matchedPairs.value.push({
    leftIdx: selectedLeft.value,
    rightIdx: selectedRight.value,
    left: leftItems.value[selectedLeft.value],
    right: rightItems.value[selectedRight.value] ?? "",
  });
  selectedLeft.value = null;
  selectedRight.value = null;
  emit(
    "update:answer",
    matchedPairs.value.map((p) => ({ left: p.left, right: p.right })),
  );
}

function resetMatching() {
  selectedLeft.value = null;
  selectedRight.value = null;
  matchedPairs.value = [];
}

function resetWordOrder() {
  const words = [...(props.question.words || [])];
  for (let i = words.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  bankWords.value = words.map((text) => ({ text, used: false }));
  builtWords.value = [];
}

function addWord(idx) {
  const item = bankWords.value[idx];
  if (!item || item.used) return;
  item.used = true;
  builtWords.value.push(item.text);
  emit("update:answer", [...builtWords.value]);
}

function removeWord(idx) {
  const word = builtWords.value[idx];
  builtWords.value.splice(idx, 1);
  const bankItem = bankWords.value.find((w) => w.text === word && w.used);
  if (bankItem) bankItem.used = false;
  emit("update:answer", [...builtWords.value]);
}

function emitAnswer() {
  emit("update:answer", textAnswer.value);
}

function onEnterKey() {
  if (
    shouldSubmitOnEnter(props.question, {
      showResult: props.showResult,
      answer: props.answer,
    })
  ) {
    emit("submit");
  }
}

function focusTextInput() {
  if (!isTextInputQuestionType(props.question?.type)) return;
  nextTick(() => textInputEl.value?.focus());
}

let autoPlayTimer = null;

function clearAutoPlayTimer() {
  if (autoPlayTimer != null) {
    clearTimeout(autoPlayTimer);
    autoPlayTimer = null;
  }
}

async function playAudio() {
  if (!hasQuestionAudio(props.question)) return;
  audioBusy.value = true;
  try {
    await speakQuestionAudio(props.question);
  } finally {
    audioBusy.value = false;
  }
}

function scheduleAutoPlayAudio() {
  clearAutoPlayTimer();
  if (!shouldAutoPlayQuestionAudio(props.question, { showResult: props.showResult })) {
    return;
  }
  autoPlayTimer = setTimeout(() => {
    autoPlayTimer = null;
    if (!shouldAutoPlayQuestionAudio(props.question, { showResult: props.showResult })) {
      return;
    }
    void playAudio();
  }, QUESTION_AUDIO_AUTO_PLAY_MS);
}

watch(
  () => props.question?.id,
  () => {
    resetMatching();
    resetWordOrder();
    shuffleRights();
    textAnswer.value = "";
    emit("update:answer", isChoiceType.value ? null : props.question.type === "T03" ? [] : "");
    focusTextInput();
    scheduleAutoPlayAudio();
  },
  { immediate: true },
);

watch(
  () => props.showResult,
  (showResult) => {
    if (showResult) clearAutoPlayTimer();
  },
);

onUnmounted(() => {
  clearAutoPlayTimer();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
});
</script>

<style scoped>
.question-renderer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prompt {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.45;
}

.audio-btn {
  align-self: flex-start;
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--blue-bg);
  color: var(--blue-hover);
  font-weight: 600;
  cursor: pointer;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-btn {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  text-align: left;
  font-size: 16px;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}

.option-btn.selected {
  border-color: var(--blue);
  background: var(--blue-bg);
}

.option-btn.correct {
  border-color: var(--green);
  background: var(--green-bg);
}

.options.reveal-correct .option-btn.correct {
  animation: correct-success-pulse 0.5s ease;
}

.option-btn.wrong {
  border-color: var(--red);
  background: var(--red-bg);
  animation: option-shake 0.42s ease;
}

.options.reveal-incorrect .option-btn.correct {
  animation: correct-reveal-pulse 0.55s ease 0.12s 2;
}

@keyframes option-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  18% {
    transform: translateX(-5px);
  }
  36% {
    transform: translateX(5px);
  }
  54% {
    transform: translateX(-4px);
  }
  72% {
    transform: translateX(4px);
  }
}

@keyframes correct-reveal-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(88, 204, 2, 0);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(88, 204, 2, 0.28);
  }
}

@keyframes correct-success-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(88, 204, 2, 0);
    transform: scale(1);
  }
  40% {
    box-shadow: 0 0 0 5px rgba(88, 204, 2, 0.32);
    transform: scale(1.012);
  }
}

.option-image {
  margin-bottom: 0;
}

.option-text {
  display: block;
}

.matching {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.match-item,
.word-chip {
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--white);
  font-size: 15px;
  cursor: pointer;
}

.match-item.selected,
.word-chip:not(:disabled):hover {
  border-color: var(--blue);
  background: var(--blue-bg);
}

.match-item.matched {
  border-color: var(--green);
  background: var(--green-bg);
  opacity: 0.8;
}

.match-item.correct {
  border-color: var(--green);
  background: var(--green-bg);
}

.matching.reveal-correct .match-item.correct {
  animation: correct-success-pulse 0.5s ease;
}

.match-item.wrong {
  border-color: var(--red);
  background: var(--red-bg);
  animation: option-shake 0.42s ease;
}

.match-item.unmatched {
  opacity: 0.45;
}

.match-item.correct-hint {
  border-color: var(--green);
  background: var(--green-bg);
}

.matching.reveal-incorrect .match-item.correct-hint {
  animation: correct-reveal-pulse 0.55s ease 0.12s 2;
}

.word-order {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.built-sentence {
  min-height: 56px;
  padding: 10px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  transition: border-color var(--transition), background var(--transition);
}

.built-sentence.is-wrong {
  border-color: var(--red);
  border-style: solid;
  background: var(--red-bg);
  animation: option-shake 0.42s ease;
}

.built-sentence.is-correct {
  border-color: var(--green);
  border-style: solid;
  background: var(--green-bg);
}

.word-order.reveal-correct .built-sentence.is-correct {
  animation: correct-success-pulse 0.5s ease;
}

.placeholder {
  color: var(--text-lighter);
  font-size: 14px;
}

.word-bank {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.word-chip.built {
  border-color: var(--green);
  background: var(--green-bg);
}

.text-input-wrap {
  margin-top: 4px;
}

.text-input {
  width: 100%;
  padding: 14px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 16px;
  box-sizing: border-box;
  transition: border-color var(--transition), background var(--transition);
}

.text-input.is-wrong {
  border-color: var(--red);
  background: var(--red-bg);
  animation: option-shake 0.42s ease;
}

.text-input.is-correct {
  border-color: var(--green);
  background: var(--green-bg);
  animation: correct-success-pulse 0.5s ease;
}

@media (prefers-reduced-motion: reduce) {
  .option-btn.wrong,
  .options.reveal-incorrect .option-btn.correct,
  .options.reveal-correct .option-btn.correct,
  .text-input.is-wrong,
  .text-input.is-correct,
  .match-item.wrong,
  .matching.reveal-incorrect .match-item.correct-hint,
  .matching.reveal-correct .match-item.correct,
  .built-sentence.is-wrong,
  .word-order.reveal-correct .built-sentence.is-correct {
    animation: none;
  }
}
</style>