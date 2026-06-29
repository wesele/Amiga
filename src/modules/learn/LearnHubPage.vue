<template>
  <div class="learn-hub">
    <header class="page-header">
      <h1 class="page-title">{{ t("learn.title") }}</h1>
    </header>

    <div class="module-grid">
      <button
        v-for="mod in modules"
        :key="mod.id"
        class="module-tile"
        :disabled="opening === mod.id"
        @click="openModule(mod)"
      >
        <span class="module-icon">{{ mod.icon }}</span>
        <span class="module-label">{{ t(mod.labelKey) }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { openAiContact } from "@/modules/chat/openAiContact.js";

const router = useRouter();
const { t } = useI18n();
const targetLangStore = useTargetLangStore();
const opening = ref(null);

const modules = [
  { id: "news", labelKey: "learn.news", icon: "📰", route: { name: "news" } },
  { id: "translator", labelKey: "chat.translator", icon: "🌐", action: "translator" },
];

async function openModule(mod) {
  if (mod.route) {
    router.push(mod.route);
    return;
  }
  if (mod.action === "translator") {
    opening.value = mod.id;
    try {
      const lang = targetLangStore.code || (await targetLangStore.load());
      await openAiContact(
        router,
        { name: t("chat.translator"), contactType: "translator" },
        { routeName: "learn-translator", targetLang: lang },
      );
    } finally {
      opening.value = null;
    }
  }
}
</script>

<style scoped>
.learn-hub {
  min-height: 100%;
  background: var(--bg);
}

.page-header {
  padding: 20px 32px 16px;
  background: var(--white);
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.module-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 40px;
  padding: 56px 48px 64px;
}

.module-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 130px;
  height: 130px;
  padding: 0;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition), box-shadow var(--transition);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
}

.module-tile:hover:not(:disabled) {
  background: var(--green-bg);
}

.module-tile:disabled {
  opacity: 0.6;
  cursor: wait;
}

.module-icon {
  font-size: 36px;
  line-height: 1;
}

.module-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  text-align: center;
  line-height: 1.2;
}
</style>