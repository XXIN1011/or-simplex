/* 运输模型校验、平衡化与共同数值工具；不读写 DOM / IO。 */
'use strict';
var parseNumber = require('./number-input.js').parseNumber;
var EPS = 1e-10;
var ROUND_EPS = 32 * 2.220446049250313e-16;
/* 禁运标记：教学口径用 M —— 大 M 表示这条线路的费用/收益无穷大，实际不能运输。
   旧的 X / × /「禁运」继续识别，保证旧草稿、旧历史、外部 JSON 和对拍脚本仍读得懂；
   新输入一律提示填 M。 */
function isForbidden(v) { return typeof v === 'string' && /^(m|x|×|禁运)$/i.test(v.trim()); }
function matrix(m, n, value) {
  var a = [], i, j;
  for (i = 0; i < m; i++) { a[i] = []; for (j = 0; j < n; j++) a[i][j] = value; }
  return a;
}
function copy(a) { return a.map(function (r) { return r.slice(); }); }
function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
function total(x, c) {
  var z = 0, i, j;
  for (i = 0; i < x.length; i++) for (j = 0; j < x[i].length; j++) z += x[i][j] * c[i][j];
  return z;
}
function balance(p) {
  if (!p || !Array.isArray(p.supply) || !p.supply.length || !Array.isArray(p.demand) || !p.demand.length) return { ok: false };
  var s = p.supply.map(function (v) { return parseNumber(v, false); });
  var d = p.demand.map(function (v) { return parseNumber(v, false); });
  if (!s.concat(d).every(function (v) { return isFinite(v) && v >= 0; })) return { ok: false };
  var a = sum(s), b = sum(d), diff = a - b;
  if (!isFinite(a) || !isFinite(b)) return { ok: false };
  return { ok: true, supplyTotal: a, demandTotal: b, difference: Math.abs(diff) <= Math.max(a, b) * 1e-12 ? 0 : diff };
}
function forest(m, n) {
  var p = [], i;
  for (i = 0; i < m + n; i++) p[i] = i;
  function root(a) { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; }
  return { join: function (i, j) {
    var a = root(i), b = root(m + j);
    if (a === b) return false;
    p[a] = b; return true;
  } };
}
function normalize(problem) {
  var p = problem || {}, errors = [], i, j;
  if (p.direction !== 'min' && p.direction !== 'max') errors.push('目标方向必须为 min 或 max');
  if (!Array.isArray(p.supply) || !p.supply.length || p.supply.length > 20
      || !Array.isArray(p.demand) || !p.demand.length || p.demand.length > 20) {
    return { ok: false, message: '请设置 1–20 个产地与销地' };
  }
  var m = p.supply.length, n = p.demand.length;
  function vector(a, label) {
    var out = [], k;
    for (k = 0; k < a.length; k++) {
      var x = parseNumber(a[k], false);
      if (!isFinite(x) || x < 0) errors.push(label + (k + 1) + '须为非负有限数字或分数');
      out.push(x);
    }
    return out;
  }
  var supply = vector(p.supply, '供应量'), demand = vector(p.demand, '需求量');
  var cost = matrix(m, n, 0), allowed = matrix(m, n, true), forbiddenCount = 0;
  if (!Array.isArray(p.cost) || p.cost.length !== m) errors.push('费用矩阵行数须等于供应量个数');
  else for (i = 0; i < m; i++) {
    if (!Array.isArray(p.cost[i]) || p.cost[i].length !== n) { errors.push('费用矩阵必须为完整矩形'); continue; }
    for (j = 0; j < n; j++) {
      var raw = p.cost[i][j], blocked = isForbidden(raw);
      allowed[i][j] = !blocked;
      if (blocked) forbiddenCount++;
      cost[i][j] = blocked ? 0 : parseNumber(raw, false);
      if (!isFinite(cost[i][j])) errors.push('产地' + (i + 1) + '至销地' + (j + 1) + '的费用或收益无效（禁运请填 M）');
    }
  }
  function fees(v, count, name) {
    var a = Array.isArray(v) ? v : Array(count).join(',').split(',').map(function () { return v === undefined ? 0 : v; });
    if (a.length !== count) { errors.push(name + '个数不符'); return []; }
    return vector(a, name);
  }
  var surplus = fees(p.surplusCost, m, '剩余处理费'), shortage = fees(p.shortageCost, n, '缺货罚金');
  if (errors.length) return { ok: false, message: errors.join('；') };
  var a = sum(supply), b = sum(demand), scale = Math.max(a, b);
  if (!isFinite(scale)) return { ok: false, message: '供需合计溢出，请缩小数值单位' };
  var originalSupply = supply.slice(), originalDemand = demand.slice();
  var original = copy(cost), difference = a - b, adjustment = 0, virtual = null;
  /* 只吸收求和舍入误差；校正可见并保留原始供需，不能凭容差吞掉真实小规模题目。 */
  if (difference !== 0 && Math.abs(difference) <= scale * 1e-12) {
    var k = demand.indexOf(Math.max.apply(null, demand));
    demand[k] += difference; adjustment = difference; difference = 0;
  }
  if (difference > 0) {
    virtual = { type: 'surplus', index: n, amount: difference, fees: surplus.slice() };
    demand.push(difference);
    for (i = 0; i < m; i++) { cost[i].push(p.direction === 'max' ? -surplus[i] : surplus[i]); allowed[i].push(true); }
  } else if (difference < 0) {
    virtual = { type: 'shortage', index: m, amount: -difference, fees: shortage.slice() };
    supply.push(-difference);
    cost.push(shortage.map(function (v) { return p.direction === 'max' ? -v : v; }));
    allowed.push(demand.map(function () { return true; }));
  }
  /* 每个可运连通分量各用一棵基树；孤立的零供需结点也计为分量。 */
  var f = forest(supply.length, demand.length), rank = 0;
  for (i = 0; i < supply.length; i++) for (j = 0; j < demand.length; j++) if (allowed[i][j] && f.join(i, j)) rank++;
  /* 最大收益转最小费用：平衡后所有可运格统一用最大收益 R 减去本格收益。
     虚拟格收益为负罚金，也参与转换；禁运格没有数值收益，不参与取最大值。
     完整方案总运量固定，因此原目标 z = R * total - workingObjective。 */
  var maxReward = 0;
  if (p.direction === 'max') {
    maxReward = -Infinity;
    for (i = 0; i < supply.length; i++) for (j = 0; j < demand.length; j++) {
      if (allowed[i][j]) maxReward = Math.max(maxReward, cost[i][j]);
    }
    if (maxReward === -Infinity || maxReward === 0) maxReward = 0;
  }
  var working = cost.map(function (row, rowIndex) { return row.map(function (v, colIndex) {
    return p.direction === 'max' && allowed[rowIndex][colIndex] ? maxReward - v : v;
  }); });
  if (!working.every(function (row) { return row.every(function (v) { return isFinite(v); }); })) {
    return { ok: false, message: '最大收益转换费用溢出，请缩小收益或罚金单位' };
  }
  var costScale = 0;
  working.forEach(function (row) { row.forEach(function (v) { costScale = Math.max(costScale, Math.abs(v)); }); });
  return { ok: true, direction: p.direction, m: m, n: n, rows: supply.length, cols: demand.length,
    original: original, originalSupply: originalSupply, originalDemand: originalDemand,
    supply: supply, demand: demand, originalSupplyTotal: a, originalDemandTotal: b,
    cost: cost, working: working, maxReward: maxReward, allowed: allowed, forbiddenCount: forbiddenCount,
    basisSize: rank, components: supply.length + demand.length - rank,
    virtual: virtual, balanceAdjustment: adjustment,
    quantityTolerance: (scale || 1) * EPS, costTolerance: (costScale || 1) * ROUND_EPS * (supply.length + demand.length),
    costScale: costScale || 1, total: sum(supply) };
}
function inspect(model, x, basis, partial) {
  var errors = [], f = forest(model.rows, model.cols), count = 0, i, j;
  var rows = matrix(1, model.rows, 0)[0], cols = matrix(1, model.cols, 0)[0];
  for (i = 0; i < model.rows; i++) for (j = 0; j < model.cols; j++) {
    var v = x[i][j];
    if (!isFinite(v) || v < 0) errors.push('运量非负性');
    if (v > 0 && !basis[i][j]) errors.push('正运量必须在基中');
    if (!model.allowed[i][j] && (v !== 0 || basis[i][j])) errors.push('禁运格不能运输或入基');
    rows[i] += v; cols[j] += v;
    if (basis[i][j]) { count++; if (!f.join(i, j)) errors.push('基中有回路'); }
  }
  if (!partial && count !== model.basisSize) errors.push('基变量数不是 m+n−分量数');
  rows.forEach(function (v, k) {
    if (partial ? v - model.supply[k] > model.quantityTolerance : Math.abs(v - model.supply[k]) > model.quantityTolerance) errors.push('供应不守恒');
  });
  cols.forEach(function (v, k) {
    if (partial ? v - model.demand[k] > model.quantityTolerance : Math.abs(v - model.demand[k]) > model.quantityTolerance) errors.push('需求不守恒');
  });
  if (!isFinite(total(x, model.working))) errors.push('目标值溢出');
  return { valid: !errors.length, errors: errors, basisCount: count, rowTotals: rows, colTotals: cols };
}
module.exports = { normalize: normalize, matrix: matrix, copy: copy, sum: sum, total: total,
  forest: forest, inspect: inspect, balance: balance, isForbidden: isForbidden, EPS: EPS, ROUND_EPS: ROUND_EPS };
