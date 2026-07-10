<template>
  <div class="q-image-wrap" :class="size">
    <img v-if="displayUrl" :key="displayUrl" :src="displayUrl" :alt="fallback" class="q-image-img" />
    <div v-else-if="imageSvg" :key="imageSvg.slice(0, 64)" class="q-image-svg" v-html="imageSvg" />
    <div v-else class="q-image-placeholder" :class="{ small: size === 'small' }">
      🖼️ {{ fallback || '暂无图片' }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  imageUrl: { type: String, default: '' },
  imageSvg: { type: String, default: '' },
  fallback: { type: String, default: '' },
  size: { type: String, default: 'normal' }
})

const displayUrl = computed(() => props.imageUrl || '')
</script>

<style scoped>
.q-image-wrap {
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  border: 2px solid var(--border, #e5e7eb);
}
.q-image-wrap.small {
  border-radius: 8px;
}
.q-image-img {
  width: 100%;
  height: auto;
  display: block;
  aspect-ratio: 1;
  object-fit: contain;
  background: #fff;
}
.q-image-svg {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}
.q-image-svg :deep(svg) {
  width: 100%;
  height: 100%;
}
.q-image-placeholder {
  width: 100%;
  height: 160px;
  background: #eee;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
  font-size: 14px;
  color: #666;
  border: 2px dashed #ccc;
  border-radius: 12px;
}
.q-image-placeholder.small {
  height: 80px;
  font-size: 11px;
  padding: 8px;
  border-radius: 8px;
}
</style>
