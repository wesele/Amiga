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
      <router-link to="/vocab" class="nav-item" active-class="active">
        <div class="nav-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zm-7-1h2v-4h4V9h-4V5h-2v4H9v2h4v4z"/>
          </svg>
        </div>
        <span class="nav-label">单词</span>
      </router-link>
      <router-link to="/interaction" class="nav-item" active-class="active">
        <div class="nav-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
            <path d="M7 9h2v2H7V9zm4 0h2v2h-2V9zm4 0h2v2h-2V9z"/>
          </svg>
        </div>
        <span class="nav-label">互动</span>
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
  const noNavRoutes = ["wizard", "reader", "interaction-chat"];
  return !noNavRoutes.includes(route.name);
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
  height: 64px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  z-index: 100;
  position: relative;
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
