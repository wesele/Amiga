import {
  allVocab,
  chat,
  clone,
  completePathNode,
  createSeedState,
  DEFAULT_PROMPTS,
  localDate,
  makeId,
  normalize,
  nowIso,
  store,
} from "./shared.js";

export async function invokeWrite(command, args) {
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
      case "get_words_mastery_map_cmd": {
        const result = {};
        const queryWords = (args.words || []).map((w) => normalize(w));
        for (const item of allVocab(state)) {
          if (item.language === args.language) {
            const norm = normalize(item.word);
            if (queryWords.includes(norm)) {
              const masteryEntry = state.vocab_mastery[String(item.id)];
              if (masteryEntry && masteryEntry.mastery != null) {
                result[norm] = masteryEntry.mastery;
              }
            }
          }
        }
        return result;
      }
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
        // Check if streak crossed a 7-day multiple and award a makeup token
        const activeDays = Object.values(state.achievement_days)
          .filter((d) => d.app_open > 0)
          .map((d) => d.date)
          .sort();
        let run = 0;
        for (let i = 0; i < activeDays.length; i++) {
          if (i > 0 && new Date(activeDays[i]) - new Date(activeDays[i - 1]) === 86400000) {
            run++;
          } else {
            run = 1;
          }
        }
        const today2 = new Date(`${localDate()}T00:00:00`);
        const lastActive = activeDays.length > 0 ? new Date(`${activeDays[activeDays.length - 1]}T00:00:00`) : null;
        const currentStreak = lastActive && today2 - lastActive <= 86400000 ? run : 0;
        if (currentStreak > 0 && currentStreak % 7 === 0) {
          const mt = state.makeup_tokens ||= { tokens: 3, total_earned: 3 };
          if (currentStreak > (mt.last_week_rewarded || 0)) {
            mt.tokens += 1;
            mt.total_earned += 1;
            mt.last_week_rewarded = currentStreak;
          }
        }
        return true;
      }
      case "use_makeup_checkin_cmd": {
        const { date } = args;
        const today = localDate();
        const diffMs = new Date(`${today}T00:00:00`) - new Date(`${date}T00:00:00`);
        const diffDays = Math.round(diffMs / 86400000);
        if (diffDays < 1 || diffDays > 3) throw new Error(`Can only makeup check-in for 1–3 days ago; requested ${diffDays} days ago`);
        if (state.achievement_days[date]?.app_open > 0) throw new Error(`Already checked in on ${date}`);
        const mt = state.makeup_tokens ||= { tokens: 3, total_earned: 3 };
        if (mt.tokens <= 0) throw new Error("No makeup check-in tokens remaining");
        mt.tokens -= 1;
        state.achievement_days[date] ||= { date, reading_am: 0, reading_pm: 0, reading_count: 0, news_count: 0, speaking_count: 0, app_open: 0, soulmate_status: 0 };
        state.achievement_days[date].app_open = 1;
        return { tokens: mt.tokens, total_earned: mt.total_earned };
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
      case "generate_initial_reading_article_cmd": {
        const slot = new Date().getHours() < 12 ? "AM" : "PM";
        const newId = Math.max(0, ...(state.reading_articles || []).map((item) => Number(item.id)), ...((state.reading_history || []).map((item) => Number(item.id)))) + 1;
        const article = {
          id: newId,
          user_id: args.userId,
          target_language: args.targetLanguage,
          cefr_level: args.cefrLevel,
          local_date: localDate(),
          slot,
          topic: "A new beginning",
          title: "Un nuevo comienzo",
          body: "Cada día es una nueva oportunidad para aprender. Caminamos por calles desconocidas, escuchamos nuevos sonidos y practicamos con paciencia.",
          status: "unread",
          test_correct_count: null,
          test_total_count: null,
          generated_at: nowIso(),
        };
        state.reading_articles = [article];
        return clone(article);
      }
      case "finish_and_generate_next_reading_article_cmd": {
        const current = state.reading_articles.find((item) => Number(item.id) === Number(args.currentArticleId));
        if (current) {
          state.reading_history ||= [];
          state.reading_history.push({
            ...current,
            status: current.status === "unread" ? "read" : current.status,
            completed_at: nowIso(),
          });
        }
        const slot = new Date().getHours() < 12 ? "AM" : "PM";
        const newId = Math.max(0, ...(state.reading_articles || []).map((item) => Number(item.id)), ...((state.reading_history || []).map((item) => Number(item.id)))) + 1;
        const newArticle = {
          id: newId,
          user_id: current?.user_id || "demo-user",
          target_language: current?.target_language || "es",
          cefr_level: args.cefrLevel || current?.cefr_level || "A2",
          local_date: localDate(),
          slot,
          topic: "Exploring further",
          title: "Explorando más allá",
          body: "El viaje continúa con entusiasmo. Encontramos nuevas palabras y nuevos amigos a lo largo del camino.",
          status: "unread",
          test_correct_count: null,
          test_total_count: null,
          generated_at: nowIso(),
        };
        state.reading_articles = [newArticle];
        return clone(newArticle);
      }
      case "delete_imported_article_cmd": {
        state.imported_articles ||= [];
        state.imported_article_chapters = (state.imported_article_chapters || []).filter(
          (ch) => Number(ch.article_id) !== Number(args.id)
        );
        const idx = state.imported_articles.findIndex((item) => Number(item.id) === Number(args.id));
        if (idx >= 0) {
          const removed = state.imported_articles.splice(idx, 1)[0];
          return removed?.audio_path || null;
        }
        return null;
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
      case "generate_chapter_courseware_cmd": {
        state.imported_article_chapters ||= [];
        const ch = state.imported_article_chapters.find((c) => Number(c.id) === Number(args.chapterId));
        if (!ch) throw new Error("Chapter not found");
        ch.courseware_status = "ready";
        ch.error_message = null;
        return clone(ch);
      }
      case "update_chapter_courseware_progress_cmd": {
        state.imported_article_chapters ||= [];
        const ch = state.imported_article_chapters.find((c) => Number(c.id) === Number(args.chapterId));
        if (!ch) throw new Error("Chapter not found");
        const maxPages = ch.total_pages || (ch.slides?.length ?? 0);
        const clamped = maxPages > 0 ? Math.min(Number(args.viewedPages) || 0, maxPages) : Number(args.viewedPages) || 0;
        ch.viewed_pages = Math.max(ch.viewed_pages || 0, clamped);
        return clone(ch);
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
