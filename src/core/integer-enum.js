'use strict';
var nearZero = require('./util.js').nearZero;
var shared = require('./integer-common.js');
var ipAllBinary = shared.ipAllBinary;
/* =========================================================================
   4. 隐枚举法（0-1 规划）
   -------------------------------------------------------------------------
   先把 0-1 问题化成「max + 各约束 ≤ + 目标系数全非负」的标准形式
   （目标系数为负的变量做 x_j = 1 − y_j 替换），于是目标值随任一变量由 0 变 1
   单调不减。然后按 2^n 枚举，但用一个「过滤条件」把绝大多数点提前挡掉：
   只有目标值比当前最好的解还好的点，才值得逐个约束去检查。

   适用范围：所有变量都是 0-1。
   ========================================================================= */
function ipImplicitEnum(problem, opts) {
  opts = opts || {};
  var LIMIT = opts.limit || 65536;              // 2^16

  if (!ipAllBinary(problem)) {
    return { key: 'enum', name: '隐枚举法', applicable: false,
             reason: '隐枚举法是按「每个变量非 0 即 1」逐点枚举的，'
                   + '所以要求所有变量都是 0-1 变量。当前有连续变量或一般整数变量。' };
  }
  var n = problem.c.length;
  if (n < 1) {
    return { key: 'enum', name: '隐枚举法', applicable: false, reason: '还没有变量。' };
  }

  /* ---- ① 化成标准形式：max，目标系数 ≥ 0 ---- */
  var isMax = problem.direction === 'max';
  var c = problem.c.map(function (v) { return isMax ? v : -v; });
  var cons = problem.constraints.map(function (k) {
    return { coef: k.coef.slice(), rel: k.rel, rhs: k.rhs };
  });

  var flipped = [];                             // 做过 x_j = 1 − y_j 替换的变量
  var offset = 0;
  for (var j = 0; j < n; j++) {
    if (c[j] < -1e-12) {
      flipped.push(j);
      offset += c[j];                           // c_j·x_j = c_j − c_j·y_j
      cons.forEach(function (k) { k.rhs -= k.coef[j]; k.coef[j] = -k.coef[j]; });
      c[j] = -c[j];
    }
  }

  /* 每个点：y → 原来的 x */
  function toX(y) {
    var x = y.slice();
    flipped.forEach(function (j) { x[j] = 1 - y[j]; });
    return x;
  }

  /* ---- ② 按 2^n 枚举，过滤条件 + 逐约束检查 ---- */
  var total = Math.pow(2, n);
  if (total > LIMIT) {
    return { key: 'enum', name: '隐枚举法', applicable: true, tooBig: true,
             n: n, total: total, limit: LIMIT,
             reason: '变量有 ' + n + ' 个，要枚举 2^' + n + ' = ' + total
                   + ' 个点，输出会非常长（也可能卡顿）。' };
  }

  var rowsOut = [];
  var best = null, bestZ = null, bestY = null;
  var nowBest = null;

  for (var t = 0; t < total; t++) {
    var y = [];
    for (var b = n - 1; b >= 0; b--) y.push((t >> b) & 1);
    var zNorm = offset;
    for (var j2 = 0; j2 < n; j2++) zNorm += c[j2] * y[j2];
    var x = toX(y);

    /* 表里要显示的是**原题口径**的目标值；内部比较用的 zNorm 是「化成求最大之后」的值。
       求最小的问题 zNorm = −z(原题)，两者差一个负号 —— 显示时务必用 z(原题)，
       否则用户看到的数字跟自己的题目对不上。 */
    var zOrig = isMax ? zNorm : -zNorm;
    var row = { idx: t + 1, y: y.slice(), x: x, z: zOrig, zStd: zNorm,
                passFilter: null, checks: [], verdict: '' };

    /* 过滤条件：在**标准形**里这个点的目标值是否比目前最好的还好。
       ★ 标准形一定是在求最大 —— 求最小的问题在开头已经整体取过负了，
       所以这里恒用「大于」，绝不能再按原题方向去比。
       （曾经写成 isMax ? zNorm > best : zNorm < best，于是变成一路挑 zNorm 最小的点，
         把真正的最优解漏掉了：min 问题报出来的最优值是错的。） */
    if (nowBest === null || zNorm > nowBest + 1e-9) {
      row.passFilter = true;
      var ok = true;
      for (var i = 0; i < cons.length; i++) {
        var k = cons[i], lhs = 0;
        for (var j3 = 0; j3 < n; j3++) lhs += k.coef[j3] * y[j3];
        var sat = (k.rel === '<=') ? (lhs <= k.rhs + 1e-9)
                : (k.rel === '>=') ? (lhs >= k.rhs - 1e-9)
                : nearZero(lhs - k.rhs);
        row.checks.push({ i: i, lhs: lhs, rrel: k.rel, rhs: k.rhs, sat: sat });
        if (!sat) { ok = false; break; }         // 一票否决，后面的约束不必再看
      }
      if (ok) {
        row.verdict = '全满足，是可行解';
        if (bestZ === null || zNorm > bestZ + 1e-9) {
          bestZ = zNorm; best = x.slice(); bestY = y.slice(); nowBest = zNorm;
          row.verdict = '全满足 → 目前最好，更新过滤条件';
        }
      } else {
        row.verdict = '有约束不满足，舍弃';
      }
    } else {
      row.passFilter = false;
      row.verdict = '不满足过滤条件，后面的约束不必再看';
    }
    rowsOut.push(row);
  }

  var zOut = null;
  if (bestZ !== null) zOut = isMax ? bestZ : -bestZ;
  return {
    key: 'enum', name: '隐枚举法', applicable: true,
    sense: problem.direction, n: n, total: total,
    c: c, offset: offset, flipped: flipped, cons: cons,
    rows: rowsOut, best: best, bestY: bestY, bestZ: zOut,
    enumCount: rowsOut.length,
    filteredOut: rowsOut.filter(function (r) { return r.passFilter === false; }).length
  };
}


module.exports = {
  ipImplicitEnum: ipImplicitEnum
};
