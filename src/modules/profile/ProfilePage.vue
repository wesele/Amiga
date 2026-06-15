<template>
  <div class="profile-page">
    <!-- Profile Header -->
    <div class="profile-header">
      <div class="avatar-large">{{ user?.avatar || '😊' }}</div>
      <h2 class="profile-name">{{ user?.nickname || '学习者' }}</h2>
      <div class="profile-lang">
        <span v-if="goals.length > 0" class="lang-badge">
          {{ langLabel(goals[0].target_language) }} · {{ goals[0].cefr_level }}
        </span>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-value">0</div>
        <div class="stat-label">学习天数</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ vocabStats?.total_known || 0 }}</div>
        <div class="stat-label">已掌握词汇</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">0</div>
        <div class="stat-label">已读文章</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">0</div>
        <div class="stat-label">连续天数</div>
      </div>
    </div>

    <!-- Menu -->
    <div class="menu-list">
      <router-link to="/profile/settings" class="menu-item">
        <div class="menu-icon">⚙️</div>
        <span class="menu-label">设置</span>
        <span class="menu-arrow">›</span>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { getCurrentUser, getLearningGoals, getUserVocabStats } from "@/shared/api.js";

const user = ref(null);
const goals = ref([]);
const vocabStats = ref(null);

onMounted(async () => {
  try {
    user.value = await getCurrentUser();
    goals.value = await getLearningGoals(user.value.id);
    vocabStats.value = await getUserVocabStats(user.value.id);
  } catch (e) {
    console.error("Failed to load profile:", e);
  }
});

function langLabel(code) {
  const map = { es: "西班牙语", zh: "中文", en: "英语", ja: "日语", fr: "法语" };
  return map[code] || code;
}
</script>

<style scoped>
.profile-page {
  min-height: 100%;
  background: var(--bg);
}

.profile-header {
  background: var(--surface);
  padding: 32px 20px 20px;
  text-align: center;
  border-bottom: 1px solid var(--border);
}

.avatar-large {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--green-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  margin: 0 auto 12px;
  border: 3px solid var(--green);
}

.profile-name {
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 6px;
}

.profile-lang {
  margin-top: 4px;
}

.lang-badge {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 14px;
  border-radius: 16px;
  background: var(--blue-bg);
  color: var(--blue);
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);
  margin: 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.stat-item {
  background: var(--surface);
  padding: 16px 12px;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--green);
}

.stat-label {
  font-size: 11px;
  color: var(--text-lighter);
  margin-top: 2px;
}

.menu-list {
  background: var(--surface);
  margin: 0 16px;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  text-decoration: none;
  color: var(--text);
  border-bottom: 1px solid var(--border);
  transition: background var(--transition);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: var(--surface-variant);
}

.menu-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.menu-label {
  flex: 1;
  font-size: 15px;
  font-weight: 500;
}

.menu-arrow {
  font-size: 20px;
  color: var(--text-lighter);
}
</style>
