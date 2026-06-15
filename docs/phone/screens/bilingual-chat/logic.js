if (!window.SCREENS) window.SCREENS = {};

SCREENS.bilingualChat = {
  name: '双语聊天',
  init: function() {
    this.bindSend();
    this.bindVocab();
  },
  appendMessage: function(sender, text) {
    var container = document.getElementById('chatMessages');
    if (!container) return;
    var msg = document.createElement('div');
    msg.className = 'msg ' + sender;
    msg.innerHTML = '<div class="msg-bubble">' + text.replace(/\n/g, '<br>') + '</div>';
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  },
  bindSend: function() {
    var btn = document.querySelector('.chat-send-btn');
    var input = document.querySelector('.chat-input');
    var self = this;
    if (!btn || !input) return;
    btn.onclick = function() {
      if (!input.value.trim()) return;
      self.appendMessage('me', input.value);
      input.value = '';
      setTimeout(function() {
        self.appendMessage('partner', '收到！让我想想怎么用中文回答...');
      }, 1000);
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
