<template>
  <svg
    class="group-chat-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#58cc02" />
    <circle cx="9" cy="7" r="4" stroke="#58cc02" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="#1cb0f6" />
    <circle cx="19" cy="7" r="4" stroke="#1cb0f6" />
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 40 },
});
</script>

<style scoped>
.group-chat-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>