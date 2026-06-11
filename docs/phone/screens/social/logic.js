window.SCREENS = window.SCREENS || {};
window.SCREENS.social = {
  init: function () {
    var self = this;
    document.querySelectorAll('.bilingual-card[data-screen], .friend-item[data-screen]').forEach(function (el) {
      el.addEventListener('click', function () {
        var screen = this.dataset.screen;
        if (screen && typeof APP !== 'undefined' && APP.showScreen) {
          APP.showScreen(screen);
        }
      });
    });
  }
};

document.addEventListener('DOMContentLoaded', function () {
  if (window.SCREENS.social.init) {
    window.SCREENS.social.init();
  }
});
