import {
  chat,
  clone,
  fetchNewsThroughProxy,
  llm,
  normalize,
  parseJsonReply,
  store,
} from "./shared.js";

export async function invokeRemote(command, args, state) {
  switch (command) {
    case "fetch_news_cmd": {
      const keyword = String(args.keyword || "").trim().slice(0, 100);
      const fetched = await fetchNewsThroughProxy(args.targetLang, { keyword }).catch(() => []);
      if (!fetched.length) return clone(state.news_articles);
      return store.update((next) => {
        const start = Math.max(0, ...next.news_articles.map((item) => Number(item.id) || 0)) + 1;
        const region = args.region || "world";
        next.news_articles = fetched.map((article, index) => ({ ...article, id: start + index, region }));
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
