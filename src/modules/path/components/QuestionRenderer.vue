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

    <div v-if="hasAudio" class="audio-panel">
      <button
        type="button"
        class="audio-btn"
        :disabled="audioBusy"
        @click="playAudio"
      >
        <span class="audio-icon" aria-hidden="true">♪</span>
        <span>{{ t("path.playAudio") }}</span>
      </button>
    </div>

    <div v-if="isChoiceType" class="options" :class="{ 'image-options': question.type === 'T02' }">
      <button
        v-for="(opt, idx) in choiceOptions"
        :key="idx"
        type="button"
        class="option-btn"
        :class="optionClass(idx)"
        :disabled="showResult"
        @click="selectChoice(idx)"
      >
        <span v-if="!choiceImage(idx)" class="option-index" aria-hidden="true">
          {{ optionLetter(idx) }}
        </span>
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

    <div v-else-if="question.type === 'T03'" class="matching">
      <div class="match-col">
        <button
          v-for="(left, idx) in leftItems"
          :key="'l' + idx"
          type="button"
          class="match-item"
          :class="{ selected: selectedLeft === idx, matched: isLeftMatched(idx) }"
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
          :class="{ selected: selectedRight === idx, matched: isRightMatched(idx) }"
          :disabled="showResult || isRightMatched(idx)"
          @click="selectRight(idx)"
        >
          {{ right }}
        </button>
      </div>
    </div>

    <div v-else-if="question.type === 'T06'" class="word-order">
      <div class="built-sentence">
        <div class="sentence-line">
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
        v-model="textAnswer"
        class="text-input"
        :placeholder="question.hint || t('path.typeAnswer')"
        :disabled="showResult"
        @input="emitAnswer"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "@/shared/i18n";
import QuestionImage from "./QuestionImage.vue";

const props = defineProps({
  question: { type: Object, required: true },
  answer: { type: [Number, String, Array, null], default: null },
  showResult: { type: Boolean, default: false },
  isCorrect: { type: Boolean, default: false },
});

const emit = defineEmits(["update:answer"]);
const { t } = useI18n();
const audioBusy = ref(false);
const selectedLeft = ref(null);
const selectedRight = ref(null);
const matchedPairs = ref([]);
const builtWords = ref([]);
const bankWords = ref([]);
const textAnswer = ref("");

const isChoiceType = computed(() =>
  ["T01", "T02", "T05", "T07", "T08", "T12"].includes(props.question.type),
);

const hasAudio = computed(() =>
  ["T02", "T08", "T09", "T11"].includes(props.question.type) && props.question.audioText,
);

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

function optionLetter(idx) {
  return String.fromCharCode(65 + idx);
}

function optionClass(idx) {
  if (!props.showResult) {
    return props.answer === idx ? "selected" : "";
  }
  if (idx === props.question.answerIdx) return "correct";
  if (props.answer === idx && !props.isCorrect) return "wrong";
  return "";
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

async function playAudio() {
  const text = props.question.audioText;
  if (!text || !("speechSynthesis" in window)) return;
  audioBusy.value = true;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const lang = props.question.language === "es" ? "es-ES"
      : props.question.language === "en" ? "en-US"
      : "zh-CN";
    utter.lang = lang;
    await new Promise((resolve) => {
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    });
  } finally {
    audioBusy.value = false;
  }
}

watch(
  () => props.question?.id,
  () => {
    resetMatching();
    resetWordOrder();
    shuffleRights();
    textAnswer.value = "";
    emit("update:answer", isChoiceType.value ? null : props.question.type === "T03" ? [] : "");
  },
  { immediate: true },
);
</script>

<style scoped>
.question-renderer {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prompt {
  margin: 0;
  padding: 2px 2px 0;
  color: var(--text);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.4;
}

.audio-panel {
  display: flex;
  justify-content: center;
}

.audio-btn {
  min-height: 52px;
  padding: 0 20px;
  border: 2px solid #84d8ff;
  border-radius: 999px;
  background: var(--blue-bg);
  color: var(--blue-hover);
  font-size: 16px;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 4px 0 #b9e9ff;
}

.audio-btn:disabled {
  opacity: 0.65;
  box-shadow: none;
}

.audio-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--blue);
  color: var(--white);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.options.image-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.option-btn {
  width: 100%;
  min-height: 58px;
  padding: 13px 14px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  text-align: left;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 0 var(--border);
  transition:
    border-color var(--transition),
    background var(--transition),
    box-shadow var(--transition),
    transform var(--transition);
}

.option-btn:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 2px 0 var(--border);
}

.option-btn:disabled {
  cursor: default;
}

.image-options .option-btn {
  min-height: 168px;
  padding: 8px;
  align-items: stretch;
  justify-content: center;
}

.option-btn.selected {
  border-color: var(--blue);
  background: var(--blue-bg);
  box-shadow: 0 4px 0 #84d8ff;
}

.option-btn.correct {
  border-color: var(--green);
  background: var(--green-bg);
  box-shadow: 0 4px 0 #b7e89a;
}

.option-btn.wrong {
  border-color: var(--red);
  background: var(--red-bg);
  box-shadow: 0 4px 0 #ffb3b3;
}

.option-image {
  margin-bottom: 0;
  width: 100%;
}

.option-text {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.option-index {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--gray-light);
  color: var(--text-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 900;
}

.option-btn.selected .option-index,
.option-btn.correct .option-index {
  background: var(--green);
  color: var(--white);
}

.option-btn.wrong .option-index {
  background: var(--red);
  color: var(--white);
}

.matching {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 2px solid var(--border);
  box-shadow: 0 4px 0 var(--border);
}

.match-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.match-item,
.word-chip {
  min-height: 48px;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--white);
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  overflow-wrap: anywhere;
  transition:
    border-color var(--transition),
    background var(--transition),
    box-shadow var(--transition),
    transform var(--transition);
}

.match-item {
  width: 100%;
  box-shadow: 0 3px 0 var(--border);
}

.match-item:active:not(:disabled),
.word-chip:active:not(:disabled) {
  transform: translateY(2px);
}

.match-item.selected,
.word-chip:not(:disabled):hover {
  border-color: var(--blue);
  background: var(--blue-bg);
  box-shadow: 0 3px 0 #84d8ff;
}

.match-item.matched {
  border-color: var(--green);
  background: var(--green-bg);
  box-shadow: none;
  opacity: 0.86;
}

.word-order {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.built-sentence {
  min-height: 96px;
  padding: 12px;
  border: 2px dashed #c8c8c8;
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--white) 0%, #fbfbfb 100%);
  display: flex;
  align-items: stretch;
}

.sentence-line {
  width: 100%;
  min-height: 68px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
  align-items: flex-start;
}

.placeholder {
  color: var(--text-lighter);
  font-size: 14px;
  font-weight: 700;
  align-self: center;
  margin: auto;
}

.word-bank {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 2px;
}

.word-chip {
  box-shadow: 0 3px 0 var(--border);
}

.word-chip:disabled:not(.built) {
  opacity: 0.28;
  box-shadow: none;
}

.word-chip.built {
  border-color: var(--green);
  background: var(--green-bg);
  box-shadow: 0 3px 0 #b7e89a;
}

.text-input-wrap {
  margin-top: 2px;
}

.text-input {
  width: 100%;
  min-height: 58px;
  padding: 15px 16px;
  border: 2px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 700;
  box-sizing: border-box;
  background: var(--white);
  color: var(--text);
  box-shadow: 0 4px 0 var(--border);
  outline: none;
}

.text-input:focus {
  border-color: var(--blue);
  box-shadow: 0 4px 0 #84d8ff;
}

@media (max-width: 380px) {
  .options.image-options {
    grid-template-columns: 1fr;
  }

  .matching {
    gap: 8px;
    padding: 10px;
  }

  .match-item,
  .word-chip {
    font-size: 14px;
  }
}
</style>
