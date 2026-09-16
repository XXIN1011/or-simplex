/* 截图/冒烟用：走完灵敏度分析的完整流程
   基准题就是那道考研题：max 2x1-7x2+x3 ; x1+x2+x3≤6, -x1+2x2≤4
   然后用第 (1) 问：目标函数改为 max 2x1+3x2+x3
   第二段参数换场景：'c' 改目标系数 / 'a' 改技术系数 / 'con' 增加约束
                    / 'b' 改右端项 / 'var' 增加变量
                    / 'param' 参数线性规划·变量系数 / 'paramb' 参数线性规划·右边系数 */
(function () {
  var mode = 'paramb';
  function q(s) { return document.querySelector(s); }
  function fire(el, ev) { el.dispatchEvent(new Event(ev, { bubbles: true })); }
  function click(id) { document.getElementById(id).click(); }
  function setS(sel, v) { var el = q(sel); if (el) { el.value = v; fire(el, 'input'); } }

  if (window.__sensDone) return 'already';
  window.__sensDone = true;

  /* ---- ① 基准题 ---- */
  click('sAddVar'); click('sAddVar'); click('sAddVar');
  click('sAddCon'); click('sAddCon');
  setS('#sInTbl input[data-k="c"][data-j="0"]', '2');
  setS('#sInTbl input[data-k="c"][data-j="1"]', '-7');
  setS('#sInTbl input[data-k="c"][data-j="2"]', '1');
  setS('#sInTbl input[data-k="a"][data-i="0"][data-j="0"]', '1');
  setS('#sInTbl input[data-k="a"][data-i="0"][data-j="1"]', '1');
  setS('#sInTbl input[data-k="a"][data-i="0"][data-j="2"]', '1');
  setS('#sInTbl input[data-k="b"][data-i="0"]', '6');
  setS('#sInTbl input[data-k="a"][data-i="1"][data-j="0"]', '-1');
  setS('#sInTbl input[data-k="a"][data-i="1"][data-j="1"]', '2');
  setS('#sInTbl input[data-k="b"][data-i="1"]', '4');
  click('sSolveBtn');

  /* ---- ② 选场景并填参数 ---- */
  var tabKey = { c: 'c', a: 'a', con: 'add-con', b: 'b', var: 'add-var',
                 param: 'param', paramb: 'param' }[mode];
  var tab = q('#sensTabs button[data-t="' + tabKey + '"]');
  if (tab) tab.click();

  if (mode === 'c') {
    setS('[data-f="c"][data-j="0"]', '2');
    setS('[data-f="c"][data-j="1"]', '3');
    setS('[data-f="c"][data-j="2"]', '1');
  } else if (mode === 'a') {
    /* x1 在最优基里，所以走「基变量列 → 整张表重算」那条分支 */
    var ac = q('[data-f="a-con"]'), av = q('[data-f="a-var"]');
    ac.value = '0'; fire(ac, 'change');
    av.value = '0'; fire(av, 'change');
    setS('[data-f="a-val"]', '3');
  } else if (mode === 'con') {
    setS('[data-f="ac-a"][data-j="0"]', '-1');
    setS('[data-f="ac-a"][data-j="1"]', '0');
    setS('[data-f="ac-a"][data-j="2"]', '2');
    q('[data-f="ac-rel"]').value = '>=';
    fire(q('[data-f="ac-rel"]'), 'change');
    setS('[data-f="ac-b"]', '2');
  } else if (mode === 'b') {
    setS('[data-f="b"][data-i="0"]', '3');
    setS('[data-f="b"][data-i="1"]', '4');
  } else if (mode === 'param') {
    setS('[data-f="pd"][data-j="0"]', '1');     // c1(λ) = 2 + λ
  } else if (mode === 'paramb') {
    q('#pKind button[data-k="b"]').click();
    setS('[data-f="pe"][data-i="0"]', '1');     // b1(λ) = 6 + λ
  } else {
    setS('[data-f="av-c"]', '5');
    setS('[data-f="av-a"][data-i="0"]', '1');
    setS('[data-f="av-a"][data-i="1"]', '1');
  }
  click('sensGo');
  return 'done';
})()
