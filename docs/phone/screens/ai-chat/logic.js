if (!window.SCREENS) window.SCREENS = {};

SCREENS.aiChat = {
  name: 'AI 口语练习',
  init: function() {
    this.bindSend();
  },
  appendMessage: function(sender, text) {
    var container = document.getElementById('chatMessages');
    if (!container) return;
    var msg = document.createElement('div');
    msg.className = 'chat-msg ' + sender;
    msg.innerHTML = '<div class="msg-bubble">' + text.replace(/\n/g, '<br>') + '</div>';
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  },
  bindSend: function() {
    var btn = document.querySelector('.ai-send-btn');
    var input = document.querySelector('.chat-input');
    var self = this;
    if (!btn || !input) return;
    btn.onclick = function() {
      if (!input.value.trim()) return;
      self.appendMessage('user', input.value);
      input.value = '';
      setTimeout(function() {
        self.appendMessage('ai', '🤖 这是一个很好的尝试！让我们继续练习。\n\n💡 提示：你可以尝试用更完整的句子回答。');
      }, 800);
    };
    input.onkeydown = function(e) {
      if (e.key === 'Enter') btn.click();
    };
  }
};
