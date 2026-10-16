/* 最小元素法：相同费用按行、列下标；运量和基身份始终独立。 */
'use strict';
var common = require('./transport-model.js');
function initial(model, emit) {
  var m = model.rows, n = model.cols, x = common.matrix(m, n, 0), basis = common.matrix(m, n, false);
  var s = model.supply.slice(), d = model.demand.slice(), i, j, best, ties, quantity;
  while (true) {
    best = null; ties = [];
    for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (s[i] > 0 && d[j] > 0) {
      if (!best || model.working[i][j] < best.cost) best = { i: i, j: j, cost: model.working[i][j] };
    }
    if (!best) break;
    for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (s[i] > 0 && d[j] > 0 && model.working[i][j] === best.cost) ties.push({ i: i, j: j });
    i = best.i; j = best.j; quantity = Math.min(s[i], d[j]);
    x[i][j] = quantity; basis[i][j] = true; s[i] -= quantity; d[j] -= quantity;
    emit('allocation', x, basis, { cell: { i: i, j: j }, cost: best.cost, quantity: quantity,
      ties: ties, remainingSupply: s.slice(), remainingDemand: d.slice() });
  }
  /* 每次分配至少耗尽一行或一列，正运量边构成森林。按行列顺序连通不同分量，
     将零供应、零需求结点也纳入生成树；绝不拿 epsilon 当实际运输量。 */
  var f = common.forest(m, n), added = [];
  for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (basis[i][j]) f.join(i, j);
  for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (!basis[i][j] && f.join(i, j)) {
    basis[i][j] = true; added.push({ i: i, j: j });
  }
  emit('initial', x, basis, { zeroBasics: added, remainingSupply: s, remainingDemand: d });
  return { allocation: x, basis: basis };
}
module.exports = { initial: initial };
