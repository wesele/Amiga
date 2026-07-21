import { ref, computed } from "vue";
import { getCurrentUser, getLearningGoals } from "@/shared/backend/user.js";
import { useTargetLangStore } from "@/stores/targetLang.js";
import { pickLearningGoal } from "@/shared/learningGoal.js";

export const DEFAULT_TARGET_LANG = "es";
export const DEFAULT_NATIVE_LANG = "zh";
export const DEFAULT_CEFR = "A1";

/**
 * Load the current learning context: user, target/native language, goals, and CEFR.
 *
 * @param {object} [options]
 * @param {import('@/stores/targetLang.js').useTargetLangStore} [options.targetLangStore]
 * @param {string} [options.cefrFallback]
 * @param {boolean} [options.fallbackToFirstGoal] use first goal when none matches target lang
 * @param {boolean} [options.loadGoals=true]
 */
export async function loadLearningContext(options = {}) {
  const {
    targetLangStore = useTargetLangStore(),
    cefrFallback = DEFAULT_CEFR,
    fallbackToFirstGoal = false,
    loadGoals = true,
  } = options;

  const user = await getCurrentUser();
  const targetLang =
    targetLangStore.code || (await targetLangStore.load()) || DEFAULT_TARGET_LANG;
  const nativeLang = user?.native_language || DEFAULT_NATIVE_LANG;

  let goals = [];
  let currentGoal = null;

  if (loadGoals && user?.id) {
    goals = (await getLearningGoals(user.id)) || [];
    currentGoal = pickLearningGoal(goals, targetLang);
    if (!currentGoal && fallbackToFirstGoal && goals.length) {
      currentGoal = goals[0];
    }
  }

  const cefr = currentGoal?.cefr_level || cefrFallback || DEFAULT_CEFR;

  return { user, targetLang, nativeLang, goals, currentGoal, cefr };
}

/**
 * Reactive composable for loading and holding the current learning context.
 */
export function useLearningContext() {
  const user = ref(null);
  const targetLang = ref(DEFAULT_TARGET_LANG);
  const nativeLang = ref(DEFAULT_NATIVE_LANG);
  const goals = ref([]);
  const currentGoal = ref(null);
  const cefrOverride = ref(null);
  const cefr = computed(
    () => cefrOverride.value || currentGoal.value?.cefr_level || DEFAULT_CEFR,
  );
  const loading = ref(false);
  const error = ref("");

  async function load(options = {}) {
    loading.value = true;
    error.value = "";
    try {
      const ctx = await loadLearningContext(options);
      user.value = ctx.user;
      targetLang.value = ctx.targetLang;
      nativeLang.value = ctx.nativeLang;
      goals.value = ctx.goals;
      currentGoal.value = ctx.currentGoal;
      cefrOverride.value = ctx.cefr;
      return ctx;
    } catch (e) {
      error.value = e?.message || String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    user,
    targetLang,
    nativeLang,
    goals,
    currentGoal,
    cefr,
    loading,
    error,
    load,
  };
}
