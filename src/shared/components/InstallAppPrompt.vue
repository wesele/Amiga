<template>
  <ModalShell
    :show="show"
    :title="t('installAppPrompt.title')"
    :description="t('installAppPrompt.description')"
    @close="close"
  >
    <a
      ref="projectLink"
      class="project-link"
      :href="AMIGA_GITHUB_URL"
      target="_blank"
      rel="noopener noreferrer"
      @click.prevent="openProject"
    >
      <span class="project-link-label">{{ t("installAppPrompt.github") }}</span>
      <span class="project-link-url">{{ AMIGA_GITHUB_URL }}</span>
    </a>
    <template #actions>
      <button class="dialog-btn" type="button" @click="close">
        {{ t("installAppPrompt.close") }}
      </button>
    </template>
  </ModalShell>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import ModalShell from "@/shared/components/ModalShell.vue";
import { eventBus } from "@/shared/eventBus.js";
import { openExternalUrl } from "@/shared/external.js";
import {
  AMIGA_GITHUB_URL,
  INSTALL_APP_PROMPT_REQUESTED,
} from "@/shared/installAppPrompt.js";
import { useI18n } from "@/shared/i18n";

const { t } = useI18n();
const show = ref(false);
const projectLink = ref(null);
let unsubscribe = null;

function close() {
  show.value = false;
}

async function openProject() {
  await openExternalUrl(AMIGA_GITHUB_URL);
}

onMounted(() => {
  unsubscribe = eventBus.on(INSTALL_APP_PROMPT_REQUESTED, async () => {
    show.value = true;
    await nextTick();
    projectLink.value?.focus();
  });
});

onBeforeUnmount(() => unsubscribe?.());
</script>

<style scoped>
.project-link {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  color: var(--blue);
  text-decoration: none;
  background: var(--blue-bg);
  border: 1px solid rgba(28, 176, 246, 0.24);
  border-radius: 14px;
  transition:
    border-color var(--transition),
    background var(--transition);
}

.project-link:hover {
  border-color: var(--blue);
  background: rgba(28, 176, 246, 0.14);
}

.project-link:focus-visible {
  outline: 3px solid #1cb0f6;
  outline-offset: 3px;
}

.project-link-label {
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
}

.project-link-url {
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dialog-btn {
  padding: 9px 20px;
  border: none;
  border-radius: 20px;
  background: var(--green);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.dialog-btn:hover {
  background: var(--green-hover);
}

.dialog-btn:focus-visible {
  outline: 3px solid #1cb0f6;
  outline-offset: 3px;
}
</style>
