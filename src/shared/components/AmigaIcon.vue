<template>
  <svg
    class="amiga-icon"
    :width="size"
    :height="size"
    viewBox="0 0 512 512"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Amiga"
  >
    <rect width="512" height="512" rx="96" fill="#58cc02" />
    <text
      x="256"
      y="350"
      text-anchor="middle"
      font-family="Arial, sans-serif"
      font-size="380"
      font-weight="bold"
      fill="white"
    >I</text>
  </svg>
</template>

<script setup>
defineProps({
  size: { type: [Number, String], default: 40 },
});
</script>

<style scoped>
.amiga-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
