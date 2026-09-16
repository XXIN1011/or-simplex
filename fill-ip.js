/* 截图/冒烟用：在整数规划模块里搭一道题并求解
   window.__IP_MODE：
     classic —— max 3x1+2x2, 2x1+3x2≤14, 2x1+x2≤9, 全整数（四种方法里图解法/分枝定界/割平面可用）
     bin     —— 0-1 背包型问题（隐枚举可用）
     minbin  —— min 的 0-1 问题（就是隐枚举报错答案的那个 bug 的复现题）
     mix     —— 第一个变量连续、第二个整数（割平面与隐枚举都不可用） */
(function () {
  var mode = (window.__IP_MODE || 'classic');
  if (window.__ipDone) return 'already';
  window.__ipDone = true;

  function q(s) { return document.querySelector(s); }
  function fire(el, ev) { el.dispatchEvent(new Event(ev, { bubbles: true })); }
  function click(id) { document.getElementById(id).click(); }
  function set(sel, v) { var el = q(sel); if (el) { el.value = v; fire(el, 'input'); } }
  function setVT(j, t) {
    var box = q('[data-vt="' + j + '"]');
    var b = box && box.querySelector('button[data-t="' + t + '"]');
    if (b) b.click();
  }

  click('ipAddVar'); click('ipAddVar');
  click('ipAddCon'); click('ipAddCon');
  /* 类型选择器是「变量数变了之后延时重绘」的，脚本等不了 —— 直接同步触发一次，
     否则下面的 setVT 点不到按钮，vtypes 会是空数组 */
  if (window.__ipRenderTypes) window.__ipRenderTypes();

  function con(i, coef, rel, rhs) {
    coef.forEach(function (v, j) { set('#ipInTbl input[data-k="a"][data-i="' + i + '"][data-j="' + j + '"]', String(v)); });
    var sel = q('#ipInTbl select[data-i="' + i + '"]');
    if (sel) { sel.value = rel; fire(sel, 'change'); }
    set('#ipInTbl input[data-k="b"][data-i="' + i + '"]', String(rhs));
  }

  if (mode === 'classic') {
    set('#ipInTbl input[data-k="c"][data-j="0"]', '3');
    set('#ipInTbl input[data-k="c"][data-j="1"]', '2');
    con(0, [2, 3], '<=', 14);
    con(1, [2, 1], '<=', 9);
    setVT(0, 'int'); setVT(1, 'int');
  } else if (mode === 'bin') {
    click('ipAddVar'); click('ipAddVar');
    if (window.__ipRenderTypes) window.__ipRenderTypes();
    set('#ipInTbl input[data-k="c"][data-j="0"]', '4');
    set('#ipInTbl input[data-k="c"][data-j="1"]', '3');
    set('#ipInTbl input[data-k="c"][data-j="2"]', '2');
    set('#ipInTbl input[data-k="c"][data-j="3"]', '5');
    con(0, [3, 1, 2, 1], '<=', 6);
    con(1, [1, 2, 1, 3], '<=', 7);
    for (var j = 0; j < 4; j++) setVT(j, 'bin');
  } else if (mode === 'minbin') {
    /* min z = 4x1 + 3x2 ，x1 + x2 ≥ 1 ，两个都是 0-1 → 最优 (0,1)，z = 3 */
    var dmin = q('#ipDirSeg button[data-dir="min"]');
    if (dmin) dmin.click();
    set('#ipInTbl input[data-k="c"][data-j="0"]', '4');
    set('#ipInTbl input[data-k="c"][data-j="1"]', '3');
    con(0, [1, 1], '>=', 1);
    setVT(0, 'bin'); setVT(1, 'bin');
  } else {
    set('#ipInTbl input[data-k="c"][data-j="0"]', '2');
    set('#ipInTbl input[data-k="c"][data-j="1"]', '3');
    con(0, [2, 2], '<=', 9);
    con(1, [1, 3], '<=', 12);
    setVT(0, 'cont'); setVT(1, 'int');
  }
  click('ipSolveBtn');
  return 'done';
})()
