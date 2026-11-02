import {
  DEFAULT_PROMPTS,
  createSeedState,
  demoReadingQuestions,
  frameworkSource,
  localDate,
  questionsSource,
  resolvePair,
  vocabularyRows,
} from "../webFixtures.js";
import { WebStateStore } from "../webStorage.js";
import { createWebLlmClient, parseJsonReply } from "../webLlm.js";
import { fetchNewsThroughProxy } from "../webNews.js";

export const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1"];
export const store = new WebStateStore({ seed: createSeedState });
export const llm = createWebLlmClient();

export function applyRuntimeDefaults(state) {
  const defaults = createSeedState();
  const savedBuiltinThinking = state.settings?.builtin_thinking_enabled;
  const savedThinkingModel = state.settings?.builtin_thinking_model;
  let changed = false;
  state.llm_config ||= clone(defaults.llm_config);
  state.llm_config.builtin = clone(defaults.llm_config.builtin);
  state.settings ||= {};
  if (
    savedThinkingModel === state.llm_config.builtin.model
    && (savedBuiltinThinking === "true" || savedBuiltinThinking === "false")
  ) {
    state.llm_config.builtin.thinking_enabled = savedBuiltinThinking === "true";
  } else {
    changed = true;
    state.settings.builtin_thinking_enabled = "true";
    state.settings.builtin_thinking_model = state.llm_config.builtin.model;
  }
  if (!state.imported_articles || state.imported_articles.length === 0) {
    state.imported_articles = clone(defaults.imported_articles || []);
    changed = true;
  }
  return changed;
}

export function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function activeConfig(state) {
  return state.llm_config?.mode === "custom"
    ? state.llm_config.primary
    : state.llm_config.builtin;
}

export async function chat(state, system, user, options) {
  return llm.chat(state.llm_config, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], options);
}

function pairUnits(nativeLang, targetLang, cefr) {
  const pair = resolvePair(nativeLang, targetLang);
  return { pair, units: pair ? frameworkSource[pair.key]?.[cefr]?.units || [] : [] };
}

function orderedPathNodes(pairKey, units) {
  return units.flatMap((unit) => [
    `${pairKey}/${unit.id}-GRAMMAR`,
    `${pairKey}/${unit.id}-VOCAB`,
    ...(unit.sections || []).map((section) => `${pairKey}/${unit.id}-${section.id}`),
  ]);
}

export function uniqueUnitWords(unit) {
  const found = new Set();
  for (const section of unit.sections || []) {
    for (const word of section.coveredWords || []) found.add(word);
  }
  return [...found];
}

export function pathCurriculum(state, nativeLang, targetLang, cefr) {
  const { pair, units } = pairUnits(nativeLang, targetLang, cefr);
  if (!pair) return { pair_key: "", cefr, units: [], total_sections: 0, completed_sections: 0, total_stars: 0, status: "unsupported" };
  if (!units.length) return { pair_key: pair.key, cefr, units: [], total_sections: 0, completed_sections: 0, total_stars: 0, status: "level_complete" };

  const ordered = orderedPathNodes(pair.key, units);
  const progress = state.path_progress || {};
  const firstIncomplete = ordered.find((id) => !(progress[id]?.stars > 0));
  const nodes = units.map((unit) => {
    const sectionNodes = [
      { id: `${pair.key}/${unit.id}-GRAMMAR`, kind: "grammar", title_native: "单元知识", title_target: "Gramática", question_count: 1 },
      { id: `${pair.key}/${unit.id}-VOCAB`, kind: "vocab", title_native: "单词学习", title_target: "Vocabulario", question_count: uniqueUnitWords(unit).length },
      ...(unit.sections || []).map((section) => ({
        id: `${pair.key}/${unit.id}-${section.id}`,
        kind: "practice",
        title_native: section.titleNative || "练习",
        title_target: section.titleTarget || "Práctica",
        question_count: questionsSource.filter((question) => question.pairId === pair.key && question.cefr === cefr && question.sectionId === `${pair.key}/${unit.id}-${section.id}`).length,
      })),
    ].map((node) => {
      const index = ordered.indexOf(node.id);
      const previous = index > 0 ? ordered[index - 1] : null;
      const saved = progress[node.id] || {};
      return {
        ...node,
        stars: saved.stars || 0,
        best_score: saved.best_score || 0,
        locked: Boolean(previous && !(progress[previous]?.stars > 0)),
        current: firstIncomplete === node.id,
      };
    });
    return {
      id: unit.id,
      title_native: unit.titleNative || "",
      title_target: unit.titleTarget || "",
      goal_native: unit.goalNative || "",
      sections: sectionNodes,
    };
  });

  const values = Object.values(progress);
  return {
    pair_key: pair.key,
    cefr,
    units: nodes,
    total_sections: ordered.length,
    completed_sections: ordered.filter((id) => progress[id]?.stars > 0).length,
    total_stars: values.reduce((sum, item) => sum + (item.stars || 0), 0),
    status: "active",
  };
}

export function completePathNode(state, nodeId, correctCount, totalCount) {
  const score = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 100;
  const stars = score >= 90 ? 3 : score >= 75 ? 2 : score >= 60 ? 1 : 0;
  const previous = state.path_progress[nodeId] || { stars: 0, best_score: 0, attempts: 0 };
  state.path_progress[nodeId] = {
    stars: Math.max(previous.stars, stars),
    best_score: Math.max(previous.best_score, score),
    attempts: previous.attempts + 1,
    completed_at: stars > 0 ? previous.completed_at || nowIso() : previous.completed_at || null,
  };
  const [, pairKey, rest] = nodeId.match(/^([^/]+)\/(.+)$/) || [];
  const goal = state.goals.find((item) => item.target_language === state.target_language) || state.goals[0];
  const { units } = pairUnits(state.user.native_language, state.target_language, goal?.cefr_level || "A1");
  const ordered = pairKey ? orderedPathNodes(pairKey, units) : [];
  const index = ordered.indexOf(rest ? `${pairKey}/${rest}` : nodeId);
  return {
    stars: state.path_progress[nodeId].stars,
    best_score: state.path_progress[nodeId].best_score,
    passed: stars > 0,
    next_section_id: index >= 0 ? ordered[index + 1] || null : null,
    level_upgraded: false,
    new_cefr_level: null,
  };
}

export function allVocab(state) {
  return [...vocabularyRows(), ...(state.discovered_words || [])];
}

export function withMastery(state, word) {
  const saved = state.vocab_mastery[String(word.id)];
  return {
    ...word,
    mastery: saved?.mastery ?? null,
    source: saved?.source ?? null,
    updated_at: saved?.updated_at ?? null,
  };
}

export function achievementProgress(state) {
  const days = Object.values(state.achievement_days || {}).sort((a, b) => a.date.localeCompare(b.date));
  const active = days.filter((day) => day.app_open || day.reading_count || day.news_count || day.soulmate_status);
  const full = days.filter((day) => [day.app_open > 0, day.reading_count > 0 || day.reading_am > 0 || day.reading_pm > 0, day.news_count > 0, day.soulmate_status > 0].filter(Boolean).length >= 2);
  const streak = (items) => {
    let best = 0;
    let run = 0;
    let previous = null;
    for (const item of items) {
      const current = new Date(`${item.date}T00:00:00`);
      run = previous && current - previous === 86400000 ? run + 1 : 1;
      best = Math.max(best, run);
      previous = current;
    }
    const today = new Date(`${localDate()}T00:00:00`);
    const current = previous && today - previous <= 86400000 ? run : 0;
    return [current, best];
  };
  const [checkCurrent, checkBest] = streak(active.filter((day) => day.app_open > 0));
  const [fullCurrent, fullBest] = streak(full);
  return { check_in_current: checkCurrent, check_in_best: checkBest, full_learning_current: fullCurrent, full_learning_best: fullBest, learning_total: active.length };
}

export function soulmateHome(state, targetLang) {
  const world = state.soulmate.worlds[targetLang];
  if (!world) return { initialized: false, world: null, greeting: "", state: "story_available", episode_id: null, day_number: 0 };
  const episodes = state.soulmate.episodes.filter((episode) => episode.world_id === world.id).sort((a, b) => b.day_number - a.day_number);
  const episode = episodes[0] || null;
  const messages = episode ? state.soulmate.messages[episode.id] || [] : [];
  const status = !episode || episode.story_date !== localDate()
    ? "story_available"
    : messages.length > 1 ? "chat_started" : episode.status || "story_in_progress";
  return {
    initialized: true,
    world: clone(world),
    greeting: `Hola, soy ${world.companion_name}. ¿Aprendemos algo juntos hoy?`,
    state: status,
    episode_id: episode?.id || null,
    day_number: episode?.day_number || 0,
  };
}

export {
  DEFAULT_PROMPTS,
  createSeedState,
  demoReadingQuestions,
  fetchNewsThroughProxy,
  frameworkSource,
  localDate,
  parseJsonReply,
  questionsSource,
  resolvePair,
  vocabularyRows,
};
