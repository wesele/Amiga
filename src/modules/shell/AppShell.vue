<template>
  <div class="app-shell">
    <main class="app-content">
      <router-view />
    </main>
    <nav class="bottom-nav" v-if="showNav">
      <router-link to="/news" class="nav-item" active-class="active">
        <div class="nav-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h5V7h-5v10zm-2 0V7H5v10h5z"/>
          </svg>
        </div>
        <span class="nav-label">学习</span>
      </router-link>
      <router-link to="/profile" class="nav-item" active-class="active">
        <div class="nav-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
        <span class="nav-label">我的</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const showNav = computed(() => {
  const noNavRoutes = ["wizard", "reader"];
  return !noNavRoutes.includes(route.name);
});
</script>

<style scoped>
.app-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.bottom-nav {
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: calc(64px + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  z-index: 100;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 16px 4px;
  text-decoration: none;
  color: var(--text-lighter);
  font-size: 11px;
  font-weight: 600;
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

.nav-label {
  line-height: 1.2;
}
</style>
