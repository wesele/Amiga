window.SCREENS = window.SCREENS || {};
window.SCREENS.leaderboard = {

  data: {
    friends: [
      { name: 'Maria',    xp: 1250, avatar: '👩', rank: 1 },
      { name: '学习者',   xp: 980,  avatar: '🧑', rank: 2, self: true },
      { name: 'Carlos',   xp: 720,  avatar: '👨', rank: 3 },
      { name: 'Yuki',     xp: 540,  avatar: '🧑', rank: 4 },
      { name: 'Anna',     xp: 310,  avatar: '👩', rank: 5 },
    ],
    global: [
      { name: 'LingMaster',  xp: 15200, avatar: '👑', rank: 1 },
      { name: 'PolyglotPro', xp: 12800, avatar: '🌟', rank: 2 },
      { name: '学习者',      xp: 9800,  avatar: '🧑', rank: 3, self: true },
      { name: 'WordWizard',  xp: 8400,  avatar: '📚', rank: 4 },
      { name: 'LinguistX',   xp: 6200,  avatar: '🌍', rank: 5 },
    ]
  },

  currentType: 'friends',

  show: function(type) {
    type = type || this.currentType;
    this.currentType = type;
    var items = this.data[type] || this.data.friends;
    var container = document.getElementById('lbList');
    if (!container) return;
    container.innerHTML = '';
    items.forEach(function(item) {
      var card = document.createElement('div');
      card.className = 'lb-card' + (item.self ? ' self' : '');
      var rankCls = item.rank === 1 ? 'gold' : item.rank === 2 ? 'silver' : item.rank === 3 ? 'bronze' : '';
      var selfLabel = item.self ? ' <span class="you-tag">(你)</span>' : '';
      card.innerHTML =
        '<div class="lb-rank ' + rankCls + '">' + item.rank + '</div>' +
        '<div class="lb-avatar">' + item.avatar + '</div>' +
        '<div class="lb-name">' + item.name + selfLabel + '</div>' +
        '<div class="lb-xp">⭐ ' + item.xp.toLocaleString() + '</div>';
      container.appendChild(card);
    });
    var tabs = document.querySelectorAll('.lb-tab');
    tabs.forEach(function(t) { t.classList.remove('active'); });
    var activeTab = document.querySelector('.lb-tab[data-type="' + type + '"]');
    if (activeTab) activeTab.classList.add('active');
  },

  init: function() {
    var self = this;
    document.querySelectorAll('.lb-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        self.show(this.dataset.type);
      });
    });
    this.show('friends');
  }
};

document.addEventListener('DOMContentLoaded', function() {
  if (window.SCREENS.leaderboard.init) {
    window.SCREENS.leaderboard.init();
  }
});
