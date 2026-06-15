import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/bank',
    name: 'bank',
    component: () => import('../views/QuestionBank.vue'),
    meta: { title: '题库管理', icon: '📚' }
  },
  {
    path: '/system-config',
    name: 'system-config',
    component: () => import('../views/SystemConfig.vue'),
    meta: { title: '语言管理', icon: '🛠️' }
  },
  {
    path: '/vocab',
    name: 'vocab',
    component: () => import('../views/VocabManager.vue'),
    meta: { title: '词库管理', icon: '📖' }
  },
  {
    path: '/type-manager',
    name: 'type-manager',
    component: () => import('../views/QuestionTypeManager.vue'),
    meta: { title: '题型管理', icon: '🧩' }
  },
  {
    path: '/prompt-manager',
    name: 'prompt-manager',
    component: () => import('../views/PromptManager.vue'),
    meta: { title: 'AI 提示词管理', icon: '🪄' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/Settings.vue'),
    meta: { title: 'API 设置', icon: '🔑' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  document.title = `${to.meta.title || 'Idioma'} - 内容生产系统`
})

export default router
