if (!window.SCREENS) window.SCREENS = {};

SCREENS.bilingualChat = {
  name: '双语聊天',
  init: function() {
    this.bindSend();
    this.bindVocab();
  },
  bindSend: function() {
    var btn = document.querySelector('.chat-send-btn');
    var input = document.querySelector('.chat-input');
    if (!btn || !input) return;
    btn.onclick = function() {
      if (!input.value.trim()) return;
      APP.showScreen('bilingualChat');
    };
    input.onkeydown = function(e) {
      if (e.key === 'Enter') btn.click();
    };
  },
  bindVocab: function() {
    document.querySelectorAll('.vocab-word').forEach(function(el) {
      el.onclick = function() {
        var word = this.dataset.word;
        alert('📘 已将 "' + word + '" 添加到单词本\n💎 +5 XP');
      };
    });
  }
};
