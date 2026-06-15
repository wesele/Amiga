window.SCREENS = window.SCREENS || {};
window.SCREENS.home = {
  init: function () {
    this.render();
  },
  render: function () {
    const container = document.getElementById('coursePath');
    if (!container) return;
    if (typeof DATA === 'undefined' || !DATA.courseNodes) return;
    container.innerHTML = '';
    DATA.courseNodes.forEach(function (node, i) {
      if (i > 0) {
        var c = document.createElement('div');
        c.className = 'path-connector' + (DATA.courseNodes[i - 1].status === 'completed' ? ' completed' : '');
        container.appendChild(c);
      }
      var el = document.createElement('div');
      el.className = 'path-node ' + node.status;
      var html = '<div class="node-icon">' + node.icon + '</div>';
      html += '<div class="node-info"><div class="node-title">' + node.title + '</div>';
      html += '<div class="node-sub">' + (node.status === 'locked' ? '🔒 完成前置关卡' : node.status === 'completed' ? '✅ 已完成' : '点击开始') + '</div></div>';
      html += '<div class="node-xp">⭐ +' + node.xp + '</div>';
      if (node.status === 'completed') html += '<div class="node-check">✓</div>';
      el.innerHTML = html;
      el.style.cursor = node.status !== 'locked' ? 'pointer' : 'default';
      if (node.status === 'active') {
        (function (idx) {
          el.addEventListener('click', function () { APP.showScreen('scrExercise'); if (window.SCREENS && SCREENS.exercise) SCREENS.exercise.show(idx); });
        })(i);
      }
      container.appendChild(el);
    });
  }
};