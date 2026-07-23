import {
  DEFAULT_PROMPTS,
  createSeedState,
  demoReadingQuestions,
  frameworkSource,
  localDate,
  questionsSource,
  resolvePair,
  vocabularyRows,
} from "./webFixtures.js";
import { WebStateStore } from "./webStorage.js";
import { createWebLlmClient, parseJsonReply } from "./webLlm.js";
import { fetchNewsThroughProxy } from "./webNews.js";

const LEVELS = ["A0", "A1", "A2", "B1", "B2", "C1"];
const store = new WebStateStore({ seed: createSeedState });
const llm = createWebLlmClient();

function applyRuntimeDefaults(state) {
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
  return changed;
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function normalize(value) {
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

async function chat(state, system, user, options) {
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

function uniqueUnitWords(unit) {
  const found = new Set();
  for (const section of unit.sections || []) {
    for (const word of section.coveredWords || []) found.add(word);
  }
  return [...found];
}

function pathCurriculum(state, nativeLang, targetLang, cefr) {
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

function completePathNode(state, nodeId, correctCount, totalCount) {
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

function allVocab(state) {
  return [...vocabularyRows(), ...(state.discovered_words || [])];
}

function withMastery(state, word) {
  const saved = state.vocab_mastery[String(word.id)];
  return {
    ...word,
    mastery: saved?.mastery ?? null,
    source: saved?.source ?? null,
    updated_at: saved?.updated_at ?? null,
  };
}

function achievementProgress(state) {
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

function soulmateHome(state, targetLang) {
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

async function invokeRead(command, args, state) {
  switch (command) {
    case "is_schema_compatible_cmd": return true;
    case "get_database_status_cmd": return { ok: true, error: null, schema_compatible: true };
    case "get_current_user": return clone(state.user);
    case "get_learning_goals_cmd": return clone(state.goals.filter((goal) => !args?.userId || goal.user_id === args.userId));
    case "is_wizard_completed_cmd": return Boolean(state.user?.wizard_completed);
    case "get_target_language_cmd": return state.target_language || "es";
    case "import_vocab_bank_cmd":
    case "reimport_vocab_bank_cmd": return vocabularyRows().length;
    case "get_unknown_words_cmd": return allVocab(state)
      .filter((word) => word.language === args.targetLang && word.cefr_level <= args.cefrLevel && (state.vocab_mastery[String(word.id)]?.mastery || 0) < 2)
      .slice(0, args.limit || 20)
      .map((word) => clone(word));
    case "get_user_vocab_stats_cmd": {
      const words = allVocab(state).filter((word) => word.language === args.targetLang);
      const tracked = words.map((word) => state.vocab_mastery[String(word.id)]?.mastery);
      return { total_known: tracked.filter((value) => value >= 2).length, total_learning: tracked.filter((value) => value === 1).length, total: words.length };
    }
    case "get_user_vocab_by_level_cmd": return allVocab(state)
      .filter((word) => word.language === args.language && word.cefr_level === args.cefrLevel)
      .map((word) => withMastery(state, word));
    case "get_user_vocab_stats_by_level_cmd": {
      const levels = [...new Set(allVocab(state).filter((word) => word.language === args.language).map((word) => word.cefr_level)), "D"];
      const levelOrder = (level) => level === "D" ? Number.MAX_SAFE_INTEGER : LEVELS.indexOf(level);
      return levels.sort((a, b) => levelOrder(a) - levelOrder(b)).map((level) => {
        const words = allVocab(state).filter((word) => word.language === args.language && word.cefr_level === level);
        const mastery = words.map((word) => state.vocab_mastery[String(word.id)]?.mastery);
        return { level, total: words.length, unseen: mastery.filter((value) => value == null).length, seen: mastery.filter((value) => value === 1).length, mastered: mastery.filter((value) => value >= 2).length };
      });
    }
    case "lookup_word_ids_cmd": {
      const wanted = new Set((args.words || []).map(normalize));
      return allVocab(state).filter((word) => word.language === args.language && wanted.has(normalize(word.word))).map((word) => word.id);
    }
    case "get_path_curriculum_cmd": return pathCurriculum(state, args.nativeLang, args.targetLang, args.cefr);
    case "get_section_lesson_cmd": {
      const curriculum = pathCurriculum(state, args.nativeLang, args.targetLang, args.cefr);
      const unit = curriculum.units.find((item) => item.sections.some((section) => section.id === args.sectionId));
      const section = unit?.sections.find((item) => item.id === args.sectionId);
      if (!unit || !section) throw new Error(`Unknown path section: ${args.sectionId}`);
      return {
        section_id: args.sectionId,
        section_title_native: section.title_native,
        section_title_target: section.title_target,
        unit_title_native: unit.title_native,
        questions: questionsSource.filter((question) => question.pairId === curriculum.pair_key && question.sectionId === args.sectionId && question.cefr === args.cefr),
      };
    }
    case "get_teaching_content_cmd": {
      const curriculum = pathCurriculum(state, args.nativeLang, args.targetLang, args.cefr);
      const unit = curriculum.units.find((item) => item.sections.some((section) => section.id === args.nodeId));
      const section = unit?.sections.find((item) => item.id === args.nodeId);
      if (!unit || !section) throw new Error(`Unknown teaching node: ${args.nodeId}`);
      const raw = frameworkSource[curriculum.pair_key]?.[args.cefr]?.units?.find((item) => item.id === unit.id);
      return {
        node_id: args.nodeId,
        kind: section.kind,
        unit_id: unit.id,
        unit_title_native: unit.title_native,
        unit_title_target: unit.title_target,
        goal_native: unit.goal_native,
        grammar_points: raw?.grammarPoints || [],
        words: section.kind === "vocab" ? uniqueUnitWords(raw || {}).map((word) => ({ word, definition_zh: null })) : [],
        scenarios: raw?.scenarios || [],
      };
    }
    case "get_grammar_explanation_cached_cmd": return state.grammar_cache[`${args.cefr}|${args.unitId}|${args.pointText}`] || null;
    case "get_articles_cmd": return clone(state.news_articles.filter((article) => !args.region || article.region === args.region));
    case "get_article_cmd": {
      const article = state.news_articles.find((item) => Number(item.id) === Number(args.articleId));
      if (!article) throw new Error("Article not found");
      return clone(article);
    }
    case "get_read_article_count_cmd": return new Set(state.news_logs.filter((log) => log.completed).map((log) => log.article_id)).size;
    case "get_learning_days_cmd": return new Set(state.news_logs.map((log) => log.read_at?.slice(0, 10)).filter(Boolean)).size;
    case "get_achievement_days_cmd": return Object.values(state.achievement_days || {}).filter((day) => day.date >= args.startDate && day.date <= args.endDate).sort((a, b) => a.date.localeCompare(b.date));
    case "get_achievement_progress_cmd": return achievementProgress(state);
    case "get_llm_config_cmd": return clone(state.llm_config);
    case "get_multimodal_config_cmd": return { mode: state.settings.multimodal_mode || "builtin", builtin: clone(state.llm_config.builtin), custom: state.settings.multimodal_custom || null };
    case "get_setting_cmd": return state.settings[args.key] ?? null;
    case "get_all_prompts_cmd": return clone(state.prompts);
    case "get_prompt_cmd": {
      const prompt = state.prompts.find((item) => item.key === args.key);
      if (!prompt) throw new Error("Prompt not found");
      return clone(prompt);
    }
    case "get_reading_articles_cmd": return clone(state.reading_articles.filter((article) => article.user_id === args.userId && article.target_language === args.targetLanguage).sort((a, b) => b.generated_at.localeCompare(a.generated_at)));
    case "get_reading_article_cmd": {
      const article = state.reading_articles.find((item) => Number(item.id) === Number(args.articleId));
      if (!article) throw new Error("Reading article not found");
      return clone(article);
    }
    case "get_or_generate_reading_test_cmd": return clone(state.reading_tests[args.articleId] || demoReadingQuestions());
    case "get_reading_test_explanations_cmd": return clone(state.reading_explanations[args.articleId] || []);
    case "get_completed_reading_count_cmd": return state.reading_articles.filter((article) => article.user_id === args.userId && article.status === "completed").length;
    case "get_completed_speaking_count_cmd": return 0;
    case "get_soulmate_world_cmd": return clone(state.soulmate.worlds[args.targetLang] || null);
    case "get_soulmate_home_cmd": return soulmateHome(state, args.targetLang);
    case "get_soulmate_episode_cmd": {
      const episode = state.soulmate.episodes.find((item) => item.id === args.episodeId);
      if (!episode) throw new Error("Soul Mate episode not found");
      return clone(episode);
    }
    case "get_soulmate_chat_cmd": return clone(state.soulmate.messages[args.episodeId] || []);
    case "get_soulmate_reply_options_cmd": return ["Me gustaría conocer la plaza.", "¿Qué música escuchaste?", "Quiero tomar un café contigo.", "Cuéntame más sobre esa calle."];
    case "get_cloud_sync_status_cmd": return { enabled: false, last_synced_at: null, last_error: null, device_id: "web-demo", nickname: state.user.nickname, restore_available: false };
    case "check_cloud_restore_cmd": return false;
    case "check_update": return { available: false, version: import.meta.env.VITE_APP_VERSION || "web-demo", body: "", download_url: "" };
    case "share_text_cmd": {
      if (globalThis.navigator?.share) await globalThis.navigator.share({ text: args.text });
      else if (globalThis.navigator?.clipboard?.writeText) await globalThis.navigator.clipboard.writeText(args.text);
      return null;
    }
    default: return undefined;
  }
}

async function invokeWrite(command, args) {
  return store.update(async (state) => {
    switch (command) {
      case "reset_database_cmd":
      case "delete_database_file_cmd":
      case "delete_database_and_restart_cmd": Object.assign(state, createSeedState()); return null;
      case "exit_app_cmd": return null;
      case "create_user": {
        const request = args.request || {};
        state.user = { ...state.user, ...request, id: state.user?.id || makeId("user"), gender: request.gender || "private", wizard_completed: request.wizard_completed ?? true, created_at: state.user?.created_at || nowIso() };
        return clone(state.user);
      }
      case "update_user_cmd": state.user = { ...state.user, ...(args.request || {}) }; return clone(state.user);
      case "save_learning_goal_cmd": {
        const goal = { ...args.goal, id: args.goal.id || Date.now() };
        const index = state.goals.findIndex((item) => item.target_language === goal.target_language);
        if (index >= 0) state.goals[index] = goal; else state.goals.push(goal);
        return clone(goal);
      }
      case "reset_wizard_cmd": state.user.wizard_completed = false; return null;
      case "set_target_language_cmd": state.target_language = args.language; return args.language;
      case "update_learning_goal_cefr_cmd": {
        const goal = state.goals.find((item) => item.target_language === args.targetLanguage);
        if (goal) goal.cefr_level = args.cefrLevel;
        return clone(goal || null);
      }
      case "init_user_vocab_cmd": return null;
      case "update_word_mastery_cmd": state.vocab_mastery[String(args.wordId)] = { mastery: args.mastery, source: args.source, updated_at: nowIso() }; return null;
      case "mark_words_seen_cmd": for (const id of args.wordIds || []) if (!state.vocab_mastery[String(id)]) state.vocab_mastery[String(id)] = { mastery: 1, source: "news_reading", updated_at: nowIso() }; return null;
      case "add_discovered_word_cmd": {
        const existing = allVocab(state).find((word) => word.language === args.language && normalize(word.word) === normalize(args.word));
        const word = existing || { id: 1000000 + state.discovered_words.length, word: args.word, lemma: args.word, pos: null, cefr_level: "D", language: args.language, frequency: 0, example: args.context || null };
        if (!existing) state.discovered_words.push(word);
        if (!state.vocab_mastery[String(word.id)]) state.vocab_mastery[String(word.id)] = { mastery: 1, source: "news_reading", updated_at: nowIso() };
        return word.id;
      }
      case "ensure_words_seen_cmd": {
        for (const text of args.words || []) {
          let word = allVocab(state).find((item) => item.language === args.language && normalize(item.word) === normalize(text));
          if (!word) {
            word = { id: 1000000 + state.discovered_words.length, word: text, lemma: text, pos: null, cefr_level: "D", language: args.language, frequency: 0, example: null };
            state.discovered_words.push(word);
          }
          if (!state.vocab_mastery[String(word.id)]) state.vocab_mastery[String(word.id)] = { mastery: 1, source: "news_reading", updated_at: nowIso() };
        }
        return null;
      }
      case "reset_user_vocab_by_level_cmd": {
        const ids = new Set(allVocab(state).filter((word) => word.language === args.language && word.cefr_level === args.cefrLevel).map((word) => String(word.id)));
        for (const id of ids) delete state.vocab_mastery[id];
        return null;
      }
      case "complete_teaching_node_cmd": return completePathNode(state, args.nodeId, 1, 1);
      case "complete_section_cmd": return completePathNode(state, args.sectionId, args.correctCount, args.totalCount);
      case "save_reading_log_cmd": {
        state.news_logs.push({ ...args.logEntry, read_at: nowIso() });
        const day = state.achievement_days[localDate()] ||= { date: localDate(), reading_am: 0, reading_pm: 0, reading_count: 0, news_count: 0, speaking_count: 0, app_open: 0, soulmate_status: 0 };
        day.news_count += args.logEntry.completed ? 1 : 0;
        return null;
      }
      case "record_app_open_cmd": {
        const day = state.achievement_days[localDate()] ||= { date: localDate(), reading_am: 0, reading_pm: 0, reading_count: 0, news_count: 0, speaking_count: 0, app_open: 0, soulmate_status: 0 };
        day.app_open += 1;
        return true;
      }
      case "save_llm_config_cmd": state.llm_config.primary = clone(args.config); state.llm_config.mode = args.key === "builtin" ? "builtin" : "custom"; return null;
      case "save_multimodal_config_cmd": state.settings.multimodal_custom = clone(args.config); state.settings.multimodal_mode = "custom"; return null;
      case "save_setting_cmd":
        state.settings[args.key] = args.value;
        if (args.key === "llm_mode") state.llm_config.mode = args.value;
        if (args.key === "builtin_thinking_enabled") {
          state.llm_config.builtin.thinking_enabled = args.value === "true";
          state.settings.builtin_thinking_model = state.llm_config.builtin.model;
        }
        return null;
      case "save_prompt_cmd": {
        const prompt = { key: args.key, name: args.name, category: args.category, system_prompt: args.systemPrompt, user_prompt_template: args.userPromptTemplate, updated_at: nowIso() };
        const index = state.prompts.findIndex((item) => item.key === args.key);
        if (index >= 0) state.prompts[index] = prompt; else state.prompts.push(prompt);
        return clone(prompt);
      }
      case "reset_prompt_cmd": {
        const value = DEFAULT_PROMPTS.find((item) => item.key === args.key);
        if (!value) throw new Error("No default prompt exists");
        const prompt = { ...value, updated_at: nowIso() };
        const index = state.prompts.findIndex((item) => item.key === args.key);
        if (index >= 0) state.prompts[index] = prompt; else state.prompts.push(prompt);
        return clone(prompt);
      }
      case "reset_all_prompts_cmd": state.prompts = DEFAULT_PROMPTS.map((item) => ({ ...item, updated_at: nowIso() })); return state.prompts.length;
      case "ensure_reading_article_cmd": {
        const slot = new Date().getHours() < 12 ? "AM" : "PM";
        let article = state.reading_articles.find((item) => item.user_id === args.userId && item.target_language === args.targetLanguage && item.local_date === localDate() && item.slot === slot);
        if (!article) {
          article = { id: Math.max(0, ...state.reading_articles.map((item) => Number(item.id))) + 1, user_id: args.userId, target_language: args.targetLanguage, cefr_level: args.cefrLevel, local_date: localDate(), slot, topic: "A walk through the city", title: "Un paseo por la ciudad", body: "Hoy paseo por el centro de la ciudad. Veo una plaza, una biblioteca y muchas tiendas pequeñas. Pregunto a una persona dónde está el mercado. Ella sonríe y me ayuda. Al final compro fruta y vuelvo a casa en autobús.", status: "unread", test_correct_count: null, test_total_count: null, generated_at: nowIso() };
          state.reading_articles.push(article);
        }
        return clone(article);
      }
      case "regenerate_reading_article_cmd": {
        const article = state.reading_articles.find((item) => Number(item.id) === Number(args.articleId));
        if (!article) throw new Error("Reading article not found");
        article.generated_at = nowIso();
        article.status = "unread";
        return clone(article);
      }
      case "mark_reading_article_read_cmd": {
        const article = state.reading_articles.find((item) => Number(item.id) === Number(args.articleId));
        if (article && article.status === "unread") article.status = "read";
        const day = state.achievement_days[localDate()] ||= { date: localDate(), reading_am: 0, reading_pm: 0, reading_count: 0, news_count: 0, speaking_count: 0, app_open: 0, soulmate_status: 0 };
        day.reading_count += 1;
        if (article?.slot === "AM") day.reading_am = Math.max(day.reading_am, 1); else day.reading_pm = Math.max(day.reading_pm, 1);
        return null;
      }
      case "submit_reading_test_cmd": {
        const article = state.reading_articles.find((item) => Number(item.id) === Number(args.articleId));
        if (article) { article.status = "completed"; article.test_correct_count = args.correctCount; article.test_total_count = args.totalCount; }
        return null;
      }
      case "initialize_soulmate_cmd": {
        const request = args.request;
        const world = { id: makeId("world"), relationship_stage: "new", story_summary: "", memory_summary: "", ...request };
        state.soulmate.worlds[request.target_lang] = world;
        return clone(world);
      }
      case "update_soulmate_cmd": {
        const request = args.request;
        const world = state.soulmate.worlds[request.target_lang];
        if (!world) throw new Error("Soul Mate is not initialized");
        Object.assign(world, request);
        return clone(world);
      }
      case "generate_soulmate_episode_cmd": {
        const world = state.soulmate.worlds[args.targetLang];
        if (!world) throw new Error("Soul Mate is not initialized");
        const previous = state.soulmate.episodes.filter((item) => item.world_id === world.id);
        const episode = { id: makeId("episode"), world_id: world.id, story_date: localDate(), day_number: previous.length + 1, title: "Una tarde inesperada", teaser: `${world.companion_name} tiene algo que contarte.`, body: `Hola. Hoy he encontrado un lugar tranquilo en ${world.story_location}. Hay una plaza pequeña, árboles y una cafetería. Me gustaría practicar contigo las palabras que vemos durante el paseo.`, status: "story_in_progress", read_position: 0 };
        state.soulmate.episodes.push(episode);
        state.soulmate.messages[episode.id] = [{ id: Date.now(), role: "assistant", content: `¿Qué te parece el paseo por ${world.story_location}?`, created_at: nowIso() }];
        return clone(episode);
      }
      case "mark_soulmate_story_read_cmd": {
        const episode = state.soulmate.episodes.find((item) => item.id === args.episodeId);
        if (episode) { episode.status = "story_read"; episode.read_position = 100; }
        const day = state.achievement_days[localDate()] ||= { date: localDate(), reading_am: 0, reading_pm: 0, reading_count: 0, news_count: 0, speaking_count: 0, app_open: 0, soulmate_status: 0 };
        day.soulmate_status = Math.max(day.soulmate_status, 1);
        return clone(episode);
      }
      case "submit_soulmate_turn_cmd": {
        const messages = state.soulmate.messages[args.episodeId] ||= [];
        messages.push({ id: Date.now(), role: "user", content: args.message, created_at: nowIso() });
        let content = "Me alegra escucharte. Podemos seguir practicando juntos poco a poco.";
        try {
          content = await chat(state, "You are a warm fictional language-learning companion. Reply in 1-2 short sentences in the target language.", args.message, { maxTokens: 120 });
        } catch { /* deterministic demo fallback */ }
        const reply = { id: Date.now() + 1, role: "assistant", content, created_at: nowIso() };
        messages.push(reply);
        return clone(reply);
      }
      case "reset_soulmate_cmd": {
        const world = state.soulmate.worlds[args.targetLang];
        if (world) {
          const episodeIds = state.soulmate.episodes.filter((item) => item.world_id === world.id).map((item) => item.id);
          state.soulmate.episodes = state.soulmate.episodes.filter((item) => item.world_id !== world.id);
          for (const id of episodeIds) delete state.soulmate.messages[id];
          delete state.soulmate.worlds[args.targetLang];
        }
        return true;
      }
      case "set_cloud_sync_enabled_cmd":
      case "run_cloud_sync_cmd": return { enabled: false, direction: "disabled", imported_items: 0, skipped_items: 0 };
      case "restore_from_cloud_wizard_cmd": return { restored: false, nickname: args.nickname, target_language: null, cefr_level: null, message: "Web demo has no cloud restore", imported_items: 0, skipped_items: 0 };
      default: return undefined;
    }
  });
}

async function invokeRemote(command, args, state) {
  switch (command) {
    case "fetch_news_cmd": {
      const fetched = await fetchNewsThroughProxy(args.targetLang).catch(() => []);
      if (!fetched.length) return clone(state.news_articles);
      return store.update((next) => {
        const start = Math.max(0, ...next.news_articles.map((item) => Number(item.id) || 0)) + 1;
        next.news_articles = fetched.map((article, index) => ({ ...article, id: start + index }));
        return next.news_articles;
      });
    }
    case "fetch_models_cmd": return llm.listModels(args.baseUrl, args.apiKey);
    case "test_llm_connection_cmd": {
      try { return { ...(await llm.testConnection(args.config)), message: "ok" }; }
      catch (error) { return { success: false, message: error?.message || String(error), time_to_first_token_ms: 0, thinking_speed: 0, decode_speed: 0, thinking_tokens: 0, completion_tokens: 0 }; }
    }
    case "test_multimodal_connection_cmd": return invokeRemote("test_llm_connection_cmd", args, state);
    case "translate_text_cmd": return chat(state, "You are a professional translator. Return only the translation.", `Translate from ${args.sourceLang} to ${args.nativeLang}:\n${args.text}`, { maxTokens: 500 });
    case "translate_word_cmd": {
      const reply = await chat(state, "You are a precise dictionary assistant. Output strict JSON.", `Translate the ${args.sourceLang} word '${args.word}' into ${args.nativeLang}. Context: ${args.context}. Return {"translation":"...","ipa":"...","pos":"...","example":"..."}.`, { maxTokens: 250, responseFormat: { type: "json_object" } });
      const result = parseJsonReply(reply);
      return { translation: result.translation || "", ipa: result.ipa || null, pos: result.pos || null, example: result.example || null };
    }
    case "explain_grammar_point_cmd": {
      const explanation = await chat(state, "You are a patient language teacher. Be concise and use simple Chinese explanations with target-language examples.", `Explain this ${args.targetLang} grammar point for CEFR ${args.cefr}: ${args.pointText}. Unit: ${args.unitTitle}. Goal: ${args.unitGoal}`, { maxTokens: 650 });
      await store.update((next) => { next.grammar_cache[`${args.cefr}|${args.unitId}|${args.pointText}`] = explanation; return null; });
      return { explanation, from_cache: false };
    }
    case "rewrite_article_cmd": {
      const article = state.news_articles.find((item) => Number(item.id) === Number(args.articleId));
      if (!article) throw new Error("Article not found");
      const reply = await chat(state, "You simplify news for language learners while preserving every fact. Return strict JSON.", `Rewrite for CEFR ${args.cefrLevel} in ${args.targetLang}. Return {"rewritten":"...","new_words_used":[]}.\nTitle: ${article.original_title}\n${article.original_body}`, { maxTokens: 1200, responseFormat: { type: "json_object" } });
      const parsed = parseJsonReply(reply);
      await store.update((next) => {
        const saved = next.news_articles.find((item) => Number(item.id) === Number(args.articleId));
        saved.rewritten_body = parsed.rewritten;
        saved.rewrite_level = args.cefrLevel;
        saved.new_words = JSON.stringify(parsed.new_words_used || []);
        return null;
      });
      return {
        ...clone(article),
        rewritten_body: parsed.rewritten || "",
        rewrite_level: args.cefrLevel,
        new_words: JSON.stringify(parsed.new_words_used || []),
      };
    }
    case "get_bilingual_cmd": {
      const article = state.news_articles.find((item) => Number(item.id) === Number(args.articleId));
      if (!article) throw new Error("Article not found");
      const text = article.rewritten_body || article.original_body || "";
      const paragraphs = text.split(/\n+/).filter(Boolean);
      const translated = [];
      for (const paragraph of paragraphs) translated.push(await chat(state, "You are a professional translator. Return only the translation.", `Translate from ${args.sourceLang} to ${args.nativeLang}: ${paragraph}`, { maxTokens: 500 }));
      return translated;
    }
    case "grade_translation_cmd": {
      const accepted = (args.acceptedAnswers || []).map(normalize);
      if (accepted.includes(normalize(args.userAnswer))) return true;
      const reply = await chat(state, "Judge whether a translation is correct. Return JSON only.", `Source: ${args.sourceText}\nAccepted: ${JSON.stringify(args.acceptedAnswers)}\nUser: ${args.userAnswer}\nReturn {"correct":true|false}.`, { maxTokens: 40, responseFormat: { type: "json_object" } });
      return Boolean(parseJsonReply(reply).correct);
    }
    case "explain_reading_answer_cmd": {
      let explanation;
      try { explanation = await chat(state, "You are a concise language teacher.", `Explain why '${args.correctAnswer}' is correct and '${args.userAnswer}' is not. Question: ${args.questionJson}`, { maxTokens: 250 }); }
      catch { explanation = `正确答案是“${args.correctAnswer}”。请重新对照文章中的关键词。`; }
      await store.update((next) => { const list = next.reading_explanations[args.articleId] ||= []; list[args.questionIndex] = explanation; return null; });
      return explanation;
    }
    default: return undefined;
  }
}

export async function invokeWebCommand(command, args = undefined) {
  let state = await store.get();
  if (applyRuntimeDefaults(state)) {
    state = await store.update((next) => {
      applyRuntimeDefaults(next);
      return clone(next);
    });
  }
  const readResult = await invokeRead(command, args || {}, state);
  if (readResult !== undefined) return readResult;
  const writeResult = await invokeWrite(command, args || {});
  if (writeResult !== undefined) return writeResult;
  const remoteResult = await invokeRemote(command, args || {}, state);
  if (remoteResult !== undefined) return remoteResult;
  throw new Error(`WebBackend does not implement command: ${command}`);
}

export function createWebInvoke(overrides = {}) {
  if (!Object.keys(overrides).length) return invokeWebCommand;
  const customStore = overrides.store;
  return async (command, args) => {
    if (customStore) throw new Error("Custom WebBackend stores are not supported by this factory");
    return invokeWebCommand(command, args);
  };
}

export { store as webStateStore };
