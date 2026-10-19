'use strict';

/* 在浏览器用实际增减按钮录题；读取表格现有行列，保留未移除的数据。 */
module.exports = function resizeInput(mount, n, m) {
  var root = document.getElementById(mount);
  var buttons = root.querySelectorAll('.ctrls > button');
  function dimensions() {
    if (mount === 'tpPanel') return [root.querySelectorAll('[data-key=supply]').length, root.querySelectorAll('[data-key=demand]').length];
    if (mount === 'asPanel') return [root.querySelectorAll('#asInTbl tbody th').length, root.querySelectorAll('#asInTbl thead th.colh').length];
    return [root.querySelectorAll('[data-k=c]').length, root.querySelectorAll('[data-k=b]').length];
  }
  [n, m].forEach(function (target, axis) {
    var count = 0;
    while (dimensions()[axis] !== target) {
      var button = buttons[axis * 2 + (dimensions()[axis] > target ? 1 : 0)];
      if (button.disabled || ++count > 20) throw new Error('无法通过增减按钮设置 ' + mount);
      button.click();
    }
  });
};
