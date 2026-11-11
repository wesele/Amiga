<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.more" />
  </svg>
</template>
<script setup>
defineProps({ name: String });
const paths = {
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  previousBeat: "M5 5v14m14-14L8 12l11 7V5z",
  nextBeat: "M19 5v14M5 5l11 7-11 7V5z",
  more: "M5 11v2m7-2v2m7-2v2",
  close: "M6 6l12 12M6 18L18 6",
  play: "M9 5l10 7-10 7V5z",
  pause: "M9 5v14M15 5v14",
  mic: "M9 5a3 3 0 016 0v6a3 3 0 01-6 0V5zm-3 5v1a6 6 0 0012 0v-1M12 17v5m-3 0h6",
  micOff: "M3 3l18 18M9 5a3 3 0 016 0v5M9 9v2a3 3 0 004 2m-7-3v1a6 6 0 0010 4m2-5v1M12 17v5m-3 0h6",
  ask: "M5 4h14a2 2 0 012 2v10a2 2 0 01-2 2H9l-6 4V6a2 2 0 012-2zM8 9h8m-8 4h5",
  send: "M12 19V5m-6 6l6-6 6 6",
  audio: "M4 9h4l5-4v14l-5-4H4V9zm12-1a6 6 0 010 8m3-11a10 10 0 010 14",
};
</script>
<style scoped>
svg {
  display: block;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
</style>
