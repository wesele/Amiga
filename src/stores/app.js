import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStore = defineStore("app", () => {
  const title = ref("Amiga");
  const loadedModules = ref([]);

  function setTitle(t) {
    title.value = t;
  }

  function registerModule(name) {
    if (!loadedModules.value.includes(name)) {
      loadedModules.value.push(name);
    }
  }

  return { title, loadedModules, setTitle, registerModule };
});
