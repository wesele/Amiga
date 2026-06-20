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
import { computed } from "vue";
import MarkdownText from "@/shared/components/MarkdownText.vue";
import { useI18n } from "@/shared/i18n";
import { useTargetLangStore } from "@/stores/targetLang.js";

const { t } = useI18n();
const targetLangStore = useTargetLangStore();

// Sample chat replies from the AI. These illustrate how Markdown content
// renders in the chat bubble, not the UI labels. Samples are chosen based
// on the user's target language so the preview reflects what they will
// actually see when chatting with Amiga.
const samples = computed(() => {
  const lang = targetLangStore.code || "es";
  if (lang === "en") {
    return [
      "Hi! I'm **Amiga**, your AI language buddy 🤖\n\nNice to meet you.",
      "Sure! Here are the steps to learn English:\n\n1. **Master pronunciation**\n2. *Learn basic grammar*\n3. Practice daily conversation\n4. Read simple articles\n\n> Consistency is the key!",
      "Here's a simple code example:\n\n```js\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n```\n\nYou can call it with `greet('Maria')`.",
      "Recommended resources:\n\n- [Duolingo](https://duolingo.com) - Free intro\n- *Anki* - Spaced repetition\n- **italki** - Talk to native speakers\n\nSee [here](https://example.com) for more.",
      "## About `its` vs `it's`\n\nIn English, `its` (possessive) and `it's` (it is) are often confused:\n\n| Use | Form | Example |\n|-----|------|---------|\n| Possessive | its | The dog wagged its tail. |\n| Contraction | it's | It's raining. |\n\nTip: ***If you can replace it with \"it is\", use the apostrophe.***",
    ];
  }
  if (lang === "zh") {
    return [
      "你好！我是 **Amiga**，你的 AI 语言学习伙伴 🤖\n\n很高兴见到你。",
      "当然可以！学习中文有以下几个步骤：\n\n1. **掌握拼音**\n2. *学习基础语法*\n3. 练习日常对话\n4. 阅读简单文章\n\n> 持之以恒是最重要的！",
      "这里有一个简单的代码示例：\n\n```js\nfunction greet(name) {\n  return `你好, ${name}!`;\n}\n```\n\n你可以用 `greet('小明')` 来调用它。",
      "我推荐你学习这些资源：\n\n- [Duolingo](https://duolingo.com) - 免费入门\n- *Anki* - 间隔重复记忆\n- **italki** - 与母语者交流\n\n更多内容请看 [这里](https://example.com)。",
      "## 关于「的」「得」「地」\n\n中文中三个「de」经常被混用：\n\n| 用法 | 例子 |\n|------|------|\n| 修饰名词 | 我的书 |\n| 修饰动词 | 跑得快 |\n| 修饰形容词 | 高兴地说 |\n\n记住：***定语用「的」，状语用「地」，补语用「得」。***",
    ];
  }
  return [
    "你好！我是 **Amiga**，你的 AI 语言学习伙伴 🤖\n\n很高兴见到你。",
    "当然可以！学习西班牙语有以下几个步骤：\n\n1. **掌握发音规则**\n2. *学习基础语法*\n3. 练习日常对话\n4. 阅读简单文章\n\n> 持之以恒是最重要的！",
    "这里有一个简单的代码示例：\n\n```js\nfunction greet(name) {\n  return `Hola, ${name}!`;\n}\n```\n\n你可以用 `greet('Maria')` 来调用它。",
    "我推荐你学习这些资源：\n\n- [Duolingo](https://duilngo.com) - 免费入门\n- *Anki* - 间隔重复记忆\n- **italki** - 与母语者交流\n\n更多内容请看 [这里](https://example.com)。",
    "## 关于 `ser` 和 `estar` 的区别\n\n在西班牙语中，`ser` 和 `estar` 都表示\"是\"，但用法不同：\n\n| 用法 | ser | estar |\n|------|-----|-------|\n| 身份 | ✓ | ✗ |\n| 位置 | ✗ | ✓ |\n| 临时状态 | ✗ | ✓ |\n\n记住这个口诀：***SER 是永久的，ESTAR 是暂时的。***",
  ];
});
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
