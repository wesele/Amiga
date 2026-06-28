<template>
  <router-view />
  <ConfirmDialog
    :show="showSchemaDialog"
    :title="t('schemaIncompatible.title')"
    :message="t('schemaIncompatible.message')"
    :confirmText="resettingSchema ? t('schemaIncompatible.resetting') : t('schemaIncompatible.confirm')"
    :cancelText="t('schemaIncompatible.cancel')"
    danger
    @confirm="handleSchemaReset"
    @cancel="dismissSchemaDialog"
  />
  <ConfirmDialog
    :show="globalAlert.show"
    :title="globalAlert.title"
    :message="globalAlert.message"
    :confirmText="globalAlert.confirmText || t('app.ok')"
    alert-only
    @confirm="dismissGlobalAlert"
    @cancel="dismissGlobalAlert"
  />
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import ConfirmDialog from "@/shared/components/ConfirmDialog.vue";
import { inTauri, isSchemaCompatible, resetDatabase } from "@/shared/api.js";
import { ALERT_SHOW } from "@/shared/alert.js";
import { eventBus } from "@/shared/eventBus.js";
import { useI18n } from "@/shared/i18n";

const { t } = useI18n();
const showSchemaDialog = ref(false);
const resettingSchema = ref(false);
const globalAlert = ref({
  show: false,
  title: "",
  message: "",
  confirmText: "",
});

function dismissGlobalAlert() {
  globalAlert.value = { show: false, title: "", message: "", confirmText: "" };
}

let unsubscribeAlert = null;

async function checkSchemaCompatibility() {
  if (!inTauri()) return;

  try {
    showSchemaDialog.value = !(await isSchemaCompatible());
  } catch {
    // Browser dev and early Tauri startup can both miss the backend.
  }
}

function dismissSchemaDialog() {
  if (resettingSchema.value) return;
  showSchemaDialog.value = false;
}

async function handleSchemaReset() {
  if (resettingSchema.value) return;

  resettingSchema.value = true;
  try {
    await resetDatabase();
    window.location.reload();
  } catch {
    resettingSchema.value = false;
  }
}

onMounted(() => {
  checkSchemaCompatibility();
  unsubscribeAlert = eventBus.on(ALERT_SHOW, ({ title = "", message = "", confirmText = "" } = {}) => {
    globalAlert.value = { show: true, title, message, confirmText };
  });
});

onUnmounted(() => {
  unsubscribeAlert?.();
});
</script>
