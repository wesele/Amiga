<template>
  <div class="result-page">
    <header class="result-header">
      <p class="eyebrow">评测结果</p>
      <h1>大致处于 {{ result.cefr }}</h1>
      <p>置信度 {{ result.confidence }}%，建议作为学习起点，不是固定标签。</p>
    </header>

    <section class="score-panel">
      <div class="score-number">{{ result.overall }}</div>
      <div>
        <p class="score-label">综合表现</p>
        <p class="score-copy">下一步会按这个水平推荐路径和练习。</p>
      </div>
    </section>

    <section class="breakdown">
      <button
        v-for="item in breakdownRows"
        :key="item.skill"
        type="button"
        class="skill-row"
        @click="openPractice(item.skill)"
      >
        <span class="skill-name">{{ item.label }}</span>
        <span class="bar"><span :style="{ width: item.score + '%' }" /></span>
        <span class="skill-score">{{ item.score }}</span>
        <span class="skill-comment">{{ item.comment }}</span>
      </button>
    </section>

    <section class="suggestions">
      <h2>下一步</h2>
      <p v-for="suggestion in result.suggestions" :key="suggestion">{{ suggestion }}</p>
    </section>

    <footer class="result-actions">
      <button type="button" class="secondary-btn" @click="retake">重测</button>
      <button type="button" class="primary-btn" @click="saveAndContinue">保存并继续</button>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { updateLearningGoalCefr } from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { SKILL_LABELS } from "./scoring.js";

const router = useRouter();
const targetLangStore = useTargetLangStore();

const fallback = {
  overall: 0,
  cefr: "A1",
  confidence: 48,
  breakdown: Object.keys(SKILL_LABELS).reduce((acc, skill) => {
    acc[skill] = { score: 0, comment: skill === "listening" ? "暂无听力数据，先保留占位。" : "暂无数据。" };
    return acc;
  }, {}),
  suggestions: ["先完成一次 5 分钟轻测，再生成建议。"],
};

const result = ref(loadResult());
const breakdownRows = computed(() =>
  Object.entries(SKILL_LABELS).map(([skill, label]) => ({
    skill,
    label,
    score: result.value.breakdown?.[skill]?.score || 0,
    comment: result.value.breakdown?.[skill]?.comment || "暂无数据。",
  })),
);

function loadResult() {
  try {
    return JSON.parse(sessionStorage.getItem("assessment.latest_result")) || fallback;
  } catch {
    return fallback;
  }
}

function routeForSkill(skill) {
  if (skill === "vocabulary") return { name: "vocab" };
  if (skill === "reading") return { name: "news" };
  if (skill === "expression") return { name: "expression" };
  return { name: "path" };
}

function openPractice(skill) {
  router.push(routeForSkill(skill));
}

function retake() {
  router.replace({ name: "assessment" });
}

async function saveAndContinue() {
  try {
    const targetLang = targetLangStore.code || (await targetLangStore.load());
    await updateLearningGoalCefr(targetLang, result.value.cefr);
  } catch {
    // Result remains visible even when profile persistence is unavailable.
  }
  router.replace({ name: "learn" });
}
</script>

<style scoped>
.result-page {
  min-height: 100%;
  padding: 20px 16px calc(20px + var(--safe-bottom));
  background: var(--bg);
}

.result-header {
  margin-bottom: 14px;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--green-hover);
  font-size: 12px;
  font-weight: 900;
}

.result-header h1 {
  margin: 0;
  font-size: 26px;
  line-height: 1.2;
}

.result-header p {
  margin: 8px 0 0;
  color: var(--text-light);
  line-height: 1.45;
}

.score-panel {
  display: grid;
  grid-template-columns: 82px 1fr;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  box-shadow: var(--shadow);
}

.score-number {
  display: grid;
  place-items: center;
  width: 82px;
  height: 82px;
  border-radius: 50%;
  background: var(--green-bg);
  color: var(--green-hover);
  font-size: 28px;
  font-weight: 900;
}

.score-label {
  margin: 0;
  font-size: 18px;
  font-weight: 900;
}

.score-copy {
  margin: 6px 0 0;
  color: var(--text-light);
  line-height: 1.4;
}

.breakdown {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 14px 0;
}

.skill-row {
  display: grid;
  grid-template-columns: 48px 1fr 36px;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  text-align: left;
  font: inherit;
}

.skill-name {
  font-weight: 900;
}

.bar {
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--gray-light);
}

.bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--blue);
}

.skill-score {
  text-align: right;
  font-weight: 900;
}

.skill-comment {
  grid-column: 1 / -1;
  color: var(--text-light);
  font-size: 13px;
}

.suggestions {
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid var(--border);
}

.suggestions h2 {
  margin: 0 0 8px;
  font-size: 17px;
}

.suggestions p {
  margin: 8px 0 0;
  color: var(--text-light);
  line-height: 1.4;
}

.result-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

.secondary-btn,
.primary-btn {
  min-height: 46px;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 900;
}

.secondary-btn {
  border: 1px solid var(--border);
  background: var(--white);
  color: var(--text);
}

.primary-btn {
  border: none;
  background: var(--green);
  color: var(--white);
  box-shadow: 0 4px 0 var(--green-hover);
}
</style>
