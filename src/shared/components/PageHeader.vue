<template>
  <header :class="headerClass">
    <template v-if="variant === 'news'">
      <div class="header-row">
        <button
          v-if="showBack"
          type="button"
          class="back-btn"
          :aria-label="backLabel"
          @click="handleBack"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <slot name="title">
          <h1 class="page-title">{{ title }}</h1>
        </slot>
        <div v-if="$slots.actions" class="header-actions">
          <slot name="actions" />
        </div>
      </div>
      <slot name="below" />
    </template>

    <template v-else-if="variant === 'path'">
      <button
        v-if="showBack"
        type="button"
        class="back-btn"
        :aria-label="backLabel"
        @click="handleBack"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <div class="path-title">
        <slot name="title">
          <h1 class="page-title">{{ title }}</h1>
        </slot>
      </div>
      <div v-if="$slots.actions" class="header-actions">
        <slot name="actions" />
      </div>
    </template>

    <template v-else>
      <button
        v-if="showBack"
        type="button"
        class="back-btn"
        :aria-label="backLabel"
        @click="handleBack"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
      </button>
      <slot name="title">
        <h1 class="page-title">{{ title }}</h1>
      </slot>
      <div v-if="$slots.actions" class="header-actions">
        <slot name="actions" />
      </div>
    </template>
  </header>
</template>

<script setup>
import { computed, getCurrentInstance } from "vue";
import { useParentBack } from "@/shared/useParentBack.js";

const props = defineProps({
  title: { type: String, default: "" },
  showBack: { type: Boolean, default: true },
  backLabel: { type: String, default: undefined },
  variant: {
    type: String,
    default: "sticky",
    validator: (v) => ["sticky", "prompts", "news", "path"].includes(v),
  },
});

const emit = defineEmits(["back"]);
const instance = getCurrentInstance();
const { goBack } = useParentBack();

const hasBackListener = computed(() => {
  const vnodeProps = instance?.vnode?.props;
  return Boolean(vnodeProps?.onBack);
});

const headerClass = computed(() => {
  if (props.variant === "news") return ["list-header", "variant-news"];
  return ["page-header", `variant-${props.variant}`];
});

function handleBack() {
  if (hasBackListener.value) {
    emit("back");
  } else {
    goBack();
  }
}
</script>

<style scoped>
.page-header,
.list-header {
  flex-shrink: 0;
}

.variant-sticky {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.variant-sticky .back-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
  border-radius: 50%;
  transition: background var(--transition);
  flex-shrink: 0;
}

.variant-sticky .back-btn:hover {
  background: var(--surface-variant);
}

.variant-sticky .page-title {
  font-size: 20px;
  font-weight: 500;
  margin: 0;
}

.variant-prompts {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px 12px;
}

.variant-prompts .page-title {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
  color: var(--text);
  flex: 1;
}

.variant-prompts .back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background var(--transition);
}

.variant-prompts .back-btn:hover {
  background: var(--surface-variant);
}

.variant-news {
  padding: 8px 12px 12px;
  background: var(--surface);
}

.variant-news .header-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.variant-news .back-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background var(--transition);
  flex-shrink: 0;
}

.variant-news .back-btn:hover {
  background: var(--surface-variant);
}

.variant-news .page-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.variant-path {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 56px;
  align-items: center;
  column-gap: 8px;
  padding: 14px 16px 12px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}

.variant-path .back-btn {
  grid-column: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: var(--gray-light);
  color: var(--text);
  cursor: pointer;
  border-radius: 12px;
}

.variant-path .header-actions {
  grid-column: 3;
  grid-row: 1;
  display: flex;
  align-items: center;
  align-self: center;
  justify-self: end;
}

.variant-path .path-title {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  align-self: center;
  justify-self: center;
  text-align: center;
}

.header-actions {
  display: contents;
}

.variant-sticky .header-actions,
.variant-prompts .header-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.variant-sticky .header-actions:empty,
.variant-prompts .header-actions:empty {
  display: none;
}
</style>
