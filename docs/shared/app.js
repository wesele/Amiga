/* ============================================================
   APP — 控制器 + 渲染器 + 引导程序
   内容已由 build.ps1 嵌入 index.html，不再使用 fetch
   ============================================================ */
window.APP = {

  /* ---- 工具: screen ID → CamelCase 模块名 ---- */
  _screenModuleName: function(id) {
    if (window.SCREENS && SCREENS[id]) return id;
    var map = { scrAIChat: 'aiChat' };
    if (map[id]) return map[id];
    var s = id.replace('scr','');
    return s.charAt(0).toLowerCase() + s.slice(1);
  },

  /* ---- 屏幕切换 ---- */
  showScreen: function(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    var el = document.getElementById(id);
    if (el) el.classList.add('active');
    var ps = document.getElementById('phoneScreen');
    if (ps) ps.scrollTop = 0;
    var mName = APP._screenModuleName(id);
    if (mName && window.SCREENS && SCREENS[mName] && SCREENS[mName].onShow) {
      SCREENS[mName].onShow();
    }
  },

  /* ---- 渲染 Schema (语法高亮) ---- */
  renderSchema: function() {
    var container = document.getElementById('schemaContent');
    if (!container) return;
    var lines = DATA.schemaSQL.split('\n');
    container.innerHTML = lines.map(function(line) {
      if (line.trim() === '') return '<div class="schema-line"><br></div>';
      var h = line
        .replace(/\b(CREATE|TABLE|PRIMARY KEY|REFERENCES|DEFAULT|NOT NULL|UNIQUE|INTEGER|TEXT|DATETIME|AUTOINCREMENT)\b/g, '<span class="keyword">$1</span>')
        .replace(/--.*/g, '<span class="comment">$&</span>')
        .replace(/'[^']*'/g, '<span class="string">$&</span>');
      return '<div class="schema-line">' + h + '</div>';
    }).join('');
  },

  /* ---- 初始化 ---- */
  init: function() {
    // 初始化所有已注册的屏幕模块
    for (var key in window.SCREENS) {
      if (SCREENS.hasOwnProperty(key) && SCREENS[key].init) {
        SCREENS[key].init();
      }
    }

    // 渲染 Schema（内容已由 build 嵌入）
    APP.renderSchema();

    // 设置练习演示区默认内容
    var demo = document.getElementById('exerciseDemo');
    if (demo) demo.innerHTML = DATA.demos.image_select;

    // 侧边栏导航高亮
    document.querySelectorAll('.sidebar nav a').forEach(function(a) {
      a.addEventListener('click', function() {
        document.querySelectorAll('.sidebar nav a').forEach(function(x) { x.classList.remove('active'); });
        this.classList.add('active');
      });
    });

    // 事件委托: data-screen 切换 + 演示区 Tab
    document.addEventListener('click', function(e) {
      var screenTarget = e.target.closest('[data-screen]');
      if (screenTarget) {
        e.preventDefault();
        APP.showScreen(screenTarget.dataset.screen);
        return;
      }
      var tab = e.target.closest('.demo-tab');
      if (tab) {
        document.querySelectorAll('.demo-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var demoEl = document.getElementById('exerciseDemo');
        if (demoEl) demoEl.innerHTML = DATA.demos[tab.dataset.type] || '';
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', function() { APP.init(); });
