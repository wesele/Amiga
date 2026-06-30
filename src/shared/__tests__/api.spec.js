import * as api from "../api.js";

describe("API module", () => {
  let mockInvoke;

  beforeEach(() => {
    mockInvoke = vi.fn();
    api.__setInvoke(mockInvoke);
  });

  afterEach(() => {
    api.__resetInvoke();
  });

  describe("User API", () => {
    it("getCurrentUser calls invoke with correct command", () => {
      api.getCurrentUser();
      expect(mockInvoke).toHaveBeenCalledWith("get_current_user");
    });

    it("createUser calls invoke with request payload", () => {
      const request = { nickname: "test", avatar: "😊" };
      api.createUser(request);
      expect(mockInvoke).toHaveBeenCalledWith("create_user", { request });
    });

    it("updateUser calls invoke with request payload", () => {
      const request = { id: "123", nickname: "new" };
      api.updateUser(request);
      expect(mockInvoke).toHaveBeenCalledWith("update_user_cmd", { request });
    });

    it("saveLearningGoal calls invoke with goal payload", () => {
      const goal = { user_id: "1", target_language: "es" };
      api.saveLearningGoal(goal);
      expect(mockInvoke).toHaveBeenCalledWith("save_learning_goal_cmd", { goal });
    });

    it("getLearningGoals calls invoke with userId", () => {
      api.getLearningGoals("user-1");
      expect(mockInvoke).toHaveBeenCalledWith("get_learning_goals_cmd", { userId: "user-1" });
    });

    it("updateLearningGoalCefr calls invoke with targetLanguage and cefrLevel", () => {
      api.updateLearningGoalCefr("es", "A2");
      expect(mockInvoke).toHaveBeenCalledWith("update_learning_goal_cefr_cmd", {
        targetLanguage: "es",
        cefrLevel: "A2",
      });
    });

    it("isWizardCompleted calls invoke with no args", () => {
      api.isWizardCompleted();
      expect(mockInvoke).toHaveBeenCalledWith("is_wizard_completed_cmd");
    });

    it("resetWizard calls invoke with no args", () => {
      api.resetWizard();
      expect(mockInvoke).toHaveBeenCalledWith("reset_wizard_cmd");
    });
  });

  describe("Vocabulary API", () => {
    it("importVocabBank calls invoke", () => {
      api.importVocabBank();
      expect(mockInvoke).toHaveBeenCalledWith("import_vocab_bank_cmd");
    });

    it("initUserVocab calls invoke with userId and cefrLevel", () => {
      api.initUserVocab("u1", "A1");
      expect(mockInvoke).toHaveBeenCalledWith("init_user_vocab_cmd", { userId: "u1", cefrLevel: "A1" });
    });

    it("updateWordMastery calls invoke with all params", () => {
      api.updateWordMastery("u1", 42, 2, "exercise");
      expect(mockInvoke).toHaveBeenCalledWith("update_word_mastery_cmd", {
        userId: "u1", wordId: 42, mastery: 2, source: "exercise",
      });
    });

    it("getUnknownWords calls invoke with filtered params", () => {
      api.getUnknownWords("u1", "A2", 10, "en");
      expect(mockInvoke).toHaveBeenCalledWith("get_unknown_words_cmd", {
        userId: "u1", cefrLevel: "A2", limit: 10, targetLang: "en",
      });
    });

    it("getUserVocabStats calls invoke with userId and targetLang", () => {
      api.getUserVocabStats("u1", "en");
      expect(mockInvoke).toHaveBeenCalledWith("get_user_vocab_stats_cmd", { userId: "u1", targetLang: "en" });
    });

    it("getUserVocabByLevel calls invoke with userId, language, cefrLevel", () => {
      api.getUserVocabByLevel("u1", "es", "A1");
      expect(mockInvoke).toHaveBeenCalledWith("get_user_vocab_by_level_cmd", {
        userId: "u1", language: "es", cefrLevel: "A1",
      });
    });

    it("getUserVocabStatsByLevel calls invoke with userId and language", () => {
      api.getUserVocabStatsByLevel("u1", "es");
      expect(mockInvoke).toHaveBeenCalledWith("get_user_vocab_stats_by_level_cmd", {
        userId: "u1", language: "es",
      });
    });

    it("markWordsSeen calls invoke with userId and wordIds", () => {
      api.markWordsSeen("u1", [1, 2, 3]);
      expect(mockInvoke).toHaveBeenCalledWith("mark_words_seen_cmd", {
        userId: "u1", wordIds: [1, 2, 3],
      });
    });

    it("lookupWordIds calls invoke with words and language", () => {
      api.lookupWordIds(["hola", "adios"], "es");
      expect(mockInvoke).toHaveBeenCalledWith("lookup_word_ids_cmd", {
        words: ["hola", "adios"], language: "es",
      });
    });

    it("resetUserVocabByLevel calls invoke with userId, language, cefrLevel", () => {
      api.resetUserVocabByLevel("u1", "es", "A1");
      expect(mockInvoke).toHaveBeenCalledWith("reset_user_vocab_by_level_cmd", {
        userId: "u1", language: "es", cefrLevel: "A1",
      });
    });
  });

  describe("News API", () => {
    it("fetchNews calls invoke with region and targetLang", () => {
      api.fetchNews("world", "es");
      expect(mockInvoke).toHaveBeenCalledWith("fetch_news_cmd", { region: "world", targetLang: "es" });
    });

    it("getArticles calls invoke with region", () => {
      api.getArticles("world");
      expect(mockInvoke).toHaveBeenCalledWith("get_articles_cmd", { region: "world" });
    });

    it("getArticle calls invoke with articleId", () => {
      api.getArticle(5);
      expect(mockInvoke).toHaveBeenCalledWith("get_article_cmd", { articleId: 5 });
    });

    it("saveReadingLog calls invoke with logEntry", () => {
      const log = { user_id: "u1", article_id: 5, reading_time_sec: 60, completed: true };
      api.saveReadingLog(log);
      expect(mockInvoke).toHaveBeenCalledWith("save_reading_log_cmd", { logEntry: log });
    });

    it("getReadArticleCount calls invoke with userId", () => {
      api.getReadArticleCount("u1");
      expect(mockInvoke).toHaveBeenCalledWith("get_read_article_count_cmd", { userId: "u1" });
    });
  });

  describe("LLM API", () => {
    it("rewriteArticle calls invoke with articleId, cefrLevel, userId, targetLang", () => {
      api.rewriteArticle(1, "A2", "u1", "en");
      expect(mockInvoke).toHaveBeenCalledWith("rewrite_article_cmd", {
        articleId: 1, cefrLevel: "A2", userId: "u1", targetLang: "en",
      });
    });

    it("translateWord calls invoke with word, context, sourceLang, nativeLang", () => {
      api.translateWord("hola", "Hola amigo", "es", "zh");
      expect(mockInvoke).toHaveBeenCalledWith("translate_word_cmd", {
        word: "hola", context: "Hola amigo", sourceLang: "es", nativeLang: "zh",
      });
    });

    it("testLlmConnection calls invoke with config", () => {
      const config = { base_url: "http://localhost", api_key: "key", model: "gpt" };
      api.testLlmConnection(config);
      expect(mockInvoke).toHaveBeenCalledWith("test_llm_connection_cmd", { config });
    });

    it("saveLlmConfig calls invoke with key and config", () => {
      const config = { base_url: "http://localhost", api_key: "key", model: "gpt" };
      api.saveLlmConfig("primary", config);
      expect(mockInvoke).toHaveBeenCalledWith("save_llm_config_cmd", { key: "primary", config });
    });

    it("getLlmConfig calls invoke with no args", () => {
      api.getLlmConfig();
      expect(mockInvoke).toHaveBeenCalledWith("get_llm_config_cmd");
    });

    it("getBilingual calls invoke with articleId, sourceLang and nativeLang", () => {
      api.getBilingual(1, "es", "zh");
      expect(mockInvoke).toHaveBeenCalledWith("get_bilingual_cmd", { articleId: 1, sourceLang: "es", nativeLang: "zh" });
    });

    it("translateText calls invoke with text, sourceLang and nativeLang", () => {
      api.translateText("Hola mundo", "es", "zh");
      expect(mockInvoke).toHaveBeenCalledWith("translate_text_cmd", { text: "Hola mundo", sourceLang: "es", nativeLang: "zh" });
    });
  });

  describe("Settings API", () => {
    it("saveSetting calls invoke with key and value", () => {
      api.saveSetting("theme", "dark");
      expect(mockInvoke).toHaveBeenCalledWith("save_setting_cmd", { key: "theme", value: "dark" });
    });

    it("getSetting calls invoke with key", () => {
      api.getSetting("theme");
      expect(mockInvoke).toHaveBeenCalledWith("get_setting_cmd", { key: "theme" });
    });
  });

  describe("Cloud sync API", () => {
    it("testCloudSync calls invoke", () => {
      api.testCloudSync();
      expect(mockInvoke).toHaveBeenCalledWith("test_cloud_sync_cmd");
    });

    it("getCloudSyncStatus calls invoke", () => {
      api.getCloudSyncStatus();
      expect(mockInvoke).toHaveBeenCalledWith("get_cloud_sync_status_cmd");
    });

    it("setCloudSyncEnabled calls invoke with enabled and forceEnable", () => {
      api.setCloudSyncEnabled(true, true);
      expect(mockInvoke).toHaveBeenCalledWith("set_cloud_sync_enabled_cmd", {
        enabled: true,
        forceEnable: true,
      });
    });

    it("runCloudSync calls invoke", () => {
      api.runCloudSync();
      expect(mockInvoke).toHaveBeenCalledWith("run_cloud_sync_cmd");
    });
  });

  describe("Prompts API", () => {
    it("getAllPrompts calls invoke", () => {
      api.getAllPrompts();
      expect(mockInvoke).toHaveBeenCalledWith("get_all_prompts_cmd");
    });

    it("getPrompt calls invoke with key", () => {
      api.getPrompt("rewrite-article");
      expect(mockInvoke).toHaveBeenCalledWith("get_prompt_cmd", { key: "rewrite-article" });
    });

    it("savePrompt calls invoke with all params", () => {
      api.savePrompt("k", "名称", "分类", "系统提示", "用户模板");
      expect(mockInvoke).toHaveBeenCalledWith("save_prompt_cmd", {
        key: "k", name: "名称", category: "分类", systemPrompt: "系统提示", userPromptTemplate: "用户模板",
      });
    });

    it("resetPrompt calls invoke with key", () => {
      api.resetPrompt("rewrite-article");
      expect(mockInvoke).toHaveBeenCalledWith("reset_prompt_cmd", { key: "rewrite-article" });
    });

    it("resetAllPrompts calls invoke", () => {
      api.resetAllPrompts();
      expect(mockInvoke).toHaveBeenCalledWith("reset_all_prompts_cmd");
    });
  });

  describe("Update API", () => {
    it("checkUpdate calls invoke with correct command", () => {
      api.checkUpdate();
      expect(mockInvoke).toHaveBeenCalledWith("check_update");
    });
  });

  describe("Path API", () => {
    it("getGrammarExplanationCached calls invoke with cache params", () => {
      api.getGrammarExplanationCached("A1", "U01", "ser 和 estar");
      expect(mockInvoke).toHaveBeenCalledWith("get_grammar_explanation_cached_cmd", {
        cefr: "A1",
        unitId: "U01",
        pointText: "ser 和 estar",
      });
    });

    it("explainGrammarPoint calls invoke with grammar params", () => {
      api.explainGrammarPoint("A1", "es", "U01", "ser 和 estar", "问候", "掌握问候");
      expect(mockInvoke).toHaveBeenCalledWith("explain_grammar_point_cmd", {
        cefr: "A1",
        targetLang: "es",
        unitId: "U01",
        pointText: "ser 和 estar",
        unitTitle: "问候",
        unitGoal: "掌握问候",
      });
    });
  });

  describe("Mock integration", () => {
    it("returns mocked values from invoke", async () => {
      mockInvoke.mockResolvedValue({ id: "123", nickname: "Test" });
      const result = await api.getCurrentUser();
      expect(result).toEqual({ id: "123", nickname: "Test" });
    });

    it("rejects when invoke rejects", async () => {
      mockInvoke.mockRejectedValue(new Error("Tauri not available"));
      await expect(api.getCurrentUser()).rejects.toThrow("Tauri not available");
    });
  });
});
