/* 库存论截图用：切到「disc」模型并求解（供 shot.js 第 6 参数 @文件名 使用） */
(function () {
  var key = 'disc';
  var tabs = document.getElementById('invTabs');
  Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (b) {
    if (b.getAttribute('data-k') === key) b.click();
  });
  document.getElementById('invSolveBtn').click();
})();
