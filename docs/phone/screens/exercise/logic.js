/* ============================================================
   Exercise Screen Module
   Registers with window.SCREENS
   Exercise types: image_selection, translation, sentence_sort
   ============================================================ */
window.SCREENS = window.SCREENS || {};
window.SCREENS.exercise = (function() {

  /* ---- Sample exercise data ---- */
  var exerciseData = [
    {
      type: 'image_selection',
      skill: '基础问候',
      prompt: '选择下面图片对应的西班牙语单词',
      hint: '提示：这是一种水果',
      emoji: '🍌',
      options: ['manzana', 'naranja', 'plátano', 'uva'],
      answer: 'plátano',
      explanation: 'plátano = 香蕉'
    },
    {
      type: 'translation',
      skill: '基础问候',
      prompt: '翻译下面的句子',
      hint: '英语 → 中文',
      sentence: 'I would like a coffee, please.',
      options: ['我想要一杯咖啡。', '我喜欢咖啡。', '我需要咖啡。', '我喝咖啡。'],
      answer: '我想要一杯咖啡。',
      explanation: '"I would like" 是礼貌表达"我想要"'
    },
    {
      type: 'sentence_sort',
      skill: '基础问候',
      prompt: '排列正确的句子顺序',
      hint: '西班牙语：我想要一杯水',
      words: ['Quiero', 'un', 'vaso', 'de', 'agua'],
      answer: 'Quiero un vaso de agua',
      explanation: '正确语序：Quiero un vaso de agua'
    },
    {
      type: 'image_selection',
      skill: '基础问候',
      prompt: '选择"你好"对应的图片',
      hint: '问候手势',
      emoji: '👋',
      options: ['adiós', 'hola', 'gracias', 'por favor'],
      answer: 'hola',
      explanation: 'hola = 你好'
    },
    {
      type: 'translation',
      skill: '基础问候',
      prompt: '翻译下面的句子',
      hint: '英语 → 中文',
      sentence: 'Good morning, how are you?',
      options: ['早上好，你好吗？', '下午好，你叫什么？', '晚上好，你几岁？', '你好，再见。'],
      answer: '早上好，你好吗？',
      explanation: '"Good morning" = 早上好, "how are you" = 你好吗'
    }
  ];

  var currentIndex = 0;
  var currentSkill = '基础问候';

  /* ---- Render helpers ---- */
  function renderProgress(total, done, current) {
    var html = '';
    for (var i = 0; i < total; i++) {
      var cls = i < done ? 'dot done' : i === done ? 'dot current' : 'dot';
      html += '<div class="' + cls + '"></div>';
    }
    document.getElementById('exerciseProgress').innerHTML = html;
  }

  function renderImageSelection(data) {
    var labels = ['A', 'B', 'C', 'D'];
    var html = '<div class="emoji-display">' + data.emoji + '</div>';
    html += '<div class="exercise-options">';
    for (var i = 0; i < data.options.length; i++) {
      html += '<button class="exercise-opt" data-value="' + data.options[i] + '" data-answer="' + data.answer + '">';
      html += '<span class="opt-label">' + labels[i] + '</span>';
      html += data.options[i];
      html += '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderTranslation(data) {
    var labels = ['A', 'B', 'C', 'D'];
    var html = '<div class="sentence-display">' + data.sentence + '</div>';
    html += '<div class="exercise-options">';
    for (var i = 0; i < data.options.length; i++) {
      html += '<button class="exercise-opt" data-value="' + data.options[i] + '" data-answer="' + data.answer + '">';
      html += '<span class="opt-label">' + labels[i] + '</span>';
      html += data.options[i];
      html += '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderSentenceSort(data) {
    var shuffled = data.words.slice().sort(function() { return Math.random() - 0.5; });
    var html = '<div class="word-chips" id="wordChips">';
    for (var i = 0; i < shuffled.length; i++) {
      html += '<span class="word-chip" data-word="' + shuffled[i] + '">' + shuffled[i] + '</span>';
    }
    html += '</div>';
    html += '<div class="answer-area" id="answerArea"></div>';
    html += '<button class="next-btn" id="sortCheckBtn" style="margin-top:8px;">检查答案</button>';
    return html;
  }

  function renderExerciseContent(data) {
    var promptEl = document.getElementById('exercisePrompt');
    promptEl.innerHTML = '<div class="prompt-text">' + data.prompt + '</div><div class="hint">' + data.hint + '</div>';

    var optionsEl = document.getElementById('exerciseOptions');
    var html = '';
    switch (data.type) {
      case 'image_selection':
        html = renderImageSelection(data);
        break;
      case 'translation':
        html = renderTranslation(data);
        break;
      case 'sentence_sort':
        html = renderSentenceSort(data);
        break;
    }
    optionsEl.innerHTML = html;

    var feedbackEl = document.getElementById('exerciseFeedback');
    feedbackEl.className = 'exercise-feedback';
    feedbackEl.innerHTML = '';

    var nextBtn = document.getElementById('nextBtn');
    nextBtn.style.display = 'none';

    if (data.type === 'image_selection' || data.type === 'translation') {
      var opts = optionsEl.querySelectorAll('.exercise-opt');
      for (var i = 0; i < opts.length; i++) {
        opts[i].addEventListener('click', function() {
          checkAnswer(this);
        });
      }
    } else if (data.type === 'sentence_sort') {
      setupSentenceSort(data);
    }
  }

  /* ---- Sentence sort setup ---- */
  function setupSentenceSort(data) {
    var chips = document.querySelectorAll('.word-chip');
    var answerArea = document.getElementById('answerArea');
    var checkBtn = document.getElementById('sortCheckBtn');

    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function() {
        if (this.parentNode.id === 'wordChips') {
          answerArea.appendChild(this);
          this.classList.add('selected');
        } else {
          document.getElementById('wordChips').appendChild(this);
          this.classList.remove('selected');
        }
      });
    }

    if (checkBtn) {
      checkBtn.addEventListener('click', function() {
        var words = answerArea.querySelectorAll('.word-chip');
        var userAnswer = '';
        for (var j = 0; j < words.length; j++) {
          userAnswer += (j > 0 ? ' ' : '') + words[j].getAttribute('data-word');
        }
        var feedback = document.getElementById('exerciseFeedback');
        if (userAnswer === data.answer) {
          feedback.className = 'exercise-feedback show correct';
          feedback.innerHTML = '<span class="fb-icon">✅</span> 正确！+10 XP<div class="fb-detail">' + data.explanation + '</div>';
          document.getElementById('nextBtn').style.display = 'inline-block';
          disableChips(answerArea);
        } else {
          feedback.className = 'exercise-feedback show wrong';
          feedback.innerHTML = '<span class="fb-icon">❌</span> 顺序不对，再试试！<div class="fb-detail">当前：' + userAnswer + '</div>';
        }
      });
    }
  }

  function disableChips(container) {
    var chips = container.querySelectorAll('.word-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].style.cursor = 'default';
    }
  }

  /* ---- Check answer ---- */
  function checkAnswer(btn) {
    var card = document.getElementById('exerciseCard');
    var feedback = document.getElementById('exerciseFeedback');
    if (!card || !feedback) return;

    var selected = btn.getAttribute('data-value');
    var correct = btn.getAttribute('data-answer');
    var data = exerciseData[currentIndex];
    var opts = btn.parentNode.querySelectorAll('.exercise-opt');

    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.add('disabled');
    }

    if (selected === correct) {
      btn.classList.add('correct');
      feedback.className = 'exercise-feedback show correct';
      feedback.innerHTML = '<span class="fb-icon">✅</span> 正确！+10 XP<div class="fb-detail">' + (data.explanation || '') + '</div>';
      updateXp(10);
      document.getElementById('nextBtn').style.display = 'inline-block';
    } else {
      btn.classList.add('wrong');
      for (var j = 0; j < opts.length; j++) {
        if (opts[j].getAttribute('data-value') === correct) {
          opts[j].classList.add('correct');
        }
      }
      feedback.className = 'exercise-feedback show wrong';
      feedback.innerHTML = '<span class="fb-icon">❌</span> 再想想！<div class="fb-detail">正确答案已高亮 — ' + (data.explanation || '') + '</div>';
      setTimeout(function() {
        for (var k = 0; k < opts.length; k++) {
          opts[k].classList.remove('disabled', 'correct', 'wrong');
        }
        feedback.className = 'exercise-feedback';
        feedback.innerHTML = '';
      }, 2000);
    }
  }

  /* ---- XP display ---- */
  function updateXp(amount) {
    var xpEl = document.getElementById('exerciseXp');
    if (!xpEl) return;
    var match = xpEl.textContent.match(/(\+?\d+)/);
    var current = match ? parseInt(match[1], 10) : 0;
    xpEl.textContent = '+' + (current + amount) + ' XP';
    xpEl.classList.remove('bump');
    void xpEl.offsetWidth;
    xpEl.classList.add('bump');
  }

  /* ---- Public API ---- */
  return {

    currentExercise: currentIndex,

    show: function(skillIdx) {
      currentIndex = typeof skillIdx === 'number' ? skillIdx % exerciseData.length : 0;
      var data = exerciseData[currentIndex];
      currentSkill = data.skill;

      var header = document.querySelector('.screen-title');
      if (header) header.textContent = data.skill;

      renderProgress(8, currentIndex, currentIndex);
      renderExerciseContent(data);

      var xpEl = document.getElementById('exerciseXp');
      if (xpEl) xpEl.textContent = '+0 XP';
    },

    checkAnswer: function(btn) {
      checkAnswer(btn);
    },

    next: function() {
      currentIndex = (currentIndex + 1) % exerciseData.length;
      this.show(currentIndex);
    },

    getData: function() {
      return exerciseData;
    }
  };

})();

/* ---- Wire up next button ---- */
document.addEventListener('click', function(e) {
  var target = e.target.closest('#nextBtn');
  if (target && window.SCREENS && window.SCREENS.exercise) {
    window.SCREENS.exercise.next();
  }
});
