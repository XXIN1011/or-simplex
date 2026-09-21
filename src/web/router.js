/* =========================================================================
   极简路由：首页 / 单纯形法 / 灵敏度分析 / 整数规划 / 设置
   -------------------------------------------------------------------------
   用 hash 路由（#/simplex、#/sens、#/settings），手机上刷新、后退、加桌面都能
   正常工作，而且纯静态单文件也能用。以后加新模块只要三步：
     ① 页面里加一个 <div class="mod" id="mod-xxx"> 容器
     ② 把名字登记到下面的 MODULES 里
     ③ 想让它出现在底栏就把 <a href="#/xxx" data-m="xxx"> 加进 .tabbar
   ========================================================================= */

var inputPanel = require('./input-panel.js');
var addScrollHints = inputPanel.addScrollHints;
(function () {
  'use strict';

  var MODULES = ['home', 'simplex', 'sens', 'ip', 'settings'];

  function current() {
    var h = (location.hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
    return MODULES.indexOf(h) >= 0 ? h : 'home';
  }

  /* ---- 底部导航的滑动指示器 ----
     高亮底由 .tb-pill 一个元素承担，切模块时从旧位置平滑滑到新位置。
     ★ 底栏只有「首页」和「设置」两个入口，三个算法模块是从首页卡片进的：
       进到模块页时没有任何标签是当前项，此时指示器整个隐去（而不是错误地
       一直亮着「首页」）—— 模块页顶部本来就有「← 返回首页」。
     两个必须注意的点：
     ① 位置要用 rect 算，不能用 offsetLeft —— .tabbar 是 position:fixed，
        .tb-pill 是它的绝对定位子元素，pill 的 left:0 参照「padding box」的
        左边缘（边框内侧），所以位移 = 标签 rect.left - 导航条 rect.left - 边框宽。
     ② 首次定位必须关掉过渡，否则开屏会看到指示器从最左边滑过去。 */
  var pillArmed = false;

  function movePill() {
    var bar = document.querySelector('.tabbar');
    if (!bar) return;
    var pill = bar.querySelector('.tb-pill');
    if (!pill) return;
    var act = bar.querySelector('a.on');
    if (!act) { pill.classList.remove('on'); return; }
    var br = bar.getBoundingClientRect();
    var ar = act.getBoundingClientRect();
    var bw = parseFloat(getComputedStyle(bar).borderLeftWidth) || 0;
    if (!pillArmed) pill.style.transition = 'none';
    pill.style.width = ar.width + 'px';
    pill.style.transform = 'translateX(' + (ar.left - br.left - bw) + 'px)';
    pill.classList.add('on');
    if (!pillArmed) {
      pillArmed = true;
      /* 下一帧再把过渡交还给样式表，之后切页就有动画了 */
      requestAnimationFrame(function () { pill.style.transition = ''; });
    }
  }

  /* 横竖屏切换、桌面端拉伸、系统字号变化都会让标签宽度变掉 */
  var pillTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(pillTimer);
    pillTimer = setTimeout(movePill, 120);
  });
  window.addEventListener('load', movePill);

  function show(name) {
    MODULES.forEach(function (m) {
      var el = document.getElementById('mod-' + m);
      if (el) el.classList.toggle('on', m === name);
    });
    /* 底部导航条上的当前模块也要高亮：它是常驻的，不标一下就看不出「我在哪」。 */
    Array.prototype.forEach.call(document.querySelectorAll('.tabbar a[data-m]'), function (a) {
      a.classList.toggle('on', a.getAttribute('data-m') === name);
    });
    movePill();
    window.scrollTo(0, 0);
    /* 表格是否溢出要等它可见之后才量得准，所以切页后再补一次「左右滑动」提示 */
    if (typeof addScrollHints === 'function') {
      setTimeout(function () { addScrollHints(document); }, 0);
    }
  }

  window.addEventListener('hashchange', function () { show(current()); });
  show(current());
})();

/* 本模块没有对外接口：require 一次即启动 hash 路由（副作用模块）。 */
module.exports = {};
