/* 截图/冒烟用：在「指派问题」模块里摆一道题并求解 —— min 2 人 3 事 + 两处禁止指派（自动补虚拟人员）
   ★ 这些脚本是 shot.js 用 Runtime.evaluate 直接注入页面的，**不是 CommonJS 模块**，
     所以互相之间不能 require，只能各自写全（与 fill-ip-*.js 的写法一致）。
   用法：node tools/screenshots/shot.js "index.html#/assign" out.png 390 0 "@fill-assign-forbid.js" */
(function () {
  if (window.__asDone) return 'already';
  window.__asDone = true;
  function q(s) { return document.querySelector(s); }
  function click(id) { document.getElementById(id).click(); }
  function dir(d) { var b = q('#asDirSeg button[data-dir="' + d + '"]'); if (b) b.click(); }

  dir('min');
  window.__asFill(2, 3, [[3, 8, null], [7, null, 5]]);
  click('asSolveBtn');
  return 'done';
})()
