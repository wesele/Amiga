<template>
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke-width="2.5" 
    stroke-linecap="round" 
    stroke-linejoin="round" 
    :width="size" 
    :height="size"
  >
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93.77 6.7 2.06" stroke="var(--green)" />
    <path d="M21 12a9 9 0 1 1-9 9c2.52 0 4.93-.77 6.7-2.06" stroke="var(--blue)" />
    <polyline points="21 3 21 9 15 9" stroke="var(--green)" />
    <polyline points="3 21 3 15 9 15" stroke="var(--blue)" />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 20 },
});
</script>

<style scoped>
svg {
  display: inline-block;
  vertical-align: middle;
}
</style>
