/* 运输问题统一 API：最小元素初始解 → MODI + 闭回路；结构化快照可用于 CLI / UI。 */
'use strict';
var common = require('./transport-model.js');
var initial = require('./transport-initial.js').initial;
var modi = require('./transport-modi.js');
function transportSolve(problem, options) {
  var model = common.normalize(problem);
  if (!model.ok) return model;
  var opts = options || {}, max = opts.maxIterations === undefined ? 1000 : opts.maxIterations;
  if (typeof max !== 'number' || !isFinite(max) || max < 0 || Math.floor(max) !== max || max > 10000) return { ok: false, message: 'maxIterations 须为 0–10000 的整数' };
  var steps = [];
  function emit(type, x, basis, extra) {
    var step = { type: type, allocation: common.copy(x), basis: common.copy(basis),
      objective: common.total(x, model.cost), workingObjective: common.total(x, model.working),
      invariant: common.inspect(model, x, basis, type === 'allocation') };
    Object.keys(extra || {}).forEach(function (key) { step[key] = extra[key]; });
    steps.push(step);
  }
  var state = initial(model, emit), first = steps[steps.length - 1];
  if (state.status === 'infeasible') return { ok: true, status: 'infeasible', feasible: false,
    message: '禁运限制下无可行运输方案：可运路线无法满足全部供需。供需总量平衡并不保证路线可达。',
    model: model, steps: steps, feasibility: state.feasibility, objective: null, allocation: null, basis: null,
    iterations: 0, multipleOptimal: false, alternative: null };
  var result = first.invariant.valid ? modi.optimize(model, state, emit, max)
    : { status: 'numerical-error', iterations: 0, message: '初始方案未通过守恒或基校验，不能确认最优。请调整数值单位。' };
  result.ok = true; result.model = model; result.steps = steps;
  result.initial = { allocation: common.copy(first.allocation), basis: common.copy(first.basis), objective: first.objective };
  result.allocation = common.copy(state.allocation); result.basis = common.copy(state.basis);
  result.feasible = common.inspect(model, result.allocation, result.basis, false).valid;
  result.objective = common.total(result.allocation, model.cost);
  result.workingObjective = common.total(result.allocation, model.working);
  result.realObjective = common.total(result.allocation.slice(0, model.m).map(function (r) { return r.slice(0, model.n); }), model.original);
  result.surplus = model.virtual && model.virtual.type === 'surplus' ? result.allocation.map(function (r) { return r[model.n]; }) : null;
  result.shortage = model.virtual && model.virtual.type === 'shortage' ? result.allocation[model.m].slice() : null;
  /* 分开累计虚拟费用，避免用两个巨大目标相减时丢失较小罚金。 */
  result.penalty = model.virtual ? common.sum((result.surplus || result.shortage).map(function (amount, k) { return amount * model.virtual.fees[k]; })) : 0;
  result.alternative = result.status === 'optimal' ? modi.alternative(model, result.allocation, result.basis, result.potentials) : null;
  result.multipleOptimal = !!result.alternative;
  return result;
}
module.exports = { transportSolve: transportSolve, validate: common.normalize, inspect: common.inspect,
  balance: common.balance, isForbidden: common.isForbidden };
