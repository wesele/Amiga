window.SCREENS = window.SCREENS || {};
window.SCREENS.complete = {
  show: function(xp, streak, gems, accuracy) {
    var xpEl = document.querySelector('.xp-burst');
    if (xpEl) xpEl.innerHTML = '<span class="xp-icon">⭐</span> +' + (xp || 45) + ' XP';
    var streakEl = document.querySelector('.streak-item .num');
    var items = document.querySelectorAll('.streak-item .num');
    if (items.length >= 1) items[0].textContent = '🔥 ' + (streak || 8);
    if (items.length >= 2) items[1].textContent = '💎 +' + (gems || 5);
    if (items.length >= 3) items[2].textContent = (accuracy || 92) + '%';
  },
  init: function() {
  }
};
