<template>
  <img
    class="amiga-icon"
    :src="iconUrl"
    :width="size"
    :height="size"
    alt="Amiga"
  />
</template>

<script setup>
import { amigaIconUrl as iconUrl } from "./amiga-icon.js";

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
