/* 截图用：从随机题库里挑一道「最优基中残留取 0 人工变量」的退化题，
   用来检验退化提示是否出现。（题号 283，min 4 变量 5 约束） */
(function () {
  var prob = {
    direction: 'min',
    c: [2, 8, 4, -2],
    cons: [
      { coef: [3, 5, -3, 0], rel: '>=', rhs: 1 },
      { coef: [-2, 3, 2, 6], rel: '<=', rhs: -11 },
      { coef: [2, -3, 4, 3], rel: '<=', rhs: 16 },
      { coef: [1, -3, 5, 2], rel: '<=', rhs: 15 },
      { coef: [1, -3, 0, -3], rel: '>=', rhs: 8 }
    ]
  };
  var addVar = document.getElementById('addVar');
  var addCon = document.getElementById('addCon');
  for (var i = 0; i < prob.c.length; i++) addVar.click();
  for (var k = 0; k < prob.cons.length; k++) addCon.click();

  function set(sel, v) {
    var el = document.querySelector(sel);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  prob.c.forEach(function (v, j) { set('#inTbl input[data-k="c"][data-j="' + j + '"]', String(v)); });
  prob.cons.forEach(function (kk, i) {
    kk.coef.forEach(function (v, j) { set('#inTbl input[data-k="a"][data-i="' + i + '"][data-j="' + j + '"]', String(v)); });
    set('#inTbl input[data-k="b"][data-i="' + i + '"]', String(kk.rhs));
    var sel = document.querySelector('#inTbl select[data-i="' + i + '"]');
    sel.value = kk.rel;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.getElementById('solveBtn').click();
  return 'ok';
})()
