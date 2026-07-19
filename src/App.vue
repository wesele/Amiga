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
  <!-- Hard failure to load old retained data (after reinstall etc): offer delete+restart vs exit.
       Cancel must exit because app cannot proceed with broken data. -->
  <ConfirmDialog
    :show="showDataLoadFailDialog"
    :title="t('dataLoadFail.title')"
    :message="dataLoadError ? (t('dataLoadFail.message') + '\n\n' + dataLoadError) : t('dataLoadFail.message')"
    :confirmText="deletingData ? t('dataLoadFail.deleting') : t('dataLoadFail.confirm')"
    :cancelText="t('dataLoadFail.exit')"
    danger
    @confirm="handleDeleteAndRestart"
    @cancel="handleExitApp"
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
import { inTauri, isSchemaCompatible, resetDatabase, getDatabaseStatus, deleteDatabaseAndRestart, exitApp } from "@/shared/api.js";
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
const showDataLoadFailDialog = ref(false);
const deletingData = ref(false);
const dataLoadError = ref("");

function dismissGlobalAlert() {
  globalAlert.value = { show: false, title: "", message: "", confirmText: "" };
}

let unsubscribeAlert = null;

async function checkDatabaseHealth() {
  if (!inTauri()) return;

  try {
    const status = await getDatabaseStatus();
    if (status.error) {
      // Hard failure opening old data (corrupt / permission / etc after reinstall)
      showDataLoadFailDialog.value = true;
      dataLoadError.value = status.error;
    } else if (!status.schema_compatible) {
      showSchemaDialog.value = true;
    }
  } catch {
    // Browser dev and early Tauri startup can both miss the backend.
    // Try legacy path as last resort (may still work for soft case).
    try {
      showSchemaDialog.value = !(await isSchemaCompatible());
    } catch {}
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

async function handleDeleteAndRestart() {
  if (deletingData.value) return;
  deletingData.value = true;
  try {
    await deleteDatabaseAndRestart();
    // Prefer process restart (Rust). If the host keeps the WebView alive
    // (seen on some Android TV builds), fall back to a full page reload.
    window.location.reload();
  } catch (e) {
    deletingData.value = false;
    dataLoadError.value = e?.message || String(e || "delete failed");
  }
}

function handleExitApp() {
  exitApp().catch(() => {
    // Last resort
    try { window.close(); } catch {}
  });
}

onMounted(() => {
  checkDatabaseHealth();
  unsubscribeAlert = eventBus.on(ALERT_SHOW, ({ title = "", message = "", confirmText = "" } = {}) => {
    globalAlert.value = { show: true, title, message, confirmText };
  });
});

onUnmounted(() => {
  unsubscribeAlert?.();
});
</script>
