import { defineStore } from "pinia";
import { ref } from "vue";
import { getTargetLanguage, setTargetLanguage } from "@/shared/backend/user.js";
import { eventBus } from "@/shared/eventBus.js";

export const TARGET_LANG_CHANGED = "targetLang:changed";

export const useTargetLangStore = defineStore("targetLang", () => {
  const code = ref(null);
  const loaded = ref(false);
  const updating = ref(false);

  async function load() {
    if (loaded.value) return code.value;
    try {
      const v = await getTargetLanguage();
      code.value = v || "es";
    } catch {
      code.value = "es";
    } finally {
      loaded.value = true;
    }
    return code.value;
  }

  async function set(newCode) {
    if (!newCode) return;
    if (newCode === code.value && loaded.value) return;
    updating.value = true;
    try {
      await setTargetLanguage(newCode);
      code.value = newCode;
      loaded.value = true;
      eventBus.emit(TARGET_LANG_CHANGED, newCode);
    } finally {
      updating.value = false;
    }
  }

  function reset() {
    code.value = null;
    loaded.value = false;
  }

  return { code, loaded, updating, load, set, reset };
});
