<template>
  <div class="app-shell">
    <main class="app-content">
      <router-view />
    </main>
    <template v-if="showNav">
      <nav class="bottom-nav">
        <button
          v-for="tab in tabs"
          :key="tab.name"
          class="nav-item"
          :class="{ active: isTabActive(tab) }"
          :aria-label="navItemAria(tab)"
          @click="switchTab(tab)"
        >
          <div class="nav-icon-wrap">
            <div class="nav-icon" v-html="tab.icon" />
            <span
              v-if="badgeFor(tab).show"
              class="nav-badge"
              :class="{
                'is-urgent': badgeFor(tab).urgent,
                'is-dot': badgeFor(tab).dotOnly || !badgeFor(tab).count,
              }"
            >
              <template v-if="!badgeFor(tab).dotOnly && badgeFor(tab).count">
                {{ formatBadgeCount(badgeFor(tab).count) }}
              </template>
            </span>
          </div>
          <span class="nav-label">{{ t(tab.label) }}</span>
        </button>
      </nav>
    </template>
    <div class="bottom-nav-safe" aria-hidden="true" />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { eventBus } from "@/shared/eventBus.js";
import { ACHIEVEMENT_ATTENTION_CHANGED } from "@/modules/achievements/achievementUnlockDetect.js";
import { useTargetLangStore, TARGET_LANG_CHANGED } from "@/stores/targetLang.js";
import {
  loadNavAttentionContext,
  shouldForceNavAttentionRefresh,
} from "./loadNavAttentionContext.js";
import { computeNavBadges, formatBadgeCount } from "./navAttention.js";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const targetLangStore = useTargetLangStore();
const navAttentionCtx = ref(null);
const achievementAttentionTick = ref(0);
let unsubscribeLang = null;
let unsubscribeAchievementAttention = null;

const tabs = [
  {
    name: "learn",
    label: "nav.learn",
    icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h5V7h-5v10zm-2 0V7H5v10h5z"/></svg>',
  },
  {
    name: "achievements",
    label: "nav.achievements",
    icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>',
  },
  {
    name: "chat",
    label: "nav.chat",
    icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7V9zm4 0h2v2h-2V9zm4 0h2v2h-2V9z"/></svg>',
  },
  {
    name: "profile",
    label: "nav.profile",
    icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
  },
];

const tabRootNames = new Set(tabs.map((t) => t.name));

function isTabActive(tab) {
  const name = route.name;
  if (name === tab.name) return true;
  let r = route;
  while (r?.meta?.parent) {
    if (r.meta.parent === tab.name) return true;
    r = router.resolve({ name: r.meta.parent });
  }
  return false;
}

function switchTab(tab) {
  if (route.name === tab.name) return;
  // All L1 tab switches replace the current entry — they do NOT
  // push. Per the navigation rules in issue #2, the four bottom
  // tabs are siblings and don't navigate *between* each other; they
  // switch views. Pushing would put a "previous tab" entry on the
  // history stack, so a hardware back press would land on the
  // previously-selected tab instead of exiting.
  router.replace({ name: tab.name });
}

const showNav = computed(() => {
  const noNavRoutes = ["wizard", "reader", "chat-session", "social-chat", "learn-translator"];
  return !noNavRoutes.includes(route.name);
});

const activeTabName = computed(() => {
  for (const tab of tabs) {
    if (isTabActive(tab)) return tab.name;
  }
  return null;
});

const navBadges = computed(() => {
  achievementAttentionTick.value;
  return computeNavBadges(navAttentionCtx.value ?? {}, { activeTab: activeTabName.value });
});

function badgeFor(tab) {
  return navBadges.value[tab.name] ?? { show: false, count: 0 };
}

function navItemAria(tab) {
  const badge = badgeFor(tab);
  const label = t(tab.label);
  if (!badge.show) return label;
  if (tab.name === "learn" && badge.count) {
    return `${label} · ${t("shell.navBadgeLearn", { n: badge.count })}`;
  }
  if (tab.name === "chat") {
    return `${label} · ${t("shell.navBadgeChat")}`;
  }
  if (tab.name === "achievements" && badge.count) {
    return `${label} · ${t("shell.navBadgeAchievements", { n: badge.count })}`;
  }
  return label;
}

async function refreshNavAttention({ force = false } = {}) {
  try {
    navAttentionCtx.value = await loadNavAttentionContext(
      { targetLangStore },
      { force },
    );
  } catch {
    navAttentionCtx.value = null;
  }
}

onMounted(() => {
  refreshNavAttention();
  unsubscribeLang = eventBus.on(TARGET_LANG_CHANGED, () => {
    refreshNavAttention({ force: true });
  });
  unsubscribeAchievementAttention = eventBus.on(ACHIEVEMENT_ATTENTION_CHANGED, () => {
    achievementAttentionTick.value += 1;
  });
});

onUnmounted(() => {
  unsubscribeLang?.();
  unsubscribeAchievementAttention?.();
});

watch(
  () => route.name,
  (name, previousName) => {
    refreshNavAttention({
      force: shouldForceNavAttentionRefresh(previousName),
    });
  },
);
</script>

<style scoped>
.app-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.app-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.bottom-nav {
  display: flex;
  align-items: center;
  justify-content: space-around;
  /* Fixed 64px interactive bar. Items are vertically centered in this
   * 64px box; the system safe-area is owned by a sibling .bottom-nav-safe
   * element below, NOT by padding on this element, so the items can
   * actually sit in the middle of the bar (padding-bottom would shrink
   * the flex line cross-size and push the items to the top). */
  height: 64px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  z-index: 100;
  position: relative;
}

/* Safe-area strip at the very bottom of the shell. Same background as the
 * bottom-nav when the nav is visible; matches the page background when the
 * nav is hidden. On Android, --safe-bottom is set by the
 * __amigaSetInsets JS bridge from MainActivity.kt; on iOS it comes
 * from env(safe-area-inset-bottom). This strip always renders so the
 * system navigation bar never overlaps content, regardless of whether
 * the interactive bottom-nav is shown. */
.bottom-nav-safe {
  height: var(--safe-bottom, env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  flex-shrink: 0;
  z-index: 100;
  position: relative;
}

/* When the bottom-nav is hidden, the safe-area strip should blend with
 * the page background instead of the nav-bar surface color. */
.app-shell:not(:has(.bottom-nav)) .bottom-nav-safe {
  background: var(--bg);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 16px 4px;
  color: var(--text-lighter);
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition);
  min-width: 64px;
  position: relative;
}

.nav-item.active {
  color: var(--green);
  background: var(--green-bg);
}

.nav-item.active .nav-icon {
  transform: translateY(-2px);
}

.nav-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  transition: transform var(--transition);
}

.nav-badge {
  position: absolute;
  top: -2px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--purple);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  border: 2px solid var(--surface);
  pointer-events: none;
}

.nav-badge.is-urgent {
  background: #e85d04;
}

.nav-badge.is-dot {
  width: 8px;
  min-width: 8px;
  height: 8px;
  padding: 0;
  top: 0;
  right: -2px;
}

.nav-label {
  line-height: 1.2;
}
</style>
