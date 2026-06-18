<template>
  <div>
    <div class="flex justify-between items-center mb-4">
      <div class="flex items-center gap-3">
        <button class="btn btn-sm btn-secondary" @click="goBack">← 返回</button>
        <div>
          <h2 class="page-title">{{ isNew ? '添加提示词' : '编辑提示词' }}</h2>
          <p class="page-desc">配置 LLM 提示词的内容和参数</p>
        </div>
      </div>
      <button class="btn btn-primary" @click="save">💾 保存</button>
    </div>

    <div class="card" style="max-width: 800px">
      <div class="form-group">
        <label>提示词 ID (唯一标识)</label>
        <input v-model="form.id" :disabled="!isNew" placeholder="例如: question-gen" />
      </div>
      <div class="form-group">
        <label>标题</label>
        <input v-model="form.title" placeholder="例如: 题目生成模板" />
      </div>
      <div class="form-group">
        <label>分类</label>
        <input v-model="form.category" placeholder="例如: 题目生产" />
      </div>
      <div class="form-group">
        <label>提示词内容 (支持 ${variable} 占位符)</label>
        <textarea v-model="form.content" rows="16" class="prompt-textarea" placeholder="请输入提示词..."></textarea>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePromptStorage } from '../composables/usePromptStorage.js'

const route = useRoute()
const router = useRouter()
const { prompts, savePrompt: storageSavePrompt } = usePromptStorage()

const isNew = computed(() => route.params.id === 'new')

const form = reactive({
  id: '',
  title: '',
  category: '',
  content: ''
})

function goBack() {
  router.push('/prompt-manager')
}

function save() {
  if (!form.id || !form.content) {
    alert('请填写 ID 和内容')
    return
  }
  storageSavePrompt(form.id, {
    title: form.title,
    category: form.category,
    content: form.content
  })
  goBack()
}

onMounted(() => {
  const id = route.params.id
  if (id && id !== 'new' && prompts.value[id]) {
    const p = prompts.value[id]
    form.id = id
    form.title = p.title || ''
    form.category = p.category || ''
    form.content = p.content || ''
  }
})
</script>

<style scoped>
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}
.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}
.form-group input:disabled {
  background: var(--bg);
  opacity: 0.6;
}
.prompt-textarea {
  width: 100%;
  padding: 12px;
  font-family: 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid var(--border);
  border-radius: 6px;
  resize: vertical;
  box-sizing: border-box;
}
</style>
