import {
  achievementProgress,
  allVocab,
  clone,
  demoReadingQuestions,
  frameworkSource,
  LEVELS,
  normalize,
  nowIso,
  pathCurriculum,
  questionsSource,
  soulmateHome,
  uniqueUnitWords,
  vocabularyRows,
  withMastery,
} from "./shared.js";

export async function invokeRead(command, args, state) {
  switch (command) {
    case "get_chapter_classroom_cmd": {
      const chapter = (state.imported_article_chapters || []).find(c => Number(c.id) === Number(args.chapterId));
      if (!chapter) throw new Error("Chapter not found");
      const article = (state.imported_articles || []).find(a => Number(a.id) === Number(chapter.article_id));
      if (!article) throw new Error("Imported article not found");
      const saved = state.chapter_classrooms?.[args.chapterId];
      return clone({ chapter, article, plan: saved?.plan || null, session: saved?.session || null });
    }
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
    case "get_completed_reading_count_cmd": {
      const completedHistory = (state.reading_history || []).filter((item) => item.user_id === args.userId && item.status === "completed").length;
      const completedCurrent = state.reading_articles.filter((article) => article.user_id === args.userId && article.status === "completed").length;
      return completedHistory + completedCurrent;
    }
    case "get_imported_articles_cmd": return clone((state.imported_articles || []).filter((item) => item.user_id === args.userId && item.target_language === args.targetLanguage).sort((a, b) => b.id - a.id));
    case "get_imported_article_chapters_cmd": {
      const chapters = (state.imported_article_chapters || [])
        .filter((ch) => Number(ch.article_id) === Number(args.articleId))
        .sort((a, b) => a.chapter_index - b.chapter_index);
      return clone(chapters);
    }
    case "get_imported_article_cmd": {
      const item = (state.imported_articles || []).find((art) => Number(art.id) === Number(args.id));
      if (!item) throw new Error("Imported article not found");
      return clone(item);
    }
    case "fetch_youtube_metadata_cmd": {
      return {
        url: args.url,
        video_id: "demo_video",
        title: "Demo YouTube Video",
        channel: "Amiga Channel",
        duration_sec: 180,
        filesize_approx_mb: 2.5,
        has_manual_subtitles: true,
        has_auto_captions: false,
        subtitle_lang: args.targetLang || "es",
      };
    }
    case "start_youtube_import_cmd": {
      state.imported_articles ||= [];
      const newId = Math.max(0, ...state.imported_articles.map((item) => Number(item.id))) + 1;
      state.imported_articles.push({
        id: newId,
        user_id: args.userId,
        target_language: args.targetLang,
        source_type: "youtube",
        source_url: args.url,
        source_id: "demo_video",
        title: "Demo YouTube Video",
        channel: "Amiga Channel",
        duration_sec: 180,
        audio_path: null,
        subtitles_json: JSON.stringify([
          { start: 0, end: 5, text: "Hola a todos y bienvenidos a este video." },
          { start: 5, end: 12, text: "Hoy vamos a practicar español con una conversación natural." },
        ]),
        cefr_level: args.cefrLevel || "A2",
        created_at: nowIso(),
      });
      state.imported_article_chapters ||= [];
      const chId = Math.max(0, ...state.imported_article_chapters.map((c) => Number(c.id))) + 1;
      const demoSlides = [
        {
          slide_type: 'vocab',
          term: 'bienvenidos',
          lemma: 'bienvenido',
          pos: 'adj.',
          pronunciation: 'bjen.beˈni.ðos',
          meaning: '欢迎',
          explanation: '用于热情迎接听众或客人的常用表达',
          context_sentence: 'Hola a todos y bienvenidos a este video.',
          context_translation: '大家好，欢迎来到这个视频。',
          para_idx: 0,
          start_sec: 0,
          end_sec: 5,
          svg: "<svg viewBox='0 0 320 180' xmlns='http://www.w3.org/2000/svg'><rect width='320' height='180' rx='16' fill='#ecfdf5'/><circle cx='90' cy='90' r='32' fill='#10b981'><animate attributeName='r' values='28;36;28' dur='2s' repeatCount='indefinite'/></circle><text x='190' y='85' text-anchor='middle' font-size='18' font-weight='700' fill='#065f46'>bienvenidos</text><text x='190' y='115' text-anchor='middle' font-size='14' fill='#047857'>欢迎</text></svg>",
        },
        {
          slide_type: 'phrase',
          term: 'conversación natural',
          lemma: 'conversación natural',
          pos: 'phrase',
          pronunciation: '',
          meaning: '自然的对话交流',
          explanation: '字面义：自然的谈话 → 语境义：地道的日常口语交流',
          context_sentence: 'Hoy vamos a practicar español con una conversación natural.',
          context_translation: '今天我们将通过一段自然的对话来练习西班牙语。',
          para_idx: 1,
          start_sec: 5,
          end_sec: 12,
          svg: "<svg viewBox='0 0 320 180' xmlns='http://www.w3.org/2000/svg'><rect width='320' height='180' rx='16' fill='#eef2ff'/><text x='160' y='85' text-anchor='middle' font-size='16' font-weight='700' fill='#3730a3'>conversación natural</text><text x='160' y='115' text-anchor='middle' font-size='13' fill='#4f46e5'>自然的对话交流</text></svg>",
        },
      ];
      state.imported_article_chapters.push({
        id: chId,
        article_id: newId,
        chapter_index: 0,
        title: '第 1 章 · 开场问候',
        start_para_idx: 0,
        end_para_idx: 1,
        start_sec: 0,
        end_sec: 12,
        courseware_status: 'ready',
        slides: demoSlides,
        viewed_pages: 0,
        total_pages: demoSlides.length,
        error_message: null,
      });
      return null;
    }
    case "get_youtube_import_progress_cmd": {
      return {
        task_id: args.taskId,
        phase: "completed",
        percent: 100,
        speed_mb_s: null,
        message: "导入完成！",
      };
    }
    case "cancel_youtube_import_cmd": return null;
    case "update_ytdlp_cmd": return "yt-dlp is up to date";
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
    case "get_makeup_checkin_status_cmd": {
      const mt = state.makeup_tokens ||= { tokens: 3, total_earned: 3 };
      return { tokens: mt.tokens, total_earned: mt.total_earned };
    }
    case "share_text_cmd": {
      if (globalThis.navigator?.share) await globalThis.navigator.share({ text: args.text });
      else if (globalThis.navigator?.clipboard?.writeText) await globalThis.navigator.clipboard.writeText(args.text);
      return null;
    }
    default: return undefined;
  }
}
