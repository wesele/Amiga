<template>
  <component
    :is="componentType"
    :to="to"
    :type="componentType === 'button' ? 'button' : undefined"
    class="settings-item"
    :class="{ danger, divider: showDivider }"
  >
    <div v-if="icon || $slots.icon" class="si-icon">
      <slot name="icon">{{ icon }}</slot>
    </div>
    <div class="si-text">
      <div class="si-title">{{ title }}</div>
      <div v-if="$slots.subtitle || subtitle" class="si-subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </div>
    </div>
    <div class="si-trailing">
      <slot name="trailing">
        <span v-if="trailingText != null" class="si-trailing-text">{{ trailingText }}</span>
        <svg v-if="to || showArrow" class="si-chevron" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M9.29 15.88L13.17 12 9.29 8.12a.996.996 0 111.41-1.41l4.59 4.59c.39.39.39 1.02 0 1.41L10.7 15.3a.996.996 0 01-1.41 0c-.38-.39-.39-1.03 0-1.42z"/>
        </svg>
      </slot>
    </div>
  </component>
</template>

<script setup>
import { computed, useAttrs } from "vue";

const props = defineProps({
  icon: String,
  title: String,
  subtitle: String,
  to: String,
  danger: Boolean,
  trailingText: String,
  showArrow: Boolean,
  showDivider: { type: Boolean, default: true },
});

const attrs = useAttrs();
const componentType = computed(() => {
  if (props.to) return "router-link";
  if (attrs.onClick) return "button";
  return "div";
});
</script>

<style scoped>
.settings-item {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 14px 16px;
  min-height: 56px;
  text-decoration: none;
  color: var(--text);
  background: var(--surface);
  cursor: default;
  transition: background var(--transition);
  width: 100%;
  border: 0;
  font: inherit;
  text-align: left;
  /* Keep focus rings inside the card (parent often has overflow:hidden). */
  border-radius: 0;
  position: relative;
}
.settings-item:not(div) {
  cursor: pointer;
}
.settings-item:hover {
  background: var(--surface-variant);
}
.settings-item.divider:not(:last-child) {
  border-bottom: 1px solid var(--border);
}
.settings-item.danger .si-title {
  color: var(--red);
}

/* TV: inset focus ring — global scale/outer outline is clipped by .settings-card
 * overflow:hidden and looks messy on full-width list rows. */
.settings-item:focus-visible {
  z-index: 2;
  outline: 3px solid #1cb0f6 !important;
  outline-offset: -3px;
  box-shadow: inset 0 0 0 1px rgba(28, 176, 246, 0.22) !important;
  background: var(--green-bg);
  transform: none !important;
}
.settings-item.danger:focus-visible {
  background: var(--red-bg);
  outline-color: var(--red) !important;
}

.si-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 20px;
  margin-right: 8px;
  border-radius: 50%;
  background: transparent;
}

.si-text {
  flex: 1;
  min-width: 0;
}
.si-title {
  font-size: 16px;
  font-weight: 400;
  line-height: 1.3;
}
.si-subtitle {
  font-size: 13px;
  color: var(--text-lighter);
  margin-top: 2px;
  line-height: 1.3;
}

.si-trailing {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 16px;
  flex-shrink: 0;
}
.si-trailing-text {
  font-size: 14px;
  color: var(--text-lighter);
}
.si-chevron {
  color: var(--text-lighter);
  flex-shrink: 0;
  opacity: 0.7;
}
</style>
