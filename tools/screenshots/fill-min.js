/* 截图用：min 型 + 含 = 与 ≥ 约束（会引入人工变量）的题，并求解 */
(function () {
  var q = function (s) { return document.querySelector(s); };
  var fire = function (el, ev) { el.dispatchEvent(new Event(ev, { bubbles: true })); };
  var setC = function (j, v) { var e = q('#inTbl input[data-k="c"][data-j="' + j + '"]'); e.value = v; fire(e, 'input'); };
  var setA = function (i, j, v) { var e = q('#inTbl input[data-k="a"][data-i="' + i + '"][data-j="' + j + '"]'); e.value = v; fire(e, 'input'); };
  var setB = function (i, v) { var e = q('#inTbl input[data-k="b"][data-i="' + i + '"]'); e.value = v; fire(e, 'input'); };
  var setRel = function (i, r) { var e = q('#inTbl select[data-i="' + i + '"]'); e.value = r; fire(e, 'change'); };

  /* min 方向 */
  q('#dirSeg button[data-dir="min"]').click();

  document.getElementById('addVar').click();
  document.getElementById('addVar').click();
  document.getElementById('addCon').click();
  document.getElementById('addCon').click();
  document.getElementById('addCon').click();

  setC(0, 4); setC(1, 1);

  setA(0, 0, 3); setA(0, 1, 1); setB(0, 3); setRel(0, '=');
  setA(1, 0, 4); setA(1, 1, 3); setB(1, 6); setRel(1, '>=');
  setA(2, 0, 1); setA(2, 1, 2); setB(2, 4); setRel(2, '<=');

  document.getElementById('solveBtn').click();
})();
