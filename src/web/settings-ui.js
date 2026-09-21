/* =========================================================================
   设置页（目前只有一项：显示模式）
   -------------------------------------------------------------------------
   为什么主题由 <html data-theme> 驱动，而不是留在 CSS 的
   @media (prefers-color-scheme: dark) 里：
     ① 三档里有一档是「系统是深色、但用户偏要在本应用里看浅色」—— 这种情况
        媒体查询根本表达不了，只能用属性去压它；
     ② 「跟随系统」还必须能实时响应系统外观切换，这本来就得 JS 参与。
   于是把系统偏好解析成 light / dark 落到属性上，CSS 只认属性：深色配色因此
   只有一份，不存在「媒体查询一份 + 属性一份」的双份维护。

   时机：打包后的 <script> 在 </body> 前同步执行，早于首次绘制，所以这里落下
   属性不会看到「先闪一下浅色」。将来若把这支脚本改成异步 / defer 加载，就必须
   在 <head> 里补一段同步脚本先把属性写好，否则开屏会闪。
   ========================================================================= */
'use strict';

/* 用户选的那一档（注意存的不是解析结果，而是选择本身）：system / light / dark */
var KEY = 'or-theme';
var MODES = ['system', 'light', 'dark'];
var DARK_QUERY = '(prefers-color-scheme: dark)';

/* 状态栏 / 地址栏的染色读的是 <meta name="theme-color">，拿不到 CSS 变量，
   所以这两个色值只能在这里再写一遍。它们必须与 template.html 里 --bg 的浅色
   （#f5f7fa）与深色（#0d1016）保持一致。 */
var BG = { light: '#f5f7fa', dark: '#0d1016' };

var mq = window.matchMedia ? window.matchMedia(DARK_QUERY) : null;

function readMode() {
  /* 隐私模式 / 禁用存储时 localStorage 可能直接抛异常，此时退回「跟随系统」 */
  try {
    var v = localStorage.getItem(KEY);
    return MODES.indexOf(v) >= 0 ? v : 'system';
  } catch (e) {
    return 'system';
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch (e) {
    /* 存不下就算了：本次仍然生效，只是下次打开回到默认 */
  }
}

/* 把「用户选的档位」解析成真正生效的 light / dark */
function resolve(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return (mq && mq.matches) ? 'dark' : 'light';
}

function paint(mode) {
  var dark = resolve(mode) === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

  /* 染色跟着当前生效的模式走。不能省：只留两条 media 版 meta 的话，
     「系统深色 + 用户选浅色」时染色会和页面反着来。 */
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? BG.dark : BG.light);

  /* 分段控件高亮当前档位；aria-pressed 让读屏也听得出现在选的是哪一个 */
  var seg = document.getElementById('themeSeg');
  if (!seg) return;
  Array.prototype.forEach.call(seg.getElementsByTagName('button'), function (b) {
    var on = b.getAttribute('data-mode') === mode;
    b.className = on ? 'on' : '';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function selectMode(mode) {
  saveMode(mode);
  paint(mode);
}

(function () {
  /* 开屏先按已存的档位落属性（早于首次绘制，见文件头注释） */
  var mode = readMode();
  paint(mode);

  var seg = document.getElementById('themeSeg');
  if (seg) {
    /* 用事件委托而不是给三个按钮各绑一次：将来加档位（比如「高对比」）
       不用再补绑定。 */
    seg.addEventListener('click', function (ev) {
      var t = ev.target;
      while (t && t !== seg && t.tagName !== 'BUTTON') t = t.parentNode;
      if (!t || t === seg) return;
      var m = t.getAttribute('data-mode');
      if (MODES.indexOf(m) >= 0) selectMode(m);
    });
  }

  /* 系统外观变化时实时跟随：另外两档在 resolve() 里会忽略系统值，
     但仍然无条件重绘一次 —— 省一次判断，代价只是一次属性写入。 */
  if (mq) {
    var onSysChange = function () { paint(readMode()); };
    if (mq.addEventListener) mq.addEventListener('change', onSysChange);
    else if (mq.addListener) mq.addListener(onSysChange);   /* 老 WebView 只有这个 */
  }
})();

module.exports = {
  KEY: KEY,
  readMode: readMode,
  resolve: resolve,
  selectMode: selectMode
};
