<template>
  <div class="question-image">
    <img v-if="imageUrl" :src="imageUrl" :alt="alt" class="image" />
    <div v-else-if="imageSvg" class="svg-wrap" v-html="sanitizedSvg" />
    <p v-else-if="imageDesc" class="image-desc">{{ imageDesc }}</p>
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

const sanitizedSvg = computed(() => {
  const svg = props.imageSvg || "";
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

.image-desc {
  margin: 0;
  padding: 16px;
  background: var(--surface-variant);
  border-radius: var(--radius-md);
  color: var(--text-light);
  text-align: center;
  font-size: 15px;
}
</style>