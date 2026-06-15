<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="logo-icon">🏭</span>
        <div>
          <h1>内容生产系统</h1>
          <p class="sub">Idioma Content Studio</p>
        </div>
      </div>
      <nav>
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.title }}</span>
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <div class="api-status" :class="apiConfigured ? 'status-success' : 'status-error'">
          <span class="status-dot"></span>
          {{ apiConfigured ? 'API 已配置' : 'API 未配置' }}
        </div>
      </div>
    </aside>
    <main class="main">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStorage } from '../composables/useStorage.js'

const router = useRouter()
const storage = useStorage()

const navItems = router.getRoutes()
  .filter(r => r.meta?.title)
  .map(r => ({
    path: r.path,
    title: r.meta.title,
    icon: r.meta.icon
  }))

const apiConfig = ref(storage.getApiConfig())
const apiConfigured = computed(() => !!(apiConfig.value.apiKey && apiConfig.value.baseUrl))

onMounted(async () => {
  apiConfig.value = await storage.fetchApiConfig()
})
</script>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  width: var(--sidebar-w);
  background: var(--white);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 10;
}

.sidebar-logo {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 28px;
}

.sidebar-logo h1 {
  font-size: 15px;
  font-weight: 700;
  color: var(--green);
}

.sidebar-logo .sub {
  font-size: 10px;
  color: var(--text-lighter);
  letter-spacing: 0.3px;
}

nav {
  flex: 1;
  padding: 8px 0;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  color: var(--text-light);
  text-decoration: none;
  font-size: 13px;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}

.nav-item:hover {
  background: var(--green-bg);
  color: var(--text);
}

.nav-item.router-link-exact-active {
  color: var(--green);
  border-left-color: var(--green);
  background: var(--green-bg);
  font-weight: 600;
}

.nav-icon {
  font-size: 16px;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.api-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.status-success .status-dot { background: var(--green); }
.status-error .status-dot { background: var(--red); }

.main {
  flex: 1;
  padding: 28px 32px;
  min-width: 0;
  overflow-x: hidden;
}
</style>
