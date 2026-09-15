/* 截图用：在空页面上搭一道 max z = 2x1+3x2 的题并求解 */
(function () {
  var q = function (s) { return document.querySelector(s); };
  var fire = function (el, ev) { el.dispatchEvent(new Event(ev, { bubbles: true })); };
  var setC = function (j, v) { var e = q('#inTbl input[data-k="c"][data-j="' + j + '"]'); e.value = v; fire(e, 'input'); };
  var setA = function (i, j, v) { var e = q('#inTbl input[data-k="a"][data-i="' + i + '"][data-j="' + j + '"]'); e.value = v; fire(e, 'input'); };
  var setB = function (i, v) { var e = q('#inTbl input[data-k="b"][data-i="' + i + '"]'); e.value = v; fire(e, 'input'); };

  document.getElementById('addVar').click();
  document.getElementById('addVar').click();
  document.getElementById('addCon').click();
  document.getElementById('addCon').click();
  document.getElementById('addCon').click();

  setC(0, 2); setC(1, 3);
  setA(0, 0, 1); setA(0, 1, 2); setB(0, 8);
  setA(1, 0, 4); setA(1, 1, 0); setB(1, 16);
  setA(2, 0, 0); setA(2, 1, 4); setB(2, 12);

  document.getElementById('solveBtn').click();
})();
