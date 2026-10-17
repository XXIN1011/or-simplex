/* 最小元素法：相同费用按行、列下标；运量和基身份始终独立。 */
'use strict';
var common = require('./transport-model.js');
var completion = require('./transport-flow.js').completion;
function initial(model, emit) {
  var m = model.rows, n = model.cols, x = common.matrix(m, n, 0), basis = common.matrix(m, n, false);
  var s = model.supply.slice(), d = model.demand.slice(), i, j, best, ties, quantity;
  var available = common.copy(model.allowed);
  function active(i, j) {
    return available[i][j] && s[i] > (model.forbiddenCount ? model.supply[i] * common.ROUND_EPS * (m + n) : 0)
      && d[j] > (model.forbiddenCount ? model.demand[j] * common.ROUND_EPS * (m + n) : 0);
  }
  if (model.forbiddenCount) {
    var feasibility = completion(model, s, d, available);
    if (!feasibility.feasible) return { status: 'infeasible', feasibility: feasibility };
  }
  while (true) {
    best = null; ties = [];
    for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (active(i, j)) {
      if (!best || model.working[i][j] < best.cost) best = { i: i, j: j, cost: model.working[i][j] };
    }
    if (!best) break;
    for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (active(i, j) && model.working[i][j] === best.cost) ties.push({ i: i, j: j });
    i = best.i; j = best.j; quantity = Math.min(s[i], d[j]);
    var proposed = quantity, trial = null;
    available[i][j] = false;
    if (model.forbiddenCount) {
      /* 强制分配上限后，最大流的缺额恰是必须退让的量（供需割约束）。
         固定本格后不再使用它，按费用顺序逐格取可行最大值，避免贪心堵路。 */
      var rs = s.slice(), rd = d.slice(); rs[i] -= quantity; rd[j] -= quantity;
      trial = completion(model, rs, rd, available);
      if (!trial.feasible) quantity = Math.max(0, quantity - trial.deficit);
      /* q−缺额发生相消时，仅归零/贴齐本次上限的舍入尾差，不丢掉整题的微小量。 */
      var round = proposed * common.ROUND_EPS * (m + n);
      if (quantity < round) quantity = 0;
      else if (proposed - quantity < round) quantity = proposed;
    }
    x[i][j] = quantity; basis[i][j] = quantity > 0; s[i] -= quantity; d[j] -= quantity;
    emit('allocation', x, basis, { cell: { i: i, j: j }, cost: best.cost, quantity: quantity,
      proposedQuantity: proposed, guarded: quantity < proposed,
      feasibilityDeficit: trial ? trial.deficit : 0,
      blockedCutRows: trial ? trial.cutRows : [], blockedCutCols: trial ? trial.cutCols : [],
      ties: ties, remainingSupply: s.slice(), remainingDemand: d.slice() });
  }
  /* 普通分配耗尽一行或一列；禁运保护按格逐个固定可行最大量，所得极点亦为森林。
     按行列顺序仅在可运图内补零基；孤立结点不强行跨禁运连接，不拿 epsilon 当运量。 */
  var f = common.forest(m, n), added = [];
  for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (basis[i][j]) f.join(i, j);
  for (i = 0; i < m; i++) for (j = 0; j < n; j++) if (model.allowed[i][j] && !basis[i][j] && f.join(i, j)) {
    basis[i][j] = true; added.push({ i: i, j: j });
  }
  emit('initial', x, basis, { zeroBasics: added, remainingSupply: s, remainingDemand: d });
  return { allocation: x, basis: basis };
}
module.exports = { initial: initial };
