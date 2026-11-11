<template>
  <div class="plan-generation-status">
    <p role="status">{{ t(`classroom.generation_${stage}`) }}</p>
    <progress aria-hidden="true" />
    <div class="generation-metrics">
      <small>{{ t("classroom.generationElapsed", { seconds }) }}</small>
      <small v-if="tokenCount">
        {{ t(tokenCount.estimated ? "classroom.generationTokensApprox" : "classroom.generationTokens", tokenCount) }}
      </small>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import { useI18n } from "@/shared/i18n";

defineProps({ stage: { type: String, required: true }, tokenCount: Object });
const { t } = useI18n();
const seconds = ref(0);
let timer;
onMounted(() => {
  const start = performance.now();
  timer = setInterval(() => {
    seconds.value = Math.floor((performance.now() - start) / 1000);
  }, 1000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<style scoped>
.plan-generation-status {
  display: grid;
  gap: 7px;
  width: 100%;
  max-width: 320px;
  margin-inline: auto;
}
.plan-generation-status p {
  margin: 0;
  font-size: 14px;
}
.plan-generation-status progress {
  width: 100%;
  height: 6px;
  accent-color: var(--accent, #83ba99);
}
.plan-generation-status small {
  font-size: 12px;
  opacity: 0.8;
}
.generation-metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  font-variant-numeric: tabular-nums;
}
</style>
