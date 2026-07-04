<template>
  <div class="review-page">
    <header class="review-header">
      <button type="button" class="back-btn" @click="router.replace({ name: 'learn' })">x</button>
      <div>
        <p class="eyebrow">Review basket</p>
        <h1>5-minute review</h1>
      </div>
    </header>

    <div v-if="loading" class="center-state">Loading...</div>
    <section v-else-if="current" class="review-card">
      <p class="tag">{{ current.skill_tag || current.source_type }}</p>
      <h2>{{ current.title }}</h2>
      <p class="prompt">{{ current.prompt || current.answer }}</p>
      <div class="actions">
        <button type="button" class="secondary" @click="finish(false)">Again</button>
        <button type="button" class="primary" @click="finish(true)">Got it</button>
      </div>
      <p class="counter">{{ index + 1 }} / {{ queue.length }}</p>
    </section>
    <section v-else class="empty-panel">
      <h2>All clear</h2>
      <p>Review basket is empty. Continue the path or read a short article.</p>
      <button type="button" class="primary" @click="router.replace({ name: 'path' })">
        Continue path
      </button>
      <button type="button" class="secondary" @click="router.replace({ name: 'news' })">
        Real reading
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { completeReviewItem, listReviewQueue } from "@/shared/api.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { loadLearningContext } from "@/shared/learningContext.js";

const router = useRouter();
const targetLangStore = useTargetLangStore();
const loading = ref(true);
const queue = ref([]);
const index = ref(0);
const userId = ref("");
const current = computed(() => queue.value[index.value] || null);

async function load() {
  loading.value = true;
  try {
    const ctx = await loadLearningContext({ targetLangStore });
    userId.value = ctx.user.id;
    queue.value = await listReviewQueue(ctx.user.id, ctx.targetLang, 10);
  } catch {
    queue.value = [];
  } finally {
    loading.value = false;
  }
}

async function finish(remembered) {
  if (!current.value) return;
  await completeReviewItem(userId.value, current.value.id, remembered).catch(() => {});
  index.value += 1;
}

onMounted(load);
</script>

<style scoped>
.review-page {
  min-height: 100%;
  padding: 18px 16px 28px;
  background: var(--bg);
}

.review-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--white);
  color: var(--text-light);
  font: inherit;
  font-weight: 900;
}

.eyebrow {
  margin: 0 0 2px;
  color: var(--green-hover);
  font-size: 12px;
  font-weight: 800;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 24px;
  line-height: 1.15;
}

.center-state,
.review-card,
.empty-panel {
  min-height: 360px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--white);
  box-shadow: var(--shadow);
}

.center-state {
  display: grid;
  place-items: center;
  color: var(--text-light);
}

.review-card,
.empty-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
  padding: 20px;
}

.tag {
  align-self: flex-start;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  background: var(--blue-bg);
  color: var(--blue-hover);
  font-size: 12px;
  font-weight: 800;
}

.prompt {
  color: var(--text-light);
  line-height: 1.6;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.primary,
.secondary {
  min-height: 44px;
  border-radius: var(--radius-sm);
  font: inherit;
  font-weight: 800;
}

.primary {
  border: none;
  background: var(--green);
  color: var(--white);
}

.secondary {
  border: 1px solid var(--border);
  background: var(--white);
  color: var(--text);
}

.counter {
  color: var(--text-lighter);
  text-align: center;
  font-size: 12px;
}
</style>
