/* 截图/冒烟用：在「指派问题」模块里摆一道题并求解 —— max 4×4 收益矩阵（先 b = M − c，再迭代两轮）
   ★ 这些脚本是 shot.js 用 Runtime.evaluate 直接注入页面的，**不是 CommonJS 模块**，
     所以互相之间不能 require，只能各自写全（与 fill-ip-*.js 的写法一致）。
   用法：node tools/screenshots/shot.js "index.html#/assign" out.png 390 0 "@fill-assign-max.js" */
(function () {
  if (window.__asDone) return 'already';
  window.__asDone = true;
  function q(s) { return document.querySelector(s); }
  function click(id) { document.getElementById(id).click(); }
  function dir(d) { var b = q('#asDirSeg button[data-dir="' + d + '"]'); if (b) b.click(); }

  dir('max');
  window.__asFill(4, 4, [[38, 42, 31, 45], [26, 20, 35, 28], [40, 33, 29, 37], [22, 30, 41, 25]]);
  click('asSolveBtn');
  return 'done';
})()
