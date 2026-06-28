<template>
  <span class="avatar-emoji" :style="sizeStyle">{{ displayValue }}</span>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  value: { type: String, default: "😊" },
  size: { type: [Number, String], default: 32 },
});

const displayValue = computed(() => props.value || "😊");
const sizeStyle = computed(() => {
  const px = Number(props.size) || 32;
  return {
    width: `${px}px`,
    height: `${px}px`,
    fontSize: `${Math.round(px * 0.62)}px`,
  };
});
</script>

<style scoped>
.avatar-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg);
  line-height: 1;
  flex-shrink: 0;
}
</style>