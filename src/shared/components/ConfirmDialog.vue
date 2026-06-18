<template>
  <Teleport to="body">
    <div v-if="show" class="confirm-overlay" @click.self="$emit('cancel')">
      <div class="confirm-card" :class="{ danger }">
        <h3 class="confirm-title">{{ title }}</h3>
        <p class="confirm-message">{{ message }}</p>
        <div class="confirm-actions">
          <button class="confirm-btn cancel" @click="$emit('cancel')">{{ cancelText }}</button>
          <button class="confirm-btn confirm" :class="{ danger }" @click="$emit('confirm')">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  show: Boolean,
  title: { type: String, default: "确认" },
  message: { type: String, default: "" },
  confirmText: { type: String, default: "确定" },
  cancelText: { type: String, default: "取消" },
  danger: Boolean,
});
defineEmits(["confirm", "cancel"]);
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.confirm-card {
  background: var(--surface);
  border-radius: 20px;
  width: 100%;
  max-width: 320px;
  padding: 24px 24px 16px;
}

.confirm-title {
  font-size: 20px;
  font-weight: 500;
  margin: 0 0 8px;
}

.confirm-message {
  font-size: 14px;
  color: var(--text-lighter);
  line-height: 1.5;
  margin: 0 0 20px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.confirm-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 20px;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--transition);
}

.confirm-btn:hover {
  background: var(--surface-variant);
}

.confirm-btn.confirm {
  color: var(--blue);
}

.confirm-btn.confirm.danger {
  color: var(--red);
}

.confirm-btn.confirm:hover {
  background: var(--blue-bg);
}

.confirm-btn.confirm.danger:hover {
  background: var(--red-bg);
}
</style>
