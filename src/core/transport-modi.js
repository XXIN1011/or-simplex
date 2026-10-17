/* MODI 位势、唯一树路径闭回路、Bland 换基及多重最优见证。 */
'use strict';
var common = require('./transport-model.js');
function potentials(model, basis) {
  var u = [], v = [], i, j, changed = true;
  for (i = 0; i < model.rows; i++) u[i] = null;
  for (j = 0; j < model.cols; j++) v[j] = null;
  /* 禁运可能把可运图分成多个区域。每棵基树任选一个结点为零位势。 */
  while (changed) {
    changed = false;
    for (i = 0; i < model.rows; i++) for (j = 0; j < model.cols; j++) if (basis[i][j]) {
      if (u[i] !== null && v[j] === null) { v[j] = model.working[i][j] - u[i]; changed = true; }
      if (v[j] !== null && u[i] === null) { u[i] = model.working[i][j] - v[j]; changed = true; }
    }
    if (!changed) {
      for (i = 0; i < model.rows; i++) if (u[i] === null) { u[i] = 0; changed = true; break; }
      if (!changed) for (j = 0; j < model.cols; j++) if (v[j] === null) { v[j] = 0; changed = true; break; }
    }
  }
  var reduced = common.matrix(model.rows, model.cols, 0), tolerance = common.matrix(model.rows, model.cols, 0), entering = null;
  for (i = 0; i < model.rows; i++) for (j = 0; j < model.cols; j++) {
    if (!model.allowed[i][j]) continue;
    reduced[i][j] = model.working[i][j] - u[i] - v[j];
    /* 每格按参与相减的费用和位势估计舍入界；远处一条昂贵线路不能把本格改善吞掉。 */
    tolerance[i][j] = common.ROUND_EPS * Math.abs(model.working[i][j]) + common.ROUND_EPS * Math.abs(u[i]) + common.ROUND_EPS * Math.abs(v[j]);
    if (!basis[i][j] && reduced[i][j] < -tolerance[i][j] && !entering) entering = { i: i, j: j };
  }
  return { u: u, v: v, reduced: reduced, reducedTolerance: tolerance, entering: entering };
}
function path(model, start, end, allowed) {
  var queue = [start], previous = [], edge = [], head = 0, node, i, j, next;
  previous[start] = start;
  while (head < queue.length && previous[end] === undefined) {
    node = queue[head++];
    for (i = 0; i < (node < model.rows ? model.cols : model.rows); i++) {
      j = node < model.rows ? i : node - model.rows;
      var row = node < model.rows ? node : i;
      next = node < model.rows ? model.rows + j : row;
      if (previous[next] !== undefined || !allowed(row, j, node < model.rows)) continue;
      previous[next] = node; edge[next] = { i: row, j: j }; queue.push(next);
    }
  }
  if (previous[end] === undefined) return null;
  var out = [];
  for (node = end; node !== start; node = previous[node]) out.push(edge[node]);
  return out.reverse();
}
function cycle(model, basis, entering) {
  var p = path(model, model.rows + entering.j, entering.i, function (i, j) { return basis[i][j]; });
  if (!p) return null;
  return [entering].concat(p).map(function (cell, k) { return { i: cell.i, j: cell.j, sign: k % 2 ? -1 : 1 }; });
}
function adjustment(x, loop, cols) {
  var theta = Infinity, leaving = null;
  loop.forEach(function (cell) {
    if (cell.sign < 0) {
      var value = x[cell.i][cell.j];
      if (value < theta || (value === theta && cell.i * cols + cell.j < leaving.i * cols + leaving.j)) {
        theta = value; leaving = { i: cell.i, j: cell.j };
      }
    }
  });
  return { theta: theta, leaving: leaving };
}
function apply(x, loop, theta) { loop.forEach(function (cell) { x[cell.i][cell.j] += cell.sign * theta; }); }
function signature(basis) { return basis.map(function (row) { return row.map(function (v) { return v ? '1' : '0'; }).join(''); }).join('/'); }
function optimize(model, state, emit, maxIterations) {
  var x = state.allocation, basis = state.basis, seen = {}, iteration = 0;
  while (true) {
    var key = signature(basis);
    if (seen[key]) return { status: 'cycling', message: '基重复，已停止以防数值循环；当前为可行方案，不保证最优。', iterations: iteration };
    seen[key] = true;
    var p = potentials(model, basis);
    if (!p.u.concat(p.v).every(function (v) { return typeof v === 'number' && isFinite(v); })
        || !p.reduced.every(function (row) { return row.every(function (v) { return isFinite(v); }); })) {
      return { status: 'numerical-error', message: '位势或检验数溢出，请缩小费用单位；不能确认最优。', iterations: iteration };
    }
    emit('potentials', x, basis, p);
    if (!p.entering) return { status: 'optimal', iterations: iteration, potentials: p };
    if (iteration >= maxIterations) return { status: 'iteration-limit', iterations: iteration, message: '达到迭代上限；当前为可行方案，不保证最优。' };
    var loop = cycle(model, basis, p.entering);
    if (!loop) return { status: 'numerical-error', message: '未找到合法闭回路，不能确认最优。', iterations: iteration };
    var change = adjustment(x, loop, model.cols), before = common.total(x, model.cost);
    var workingBefore = common.total(x, model.working);
    var beforeAllocation = common.copy(x), beforeBasis = common.copy(basis);
    apply(x, loop, change.theta);
    basis[p.entering.i][p.entering.j] = true;
    basis[change.leaving.i][change.leaving.j] = false;
    var check = common.inspect(model, x, basis, false), workingAfter = common.total(x, model.working);
    var after = common.total(x, model.cost), predicted = change.theta * p.reduced[p.entering.i][p.entering.j];
    var tol = Math.max(Math.abs(workingBefore), Math.abs(workingAfter), model.total * model.costScale) * 1e-9;
    if (!check.valid || workingAfter - workingBefore > tol || Math.abs(workingAfter - workingBefore - predicted) > tol) {
      /* 留下上一轮可行解，绝不把坏基或数值异常包装成最优。 */
      state.allocation = beforeAllocation; state.basis = beforeBasis;
      return { status: 'numerical-error', message: '运量、基或目标变化未通过数值校验；保留上一轮可行方案，不保证最优。', iterations: iteration };
    }
    iteration++;
    emit('pivot', x, basis, { iteration: iteration, entering: p.entering, leaving: change.leaving,
      cycle: loop, theta: change.theta, beforeAllocation: beforeAllocation,
      objectiveBefore: before, objectiveAfter: after, delta: after - before,
      workingDelta: workingAfter - workingBefore, reducedEntering: p.reduced[p.entering.i][p.entering.j] });
  }
}
function alternative(model, x, basis, p) {
  /* 单个零检验数可能只允许 θ=0。用零检验数残量网络寻找可正量调整的回路，
     穿过多个退化基也能发现不同最优运输方案，且不枚举指数多个基。 */
  var i, j;
  for (i = 0; i < model.rows; i++) for (j = 0; j < model.cols; j++) if (model.allowed[i][j] && !basis[i][j] && Math.abs(p.reduced[i][j]) <= p.reducedTolerance[i][j]) {
    var row = i, col = j;
    var route = path(model, model.rows + j, i, function (a, b, forward) {
      if (!model.allowed[a][b] || (a === row && b === col)) return false;
      return forward ? Math.abs(p.reduced[a][b]) <= p.reducedTolerance[a][b] : x[a][b] > 0;
    });
    if (!route) continue;
    var loop = [{ i: i, j: j }].concat(route).map(function (cell, k) { return { i: cell.i, j: cell.j, sign: k % 2 ? -1 : 1 }; });
    var change = adjustment(x, loop, model.cols), other = common.copy(x);
    apply(other, loop, change.theta);
    return { allocation: other, cycle: loop, theta: change.theta, objective: common.total(other, model.cost) };
  }
  return null;
}
module.exports = { potentials: potentials, cycle: cycle, optimize: optimize, alternative: alternative };
