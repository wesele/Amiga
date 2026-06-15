import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/index.js'
import App from './App.vue'
import './assets/main.css'

// 全局数据初始化（从服务端加载所有数据）
import { init as initSystemConfig } from './composables/useSystemConfig.js'
import { init as initVocab } from './composables/useVocabStorage.js'
import { init as initStorage } from './composables/useStorage.js'
import { init as initFramework } from './composables/useUnitFramework.js'
import { init as initPrompts } from './composables/usePromptStorage.js'
import { init as initTypes } from './composables/useQuestionTypeStorage.js'

async function bootstrap() {
  await Promise.all([
    initSystemConfig(),
    initVocab(),
    initStorage(),
    initFramework(),
    initPrompts(),
    initTypes()
  ])

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

bootstrap().catch(err => {
  console.error('数据初始化失败，使用默认值启动:', err)
  // 即使初始化失败也启动应用（使用默认空数据）
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
})
