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
    <circle cx="12" cy="12" r="10" stroke="#58cc02" />
    <line x1="2" y1="12" x2="22" y2="12" stroke="#1cb0f6" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="#58cc02" />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 40 },
});
</script>

<style scoped>
svg {
  display: inline-block;
  vertical-align: middle;
}
</style>
