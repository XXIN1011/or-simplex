/* =========================================================================
   底栏自动让位：往上滑（要看更多内容）时收起，往下滑才回来
   -------------------------------------------------------------------------
   底栏是 position:fixed 的，读长表格时一直压在内容上；而手指往上滑正是
   「我想多看几行」的意思 —— 这时候它应该让开，往回滚了再回来。

   几个刻意的取舍：
   · 只看「累计位移」，不按方向瞬时值切换：惯性滚动里手指方向会抖几像素，
     一抖就切会让底栏在屏幕上颤。两个方向都要累计超过 10px 才动作。
   · 靠近顶部（≤24px）永远露着：一进来就藏会让人找不到「首页 / 设置」；
     iOS 回弹还会把 scrollY 压成负数，那里也一律按顶部处理。
   · 判定放进 requestAnimationFrame：手机上一帧可能来好几个 scroll 事件，
     每个都改 class 会反复触发样式计算；一帧只算一次，读到的 scrollY 也最新。
   · 只切 class（.tabbar.hide），动画全交给 CSS —— 这样「藏多深、多久、
     怎么缓动」都在样式表里改，这里只管状态。

   焦点：键盘用户正把焦点放在底栏里时不藏，否则焦点会跟着一起消失；
   反过来说，隐藏态在 CSS 里是 visibility:hidden，藏起来之后那两个链接
   也不会再被 Tab 选中。
   ========================================================================= */
'use strict';

var HIDE_AFTER = 10;      /* 往下累计 10px 才收，滤掉手指抖动 */
var SHOW_AFTER = 10;      /* 往上累计 10px 就回来 */
var TOP_SAFE = 24;        /* 这条线以上永远露着 */

var bar = null;
var bound = false;
var hidden = false;
var lastY = 0;
var acc = 0;
var queued = false;
var lastW = 0;

function scrollY() {
  return window.pageYOffset || document.documentElement.scrollTop || 0;
}

/* 让底栏回来。路由切页、窗口变宽、焦点进来都走这里 —— 都是「现在必须
   看得见导航」的时刻。顺手把累计量清零，免得刚回来又被旧位移推走。 */
function reveal() {
  acc = 0;
  lastY = scrollY();
  if (!bar || !hidden) return;
  hidden = false;
  bar.classList.remove('hide');
}

/* 焦点是否「该被护住」：只有键盘 Tab 进来的焦点才算。
   鼠标/手指点导航留下的焦点（:focus-visible 不成立）不该拦住底栏让位 ——
   刚点完「首页」，接下来正是要读内容，底栏该让开；这种情况下要是也护住，
   手机上点过一次标签就再也不会自动收起了。 */
function keyboardFocusInside() {
  var el = document.activeElement;
  if (!el || !bar.contains || !bar.contains(el)) return false;
  if (!el.matches) return true;                 /* 太老、判断不了的，按保守来 */
  try {
    return el.matches(':focus-visible');
  } catch (e) {
    return true;                                /* 不认 :focus-visible 的也保守处理 */
  }
}

function hide() {
  if (!bar || hidden) return;
  /* 焦点正在底栏里：把用户正在用的链接藏掉，键盘用户会当场迷路 */
  if (keyboardFocusInside()) return;
  /* 页面顶部附近不藏；iOS 回弹时 scrollY 是负数，这里一并挡住 */
  if (scrollY() <= TOP_SAFE) return;
  hidden = true;
  acc = 0;
  bar.classList.add('hide');
}

/* 一帧只判一次：把这一帧的位移累加进 acc，够了才切状态 */
function check() {
  queued = false;
  var now = scrollY();
  var d = now - lastY;
  lastY = now;

  if (now <= TOP_SAFE) {
    if (hidden) reveal(); else acc = 0;
    return;
  }

  /* 只累计「当前有意义」的那个方向：藏着的时候往下滚不该攒成一个大正数，
     否则等用户真往上滑时，10px 的位移会被这笔旧账吃掉，底栏回不来。 */
  acc += d;
  if (hidden) {
    if (acc > 0) acc = 0;
    else if (acc <= -SHOW_AFTER) reveal();
  } else {
    if (acc < 0) acc = 0;
    else if (acc >= HIDE_AFTER) hide();
  }
}

function onScroll() {
  if (queued) return;
  queued = true;
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(check);
  } else {
    setTimeout(check, 16);   /* 老浏览器兜底：没有 rAF 也不至于每一步都算 */
  }
}

/* 只认【宽度】变化（横竖屏切换、桌面拉伸）。
   iOS 地址栏收起时只改 innerHeight 也会触发 resize，而那正好发生在用户
   往下滑的时候 —— 如果这里也 reveal，底栏会刚藏好又蹦出来。 */
function onResize() {
  var w = window.innerWidth;
  if (w === lastW) return;
  lastW = w;
  reveal();
}

function init() {
  if (bound) return;                       /* 幂等：重复 require 不会绑两遍监听 */
  bar = document.querySelector('.tabbar');
  if (!bar) return;
  bound = true;
  lastY = scrollY();
  lastW = window.innerWidth;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  bar.addEventListener('focusin', reveal);
}

init();

module.exports = {
  reveal: reveal,
  /* 测试与调试用：当前是不是藏着的 */
  isHidden: function () { return hidden; }
};
