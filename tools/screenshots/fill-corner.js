/* 截图用：最优解落在右上角、且是分数形式 —— 最容易让顶点标注被裁掉的题 */
(function () {
  document.getElementById('addVar').click();
  document.getElementById('addVar').click();
  document.getElementById('addCon').click();
  document.getElementById('addCon').click();

  function set(sel, v) {
    var el = document.querySelector(sel);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* max x1 + x2，x1 ≤ 0.4，x2 ≤ 0.3 → 最优解 (2/5, 3/10) 贴在右上角 */
  set('#inTbl input[data-k="c"][data-j="0"]', '1');
  set('#inTbl input[data-k="c"][data-j="1"]', '1');
  set('#inTbl input[data-k="a"][data-i="0"][data-j="0"]', '1');
  set('#inTbl input[data-k="b"][data-i="0"]', '0.4');
  set('#inTbl input[data-k="a"][data-i="1"][data-j="1"]', '1');
  set('#inTbl input[data-k="b"][data-i="1"]', '0.3');

  document.getElementById('solveBtn').click();
  return 'ok';
})()
