/* 截图用：2 变量 2 约束，故意只填非零系数
   —— 留空的格子应当显示淡灰的 0，且参与计算时被当作 0 */
(function () {
  var addVar = document.getElementById('addVar');
  var addCon = document.getElementById('addCon');
  addVar.click(); addVar.click();
  addCon.click(); addCon.click();

  function set(sel, v) {
    var el = document.querySelector(sel);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* max z = 3x1 + 2x2 */
  set('#inTbl input[data-k="c"][data-j="0"]', '3');
  set('#inTbl input[data-k="c"][data-j="1"]', '2');

  /* x1 +（x2 留空）≤ 4 */
  set('#inTbl input[data-k="a"][data-i="0"][data-j="0"]', '1');
  set('#inTbl input[data-k="b"][data-i="0"]', '4');

  /* （x1 留空）+ x2 ≤ 3 */
  set('#inTbl input[data-k="a"][data-i="1"][data-j="1"]', '1');
  set('#inTbl input[data-k="b"][data-i="1"]', '3');

  /* shot.js 的 doClick 在 extraJs 之前执行，所以这里自己点 */
  document.getElementById('solveBtn').click();

  return 'filled';
})()
