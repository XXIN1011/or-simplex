/* =========================================================================
   极简路由：首页 / 单纯形法 / 灵敏度分析
   -------------------------------------------------------------------------
   用 hash 路由（#/simplex、#/sens），手机上刷新、后退、加桌面都能正常工作，
   而且纯静态单文件也能用。以后加新模块只要两步：
     ① 页面里加一个 <div class="mod" id="mod-xxx"> 容器
     ② 把名字登记到下面的 MODULES 里
   ========================================================================= */
(function () {
  'use strict';

  var MODULES = ['home', 'simplex', 'sens', 'dp', 'ip', 'inv'];

  function current() {
    var h = (location.hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    return MODULES.indexOf(h) >= 0 ? h : 'home';
  }

  function show(name) {
    MODULES.forEach(function (m) {
      var el = document.getElementById('mod-' + m);
      if (el) el.classList.toggle('on', m === name);
    });
    window.scrollTo(0, 0);
    /* 表格是否溢出要等它可见之后才量得准，所以切页后再补一次「左右滑动」提示 */
    if (typeof addScrollHints === 'function') {
      setTimeout(function () { addScrollHints(document); }, 0);
    }
  }

  window.addEventListener('hashchange', function () { show(current()); });
  show(current());
})();
