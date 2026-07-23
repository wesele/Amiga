<template>
  <div class="prompt-page" :class="{ 'tv-content-pane': isTvLayoutMode }">
    <PageHeader :title="t('prompts.title')" variant="prompts">
      <template #actions>
        <button class="reset-all-btn" :data-tv-defer-focus="isTvLayoutMode && loading ? true : undefined" @click="showResetDialog = true">{{ t('prompts.resetAll') }}</button>
      </template>
    </PageHeader>

    <div v-if="loading" class="loading-center">
      <div class="spinner" />
    </div>

    <template v-else>
      <div v-if="error" class="error-banner">{{ error }}</div>

      <div class="category-group" v-for="(group, c) in grouped" :key="c">
        <div class="category-title">{{ c }}</div>
        <div
          v-for="p in group"
          :key="p.key"
          class="prompt-card"
          role="button"
          tabindex="0"
          :data-tv-focus-key="`prompt-${p.key}`"
          @click="openEditor(p.key)"
          @keydown.enter.prevent="openEditor(p.key)"
          @keydown.space.prevent="openEditor(p.key)"
        >
          <div class="prompt-summary">
            <div class="prompt-name">{{ p.name }}</div>
            <div class="prompt-key">{{ p.key }}</div>
            <div class="prompt-preview">{{ p.system_prompt }}</div>
          </div>
        </div>
      </div>

      <div v-if="Object.keys(grouped).length === 0" class="empty-state">{{ t('prompts.empty') }}</div>
    </template>

    <ConfirmDialog
      :show="showResetDialog"
      :title="t('prompts.resetConfirmTitle')"
      :message="t('prompts.resetConfirmMsg')"
      :confirmText="t('prompts.reset')"
      danger
      @confirm="resetAll"
      @cancel="showResetDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getAllPrompts, resetAllPrompts as apiResetAll } from "@/shared/backend/prompts.js";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { useI18n } from "@/shared/i18n";
import { isTvLayoutMode } from "@/shared/appMode.js";

const router = useRouter();
const { t } = useI18n();
const loading = ref(true);
const error = ref("");
const prompts = ref([]);
const showResetDialog = ref(false);

const grouped = computed(() => {
  const g = {};
  for (const p of prompts.value) {
    const c = p.category || t("prompts.uncategorized");
    if (!g[c]) g[c] = [];
    g[c].push(p);
  }
  return g;
});

function openEditor(key) {
  router.push(`/prompts/${key}`);
}

async function resetAll() {
  showResetDialog.value = false;
  try {
    await apiResetAll();
    await loadPrompts();
  } catch (e) {
    error.value = t("prompts.resetFail");
  }
}

async function loadPrompts() {
  try {
    prompts.value = await getAllPrompts();
  } catch (e) {
    error.value = t("common.fail");
    prompts.value = [];
  }
}

onMounted(async () => {
  loading.value = true;
  await loadPrompts();
  loading.value = false;
});
</script>

<style scoped>
.prompt-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
}

.reset-all-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border: 1.5px solid var(--red);
  border-radius: 12px;
  background: transparent;
  color: var(--red);
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  white-space: nowrap;
}

.reset-all-btn:hover {
  background: var(--red-bg);
}

.loading-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--green);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-banner {
  margin: 0 20px 12px;
  padding: 10px 16px;
  background: var(--red-bg);
  color: var(--red);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-lighter);
  font-size: 14px;
}

.category-group {
  padding: 0 20px 12px;
}

.category-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-light);
  margin-bottom: 8px;
  padding: 0 4px;
}

.prompt-card {
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  margin-bottom: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
  outline: none;
}

.prompt-card:hover {
  border-color: var(--green);
  background: var(--surface-variant);
}

.prompt-card:focus-visible,
.reset-all-btn:focus-visible {
  z-index: 2;
  outline: 3px solid #1cb0f6 !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(28, 176, 246, 0.2) !important;
  transform: none !important;
}
.prompt-card:focus-visible {
  border-color: var(--green);
  background: var(--green-bg);
  outline-offset: -3px;
  box-shadow: inset 0 0 0 1px rgba(28, 176, 246, 0.22) !important;
}

.prompt-summary {
  padding: 14px 16px;
}

.prompt-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}

.prompt-key {
  font-size: 11px;
  color: var(--text-lighter);
  font-weight: 500;
  margin-bottom: 6px;
  font-family: monospace;
}

.prompt-preview {
  font-size: 12px;
  color: var(--text-light);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
