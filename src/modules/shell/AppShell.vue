<template>
  <div class="app-shell" :class="{ 'tv-shell': isTvLayoutMode }">
    <main class="app-content">
      <router-view />
    </main>
    <template v-if="showNav">
      <nav class="bottom-nav" :aria-label="isTvLayoutMode ? 'TV navigation' : undefined">
        <button v-for="tab in tabs" :key="tab.name" class="nav-item" :class="{ active: isTabActive(tab) }" @click="switchTab(tab)">
          <div class="nav-icon" v-html="tab.icon" />
          <span v-if="tab.name === 'chat' && totalUnread > 0" class="nav-dot" />
          <span class="nav-label">{{ t(tab.label) }}</span>
        </button>
      </nav>
    </template>
    <div class="bottom-nav-safe" aria-hidden="true" />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/shared/i18n";
import { eventBus } from "@/shared/eventBus.js";
import { getTotalUnreadCount, SOCIAL_TOTAL_UNREAD_CHANGED } from "@/modules/chat/social/socialPreview.js";
import { isTvLayoutMode, isTvMode } from "@/shared/appMode.js";
import { shouldShowL1Nav } from "@/shared/tvPolicy.js";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const totalUnread = ref(0);
let unsubscribeTotalUnread = null;

const allTabs = [
  {
    name: "learn",
    label: "nav.learn",
    icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h5V7h-5v10zm-2 0V7H5v10h5z"/></svg>',
  },
  {
    name: "achievements",
    label: "nav.achievements",
    icon: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 3V2H7v1H2v5c0 2.21 1.79 4 4 4h.35A6.02 6.02 0 0 0 11 15.91V19H7v2h10v-2h-4v-3.09A6.02 6.02 0 0 0 17.65 12H18c2.21 0 4-1.79 4-4V3h-5zM6 10c-1.1 0-2-.9-2-2V5h3v3c0 .7.12 1.37.35 2H6zm14-2c0 1.1-.9 2-2 2h-1.35c.23-.63.35-1.3.35-2V5h3v3z"/></svg>',
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

const tabs = computed(() => (
  isTvMode ? allTabs.filter((tab) => tab.name !== "chat") : allTabs
));

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

const showNav = computed(() => shouldShowL1Nav(route.name, isTvLayoutMode));

onMounted(() => {
  if (isTvMode) return;
  totalUnread.value = getTotalUnreadCount();
  unsubscribeTotalUnread = eventBus.on(SOCIAL_TOTAL_UNREAD_CHANGED, (count) => {
    totalUnread.value = count;
  });
});

onUnmounted(() => {
  unsubscribeTotalUnread?.();
});
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

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  transition: transform var(--transition);
}

.nav-dot {
  position: absolute;
  top: 5px;
  right: calc(50% - 20px);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  border: 2px solid var(--surface);
}

.nav-label {
  line-height: 1.2;
}

.tv-shell {
  flex-direction: row;
  background:
    radial-gradient(circle at 82% 12%, rgba(88, 204, 2, 0.12), transparent 28%),
    linear-gradient(145deg, #f9fff4 0%, #eef7f3 55%, #edf6ff 100%);
}

.tv-shell .app-content {
  order: 2;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  /* Tight frame around full-pane pages (was 40px — left empty gutters on 16:9). */
  padding: 16px 20px 20px;
  scroll-padding: 48px;
  /* Keep vertical scroll for long pages (news/list); full-height pages
   * (achievements/path) use min-height:0 + height:100% to fill one screen. */
  overflow-x: hidden;
  overflow-y: auto;
}

.tv-shell .app-content > * {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.tv-shell .bottom-nav {
  order: 1;
  width: 220px;
  height: 100%;
  flex-direction: column;
  /* Top-align so Learn / Achievements / Profile stay fully visible
   * without hunting a vertically-centered cluster near the bottom edge. */
  justify-content: flex-start;
  align-items: stretch;
  gap: 12px;
  padding: 28px 18px 24px;
  border-top: 0;
  border-right: 1px solid rgba(28, 27, 31, 0.1);
  box-shadow: 12px 0 40px rgba(36, 74, 55, 0.08);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(18px);
  overflow: hidden;
  box-sizing: border-box;
}

.tv-shell .nav-item {
  min-width: 0;
  min-height: 64px;
  flex: 0 0 auto;
  flex-direction: row;
  justify-content: flex-start;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 18px;
  text-align: left;
}

.tv-shell .nav-icon {
  width: 34px;
  height: 34px;
}

.tv-shell .nav-icon :deep(svg) {
  width: 32px;
  height: 32px;
}

.tv-shell .nav-item.active .nav-icon {
  transform: none;
}

.tv-shell .bottom-nav-safe {
  display: none;
}
</style>
