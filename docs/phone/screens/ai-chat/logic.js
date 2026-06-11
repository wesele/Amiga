if (!window.SCREENS) window.SCREENS = {};

SCREENS.aiChat = {
  name: 'AI 口语练习',
  init: function() {
    this.bindSend();
  },
  bindSend: function() {
    var btn = document.querySelector('.ai-send-btn');
    var input = document.querySelector('.chat-input');
    if (!btn || !input) return;
    btn.onclick = function() {
      if (!input.value.trim()) return;
      APP.showScreen('aiChat');
    };
    input.onkeydown = function(e) {
      if (e.key === 'Enter') btn.click();
    };
  }
};
