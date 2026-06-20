<template>
  <div class="md-preview">
    <header class="md-preview-header">
      <h2>{{ t('preview.title') }}</h2>
      <p>{{ t('preview.subtitle') }}</p>
    </header>
    <div class="md-preview-list">
      <div
        v-for="(item, i) in samples"
        :key="i"
        class="md-preview-bubble"
      >
        <div class="md-preview-avatar">🤖</div>
        <div class="md-preview-bubble-inner">
          <MarkdownText :content="item" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import MarkdownText from "@/shared/components/MarkdownText.vue";
import { useI18n } from "@/shared/i18n";

const { t } = useI18n();

// Sample chat replies from the AI. These illustrate how Markdown content
// renders in the chat bubble, not the UI labels.
const samples = [
  "你好！我是 **Amiga**，你的 AI 语言学习伙伴 🤖\n\n很高兴见到你。",
  "当然可以！学习西班牙语有以下几个步骤：\n\n1. **掌握发音规则**\n2. *学习基础语法*\n3. 练习日常对话\n4. 阅读简单文章\n\n> 持之以恒是最重要的！",
  "这里有一个简单的代码示例：\n\n```js\nfunction greet(name) {\n  return `Hola, ${name}!`;\n}\n```\n\n你可以用 `greet('Maria')` 来调用它。",
  "我推荐你学习这些资源：\n\n- [Duolingo](https://duilngo.com) - 免费入门\n- *Anki* - 间隔重复记忆\n- **italki** - 与母语者交流\n\n更多内容请看 [这里](https://example.com)。",
  "## 关于 `ser` 和 `estar` 的区别\n\n在西班牙语中，`ser` 和 `estar` 都表示\"是\"，但用法不同：\n\n| 用法 | ser | estar |\n|------|-----|-------|\n| 身份 | ✓ | ✗ |\n| 位置 | ✗ | ✓ |\n| 临时状态 | ✗ | ✓ |\n\n记住这个口诀：***SER 是永久的，ESTAR 是暂时的。***",
];
</script>

<style scoped>
.md-preview {
  padding: 16px;
  background: var(--bg);
  min-height: 100%;
  overflow-y: auto;
}
.md-preview-header {
  padding: 0 4px 16px;
}
.md-preview-header h2 {
  margin: 0 0 4px;
  font-size: 20px;
  color: var(--text);
}
.md-preview-header p {
  margin: 0;
  font-size: 13px;
  color: var(--text-lighter);
}
.md-preview-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.md-preview-bubble {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 88%;
}
.md-preview-avatar {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}
.md-preview-bubble-inner {
  background: var(--white);
  border-radius: 16px 16px 16px 4px;
  padding: 10px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
}
</style>
