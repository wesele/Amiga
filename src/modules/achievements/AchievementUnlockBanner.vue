<template>
  <div v-if="primary" class="achievement-unlock-banner">
    <span class="unlock-icon" aria-hidden="true">{{ primary.icon }}</span>
    <div class="unlock-copy">
      <p class="unlock-title">
        {{ t("achievements.unlockBanner", { label: badgeLabel(primary) }) }}
        <span v-if="extraCount > 0" class="unlock-more">+{{ extraCount }}</span>
      </p>
      <button type="button" class="unlock-action" @click="goToAchievements">
        {{ t("achievements.unlockBannerAction") }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { pickPrimaryUnlockBadge } from "./achievementUnlockDetect.js";

const props = defineProps({
  badges: {
    type: Array,
    default: () => [],
  },
});

const { t } = useI18n();
const router = useRouter();

const primary = computed(() => pickPrimaryUnlockBadge(props.badges).primary);
const extraCount = computed(() => pickPrimaryUnlockBadge(props.badges).extraCount);

function badgeLabel(badge) {
  return t(badge.labelKey, badge.labelParams);
}

function goToAchievements() {
  router.push({ name: "achievements" });
}
</script>

<style scoped>
.achievement-unlock-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 12px 0 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #fff8e6 0%, #e8f7ef 100%);
  border: 1px solid rgba(212, 160, 23, 0.25);
}

.unlock-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}

.unlock-copy {
  flex: 1;
  min-width: 0;
}

.unlock-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
}

.unlock-more {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-lighter);
}

.unlock-action {
  padding: 6px 12px;
  border: 1px solid rgba(46, 158, 106, 0.35);
  border-radius: var(--radius-sm);
  background: var(--white);
  color: var(--green);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
</style>