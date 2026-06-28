<template>
  <svg
    class="group-chat-icon"
    :width="size"
    :height="size"
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <circle cx="20" cy="20" r="20" fill="var(--green-bg)" />
    <circle cx="14" cy="17" r="4.5" fill="var(--green)" />
    <circle cx="26" cy="17" r="4.5" fill="var(--green)" />
    <path
      d="M8 30c0-3.5 3.1-6 6-6h2c1.2 0 2.3.3 3.2.9-1.4 1.5-2.2 3.5-2.2 5.6V30H8z"
      fill="var(--green)"
      opacity="0.85"
    />
    <path
      d="M20.8 24.9c1.1-.8 2.4-1.2 3.9-1.2h2c3 0 5.4 2.3 5.4 5.1V30H20v-.9c0-1.8-.7-3.5-1.9-4.8.6-.2 1.2-.3 1.7-.3z"
      fill="var(--green)"
    />
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