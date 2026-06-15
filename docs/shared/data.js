/* ============================================================
   DATA — 所有数据定义
   新增功能时在此模块添加数据
   ============================================================ */
window.DATA = {

  courseNodes: [
    { title: 'Saludos y presentaciones', status: 'completed', xp: 15, icon: '👋' },
    { title: 'El alfabeto y la pronunciación', status: 'completed', xp: 20, icon: '🔤' },
    { title: 'Números y contar',   status: 'completed', xp: 18, icon: '🔢' },
    { title: 'Colores y formas', status: 'completed', xp: 15, icon: '🎨' },
    { title: 'La familia',   status: 'active',    xp: 22, icon: '👨‍👩‍👧' },
    { title: 'Comida y bebida',   status: 'locked',    xp: 20, icon: '🍎' },
    { title: 'La rutina diaria',   status: 'locked',    xp: 25, icon: '☀️' },
    { title: 'Viajes y direcciones',   status: 'locked',    xp: 25, icon: '✈️' },
    { title: 'Gramática: presente', status: 'locked',  xp: 30, icon: '📖' },
  ],

  exerciseBank: {
    image_select: { prompt: 'Selecciona la palabra correcta para la imagen', hint: 'Pista: es una fruta', options: ['manzana','naranja','plátano','uva'], answer: 'plátano', emoji: '🍌' },
    translate:    { prompt: 'Traduce la siguiente frase', hint: '中文 → 西语', sentence: '我想要一杯咖啡。', options: ['Quiero un café.','Me gusta el café.','Necesito café.','Tomo café.'], answer: 'Quiero un café.' },
    sentence_sort:{ prompt: 'Ordena las palabras para formar una oración correcta', hint: '中文：我想要一杯水', words: ['Quiero','un','vaso','de','agua'], answer: 'Quiero un vaso de agua' },
    spelling:     { prompt: 'Escucha y escribe la palabra', hint: '🔊 Haz clic para escuchar — "谢谢" en español', answer: 'gracias', placeholder: 'Escribe la palabra...' },
    listening:    { prompt: 'Escucha y elige la traducción correcta', hint: '🔊 ¿Qué has oído?', options: ['Hola','Gracias','Adiós','Perdón'], answer: 'Hola' },
    fill:         { prompt: 'Completa con la forma correcta del verbo', hint: 'Presente de indicativo: Yo ___ (hablar) español.', answer: 'hablo', options: ['hablo','hablas','habla','hablamos'] },
  },

  exerciseTypes: ['image_select','translate','sentence_sort','spelling','listening','fill'],

  leaderboard: {
    friends: [
      { name:'Maria', xp:1250, avatar:'👩', rank:1 },
      { name:'学习者', xp:980, avatar:'🧑', rank:2, self:true },
      { name:'Carlos', xp:720, avatar:'👨', rank:3 },
      { name:'Yuki', xp:540, avatar:'🧑', rank:4 },
      { name:'Anna', xp:310, avatar:'👩', rank:5 },
    ],
    global: [
      { name:'LingMaster', xp:15200, avatar:'👑', rank:1 },
      { name:'PolyglotPro', xp:12800, avatar:'🌟', rank:2 },
      { name:'学习者', xp:9800, avatar:'🧑', rank:3, self:true },
      { name:'WordWizard', xp:8400, avatar:'📚', rank:4 },
      { name:'LinguistX', xp:6200, avatar:'🌍', rank:5 },
    ]
  },

  demos: {
    image_select: `<div class="t-center"><div class="demo-icon-big">🍎 🍌 🍊 🍇</div><div class="demo-title">🖼️ 图片选词</div><p class="demo-desc">看图片选择对应的西语词</p><div class="demo-opt-grid-2"><div class="demo-opt-item normal">manzana</div><div class="demo-opt-item highlight">plátano ✓</div><div class="demo-opt-item normal">naranja</div><div class="demo-opt-item normal">uva</div></div></div>`,
    translate: `<div class="t-center"><div style="font-size:20px;font-weight:600;color:var(--blue);margin-bottom:8px;">"我想要一杯咖啡。"</div><div class="demo-desc">选择正确的西语翻译</div><div class="demo-opt-grid"><div class="demo-opt-item normal">Me gusta el café.</div><div class="demo-opt-item highlight">Quiero un café. ✓</div><div class="demo-opt-item normal">Necesito café.</div></div></div>`,
    sentence_sort: `<div class="t-center"><div class="demo-title">📝 句子排序</div><p class="demo-desc">打乱的单词 → 拖拽排成正确西语句子</p><div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:16px;"><span class="demo-word-chip">Quiero</span><span class="demo-word-chip">agua</span><span class="demo-word-chip">de</span><span class="demo-word-chip">un</span><span class="demo-word-chip">vaso</span></div><div style="color:var(--green);font-weight:600;">→ Quiero un vaso de agua</div></div>`,
    spelling: `<div class="t-center"><div style="font-size:40px;margin-bottom:8px;">🔊</div><div class="demo-title">⌨️ 拼写题</div><p class="demo-desc">听发音 → 输入西语拼写</p><div style="max-width:250px;margin:0 auto;"><input type="text" placeholder="Escribe la palabra..." value="gracias" class="demo-input-correct"><div style="color:var(--green);margin-top:8px;font-weight:600;">✅ ¡Correcto!</div></div></div>`,
    listening: `<div class="t-center"><div style="font-size:40px;margin-bottom:8px;cursor:pointer;">🔊</div><div class="demo-title">🎧 听力选择</div><p class="demo-desc">播放录音 → 选择对应的中文翻译</p><div class="demo-opt-grid-2"><div class="demo-opt-item highlight">你好 ✓</div><div class="demo-opt-item normal">谢谢</div><div class="demo-opt-item normal">再见</div><div class="demo-opt-item normal">对不起</div></div></div>`,
    fill: `<div class="t-center"><div class="demo-title">✏️ 填空变位</div><p class="demo-desc">根据上下文填写正确的动词变位</p><div style="font-size:16px;margin-bottom:16px;">Yo <span class="demo-blank">hablo</span> (hablar) español.</div><div class="demo-opt-grid" style="max-width:250px;"><div class="demo-opt-item highlight">hablo ✓</div><div class="demo-opt-item normal">hablas</div><div class="demo-opt-item normal">habla</div><div class="demo-opt-item normal">hablamos</div></div></div>`
  },

  schemaSQL: `-- 语言定义\nCREATE TABLE languages (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL, native_name TEXT NOT NULL,\n  direction TEXT DEFAULT 'ltr', enabled INTEGER DEFAULT 1\n);\n\n-- 课程定义\nCREATE TABLE courses (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  language_code TEXT NOT NULL REFERENCES languages(id),\n  display_order INTEGER NOT NULL, title TEXT NOT NULL,\n  description TEXT, cefr_level TEXT, enabled INTEGER DEFAULT 1\n);\n\n-- 单元定义\nCREATE TABLE units (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  course_id INTEGER NOT NULL REFERENCES courses(id),\n  display_order INTEGER NOT NULL, title TEXT NOT NULL,\n  theme_type TEXT, theme_data TEXT\n);\n\n-- 关卡定义\nCREATE TABLE skills (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  unit_id INTEGER NOT NULL REFERENCES units(id),\n  display_order INTEGER NOT NULL, title TEXT NOT NULL,\n  icon TEXT, xp_reward INTEGER DEFAULT 10, prerequisites TEXT\n);\n\n-- 练习定义\nCREATE TABLE exercises (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  skill_id INTEGER NOT NULL REFERENCES skills(id),\n  display_order INTEGER NOT NULL,\n  exercise_type TEXT NOT NULL, prompt TEXT NOT NULL,\n  answer TEXT NOT NULL, options TEXT,\n  audio_hint TEXT, image_hint TEXT,\n  difficulty INTEGER DEFAULT 1, explanation TEXT\n);\n\n-- 用户表\nCREATE TABLE users (\n  id TEXT PRIMARY KEY, username TEXT NOT NULL,\n  email TEXT, avatar TEXT, native_language TEXT REFERENCES languages(id),\n  xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1,\n  streak INTEGER DEFAULT 0, gems INTEGER DEFAULT 0,\n  hearts INTEGER DEFAULT 5, league TEXT DEFAULT 'bronze',\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_active_date TEXT\n);\n\n-- 用户进度表\nCREATE TABLE user_progress (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id TEXT NOT NULL REFERENCES users(id),\n  skill_id INTEGER NOT NULL REFERENCES skills(id),\n  status TEXT DEFAULT 'locked',\n  best_score INTEGER, attempts INTEGER DEFAULT 0,\n  completed_at DATETIME, UNIQUE(user_id, skill_id)\n);\n\n-- 好友关系\nCREATE TABLE friendships (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id TEXT NOT NULL REFERENCES users(id),\n  friend_id TEXT NOT NULL REFERENCES users(id),\n  status TEXT DEFAULT 'pending',\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  UNIQUE(user_id, friend_id)\n);\n\n-- 双语聊天消息\nCREATE TABLE chat_messages (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  sender_id TEXT NOT NULL REFERENCES users(id),\n  receiver_id TEXT NOT NULL REFERENCES users(id),\n  original_text TEXT NOT NULL, original_lang TEXT NOT NULL,\n  translated_text TEXT NOT NULL, translated_lang TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, read INTEGER DEFAULT 0\n);`
};
