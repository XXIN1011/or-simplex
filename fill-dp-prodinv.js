/* 截图/冒烟用：在动态规划模块里选题型 → 求解
   第二段的模式由 window.__DP_MODE 决定：
   shortest / resource / knapsack / prodinv / replace */
(function () {
  var mode = 'prodinv';
  var done = window.__dpDone;
  window.__dpDone = true;
  if (done) return 'already';

  var tab = document.querySelector('#dpTabs button[data-t="' + mode + '"]');
  if (tab) tab.click();
  document.getElementById('dpSolveBtn').click();
  return 'done';
})()
