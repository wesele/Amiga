<template>
  <Transition name="practice-q" mode="out-in">
    <div v-if="questionKey" :key="questionKey" class="practice-q-wrap">
      <slot />
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  questionKey: { type: String, default: "" },
});
</script>

<style scoped>
.practice-q-wrap {
  width: 100%;
}

.practice-q-enter-active {
  transition:
    opacity 0.26s ease,
    transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}

.practice-q-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.practice-q-enter-from {
  opacity: 0;
  transform: translateY(14px);
}

.practice-q-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (prefers-reduced-motion: reduce) {
  .practice-q-enter-active,
  .practice-q-leave-active {
    transition: none;
  }
}
</style>