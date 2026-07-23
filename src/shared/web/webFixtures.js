import vocabularySource from "../../../content-studio/data/vocabulary.json";
import frameworkSource from "../../../content-studio/data/unit-framework.json";
import questionsSource from "../../../content-studio/data/questions.json";

export { frameworkSource, questionsSource };

const LANGUAGE_NAMES = {
  es: vocabularySource.languages.find((name) => name === "Espanol") || "Espanol",
  en: vocabularySource.languages.find((name) => name === "English") || "English",
  zh: vocabularySource.languages.find((name) => name !== "Espanol" && name !== "English"),
};

const PAIRS = [
  { key: "zh-es", native: "zh", target: "es" },
  { key: "pair_1781451962486", native: "es", target: "zh" },
  { key: "pair_1782569237717", native: "zh", target: "en" },
];

let vocabCache;

function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function vocabularyRows() {
  if (vocabCache) return vocabCache;
  let id = 1;
  const rows = [];
  for (const [language, sourceName] of Object.entries(LANGUAGE_NAMES)) {
    const levels = vocabularySource.data[sourceName] || {};
    for (const [cefrLevel, text] of Object.entries(levels)) {
      const words = String(text || "")
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean);
      words.forEach((word, index) => {
        rows.push({
          id: id++,
          word,
          lemma: word,
          pos: null,
          cefr_level: cefrLevel,
          language,
          frequency: words.length - index,
          definition_zh: null,
          definition_es: null,
          example: null,
        });
      });
    }
  }
  vocabCache = rows;
  return rows;
}

export function resolvePair(nativeLang, targetLang) {
  return PAIRS.find((pair) => pair.native === nativeLang && pair.target === targetLang)
    || PAIRS.find((pair) => pair.target === targetLang)
    || null;
}

export const DEFAULT_PROMPTS = [
  {
    key: "translate-word",
    name: "单词翻译",
    category: "学习功能",
    system_prompt: "You are a precise dictionary assistant. Output only JSON.",
    user_prompt_template: "Translate {{WORD}} from {{SOURCE_LANG}} to {{TARGET_LANG}} in context: {{CONTEXT}}.",
  },
  {
    key: "translate-paragraphs",
    name: "段落翻译",
    category: "学习功能",
    system_prompt: "You are a concise professional translator.",
    user_prompt_template: "Translate from {{SOURCE_LANG}} to {{TARGET_LANG}}:\n{{TEXT}}",
  },
  {
    key: "explain-grammar",
    name: "语法讲解",
    category: "学习功能",
    system_prompt: "You are a patient language teacher. Keep the answer concise.",
    user_prompt_template: "Explain {{GRAMMAR_POINT}} for a {{CEFR_LEVEL}} learner of {{TARGET_LANG}}.",
  },
  {
    key: "rewrite-article",
    name: "文章改写",
    category: "学习功能",
    system_prompt: "You simplify articles for language learners without changing facts.",
    user_prompt_template: "Rewrite this article for CEFR {{CEFR_LEVEL}}:\n{{TEXT}}",
  },
  {
    key: "soulmate-story",
    name: "灵伴故事",
    category: "Soul Mate",
    system_prompt: "You write warm, safe language-learning slice-of-life stories.",
    user_prompt_template: "Write today's short story in {{TARGET_LANG}} at {{CEFR_LEVEL}}.",
  },
  {
    key: "soulmate-dialogue",
    name: "灵伴对话",
    category: "Soul Mate",
    system_prompt: "You are a friendly fictional companion helping the learner practice.",
    user_prompt_template: "Continue naturally in {{TARGET_LANG}}. User: {{TEXT}}",
  },
  {
    key: "soulmate-reply-options",
    name: "灵伴回复选项",
    category: "Soul Mate",
    system_prompt: "Return four short reply options as a JSON array.",
    user_prompt_template: "Suggest four replies in {{TARGET_LANG}} for this conversation: {{CONVERSATION}}",
  },
];

export const DEMO_NEWS = [
  {
    id: 1,
    original_title: "Una biblioteca lleva los libros a los pueblos pequeños",
    original_body: "Una biblioteca móvil recorre varios pueblos cada semana. El autobús lleva novelas, libros infantiles y materiales para aprender idiomas. Los vecinos pueden pedir un libro y devolverlo en la siguiente visita. El proyecto también organiza conversaciones para personas que estudian español.",
    rewritten_body: null,
    rewrite_level: null,
    source: "https://example.com/amiga-demo/library",
    image_url: null,
    region: "world",
    hot_rank: 1,
    new_words: null,
    fetched_at: new Date().toISOString(),
  },
  {
    id: 2,
    original_title: "Un barrio convierte una calle en un jardín",
    original_body: "Los vecinos de un barrio han plantado árboles y flores en una calle que antes tenía mucho tráfico. Ahora hay bancos, una fuente y una zona para jugar. Las tiendas cercanas dicen que más personas pasean por la zona durante la tarde.",
    rewritten_body: null,
    rewrite_level: null,
    source: "https://example.com/amiga-demo/garden",
    image_url: null,
    region: "world",
    hot_rank: 2,
    new_words: null,
    fetched_at: new Date().toISOString(),
  },
  {
    id: 3,
    original_title: "Científicos observan una lluvia de estrellas",
    original_body: "Esta noche será posible ver una lluvia de estrellas desde muchos lugares. Los expertos recomiendan buscar una zona oscura y mirar al cielo después de medianoche. No hace falta usar un telescopio, pero conviene llevar ropa de abrigo.",
    rewritten_body: null,
    rewrite_level: null,
    source: "https://example.com/amiga-demo/stars",
    image_url: null,
    region: "world",
    hot_rank: 3,
    new_words: null,
    fetched_at: new Date().toISOString(),
  },
];

export const DEMO_READING = [
  {
    id: 1,
    user_id: "demo-user",
    target_language: "es",
    cefr_level: "A1",
    local_date: localDate(0),
    slot: "AM",
    topic: "Ordering breakfast",
    title: "Un desayuno tranquilo",
    body: "Marta entra en una cafetería pequeña cerca de su casa. Pide un café con leche y una tostada con tomate. El camarero le pregunta si quiere zumo. Marta sonríe y dice que sí. Mientras desayuna, mira por la ventana y prepara su día. Después paga, da las gracias y camina hacia el trabajo.",
    status: "unread",
    test_correct_count: null,
    test_total_count: null,
    generated_at: new Date().toISOString(),
  },
  {
    id: 2,
    user_id: "demo-user",
    target_language: "es",
    cefr_level: "A1",
    local_date: localDate(-1),
    slot: "PM",
    topic: "Meeting a new neighbor",
    title: "La nueva vecina",
    body: "Carlos vive en un edificio azul. Una tarde conoce a Ana, su nueva vecina. Ana es de Sevilla y trabaja en una escuela. Carlos le enseña el supermercado y la parada de autobús del barrio. Al final, los dos toman un té y hablan de música.",
    status: "completed",
    test_correct_count: 8,
    test_total_count: 10,
    generated_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

export function demoReadingQuestions() {
  return [
    { type: "reading", question: "¿Dónde desayuna Marta?", options: ["En casa", "En una cafetería", "En el trabajo", "En el parque"], correct: 1 },
    { type: "reading", question: "¿Qué pide para comer?", options: ["Una sopa", "Una ensalada", "Una tostada", "Un bocadillo"], correct: 2 },
    { type: "reading", question: "¿Qué mira Marta?", options: ["La televisión", "El teléfono", "Un libro", "La ventana"], correct: 3 },
    { type: "reading", question: "¿Qué hace después de pagar?", options: ["Va al trabajo", "Vuelve a dormir", "Toma un taxi", "Compra pan"], correct: 0 },
    { type: "reading", question: "¿Cómo parece la mañana?", options: ["Tranquila", "Peligrosa", "Ruidosa", "Difícil"], correct: 0 },
    { type: "listening", audio_text: "Quiero un café con leche, por favor.", question: "¿Qué bebida quiere?", options: ["Té", "Agua", "Café con leche", "Zumo"], correct: 2 },
    { type: "listening", audio_text: "La cafetería está cerca de mi casa.", question: "¿Dónde está la cafetería?", options: ["Cerca de casa", "En otra ciudad", "En la escuela", "Junto al aeropuerto"], correct: 0 },
    { type: "listening", audio_text: "Después del desayuno camino al trabajo.", question: "¿Adónde va?", options: ["A casa", "Al trabajo", "Al mercado", "Al hotel"], correct: 1 },
    { type: "listening", audio_text: "El camarero trae una tostada.", question: "¿Qué trae?", options: ["Una tostada", "Una carta", "Una sopa", "Una fruta"], correct: 0 },
    { type: "listening", audio_text: "Marta dice gracias antes de salir.", question: "¿Qué dice Marta?", options: ["Perdón", "Adiós", "Gracias", "Buenos días"], correct: 2 },
  ];
}

export function createSeedState() {
  const now = new Date().toISOString();
  const episodeId = "demo-episode-1";
  return {
    schema_version: 1,
    user: {
      id: "demo-user",
      nickname: "Amiga Explorer",
      avatar: "🌟",
      native_language: "zh",
      country: "CN",
      gender: "private",
      birth_year: null,
      age_range: null,
      wizard_completed: true,
      created_at: now,
      last_active_date: localDate(),
    },
    goals: [{ id: 1, user_id: "demo-user", target_language: "es", cefr_level: "A1", daily_minutes: 15, objective: "daily_conversation" }],
    target_language: "es",
    settings: { ui_language: "zh", llm_mode: "builtin" },
    llm_config: {
      mode: "builtin",
      builtin: {
        base_url: "/llm/nvidia/v1",
        api_key: import.meta.env.VITE_AMIGA_LLM_API_KEY || "",
        model: import.meta.env.VITE_AMIGA_LLM_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        provider: "nvidia_nim",
        thinking_enabled: true,
      },
      primary: null,
    },
    vocab_mastery: {},
    discovered_words: [],
    path_progress: {},
    grammar_cache: {},
    news_articles: DEMO_NEWS,
    news_logs: [],
    reading_articles: DEMO_READING,
    reading_tests: {},
    reading_explanations: {},
    achievement_days: {
      [localDate(-2)]: { date: localDate(-2), reading_am: 1, reading_pm: 0, reading_count: 1, news_count: 1, speaking_count: 0, app_open: 1, soulmate_status: 1 },
      [localDate(-1)]: { date: localDate(-1), reading_am: 0, reading_pm: 2, reading_count: 2, news_count: 0, speaking_count: 0, app_open: 1, soulmate_status: 1 },
    },
    prompts: DEFAULT_PROMPTS.map((prompt) => ({ ...prompt, updated_at: now })),
    soulmate: {
      worlds: {
        es: {
          id: "demo-world-es",
          user_id: "demo-user",
          companion_type: "friend",
          companion_name: "Luna",
          companion_gender: "female",
          personality: "warm",
          story_location: "Barcelona",
          intensity: 55,
          romance_tension: 20,
          surprise: 55,
          knowledge: 70,
          target_lang: "es",
          native_lang: "zh",
          cefr_level: "A1",
          relationship_stage: "new",
          story_summary: "",
          memory_summary: "",
        },
      },
      episodes: [{
        id: episodeId,
        world_id: "demo-world-es",
        story_date: localDate(),
        day_number: 1,
        title: "Una carta desde Barcelona",
        teaser: "Luna ha encontrado un rincón especial de la ciudad.",
        body: "Hola, amiga. Hoy camino por una calle pequeña de Barcelona. Hay flores en los balcones y música cerca de la plaza. Encuentro una cafetería tranquila y pienso que te gustaría. Pido dos cafés, aunque tú todavía no estás aquí. Quizá un día podamos visitar este lugar juntas.",
        status: "story_read",
        read_position: 100,
      }],
      messages: {
        [episodeId]: [
          { id: 1, role: "assistant", content: "¡Hola! ¿Qué parte de Barcelona te gustaría conocer primero?", created_at: now },
        ],
      },
    },
  };
}

export { localDate };
