<template>
  <div class="question-image">
    <img v-if="imageUrl" :src="imageUrl" :alt="imageAlt" class="image" />
    <div v-else-if="imageSvg" class="svg-wrap" v-html="sanitizedSvg" role="img" :aria-label="imageAlt" />
    <div v-else class="image-missing" aria-hidden="true">🖼️</div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  imageUrl: { type: String, default: "" },
  imageSvg: { type: String, default: "" },
  imageDesc: { type: String, default: "" },
  alt: { type: String, default: "" },
});

const imageAlt = computed(() => props.alt || props.imageDesc || "");

const sanitizedSvg = computed(() => {
  const svg = (props.imageSvg || "").trim();
  if (!/^<svg[\s>]/i.test(svg)) return "";
  if (/<script|on\w+\s*=|javascript:/i.test(svg)) return "";
  return svg;
});
</script>

<style scoped>
.question-image {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.image,
.svg-wrap {
  width: min(100%, 280px);
  border-radius: var(--radius-md);
  background: var(--white);
  border: 1px solid var(--border);
}

.image {
  display: block;
  aspect-ratio: 1;
  object-fit: cover;
}

.svg-wrap :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}

.image-missing {
  width: min(100%, 280px);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  background: var(--surface-variant);
  border-radius: var(--radius-md);
  border: 1px dashed var(--border);
  opacity: 0.6;
}
</style>
