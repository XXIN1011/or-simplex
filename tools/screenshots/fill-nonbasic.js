/* 截图用：max 2x1+3x2, x1+x2 ≤ 4 —— 只有 1 个约束，
   于是 x2 成为基变量、x1 成为非基变量，用来检验「非基变量只有单侧有限」的显示 */
(function () {
  document.getElementById('addVar').click();
  document.getElementById('addVar').click();
  document.getElementById('addCon').click();

  function set(sel, v) {
    var el = document.querySelector(sel);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  set('#inTbl input[data-k="c"][data-j="0"]', '2');
  set('#inTbl input[data-k="c"][data-j="1"]', '3');
  set('#inTbl input[data-k="a"][data-i="0"][data-j="0"]', '1');
  set('#inTbl input[data-k="a"][data-i="0"][data-j="1"]', '1');
  set('#inTbl input[data-k="b"][data-i="0"]', '4');
  document.getElementById('solveBtn').click();
  return 'ok';
})()
