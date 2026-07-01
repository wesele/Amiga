<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="onOverlayClick">
      <div class="modal-content" :class="sizeClass">
        <h3 v-if="title" class="modal-title">{{ title }}</h3>
        <p v-if="description" class="modal-desc">{{ description }}</p>
        <slot />
        <div v-if="$slots.actions" class="modal-actions">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  show: Boolean,
  title: { type: String, default: "" },
  description: { type: String, default: "" },
  size: { type: String, default: "sm" },
  closeOnOverlay: { type: Boolean, default: true },
});

const emit = defineEmits(["close"]);

const sizeClass = computed(() => (props.size === "sm" ? "modal-sm" : `modal-${props.size}`));

function onOverlayClick() {
  if (props.closeOnOverlay) {
    emit("close");
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal-content {
  background: var(--surface);
  border-radius: 20px;
  width: 100%;
  padding: 24px 24px 16px;
}

.modal-content.modal-sm {
  max-width: 320px;
}

.modal-title {
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 4px;
}

.modal-desc {
  font-size: 14px;
  color: var(--text-lighter);
  margin: 8px 0 16px;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>