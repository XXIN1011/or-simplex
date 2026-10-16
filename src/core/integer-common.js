/* 整数规划共用的类型、界、松弛与容差工具。 */
'use strict';

/* 依赖：求解内核 + 公共工具 + 格式化（显式 require，浏览器端由打包器提供 require）。
   本文件不再自带求解内核的任何一份拷贝：松弛问题、分枝结点问题都走 simplexSolve，
   割平面的对偶单纯形迭代里枢轴变换也走共享内核的 pivot。 */
var _core = require('./simplex.js');
var _util = require('./util.js');
/* 求解内核 simplex.js：求解入口 + 枢轴变换 */
var simplexSolve = _core.simplexSolve;
var pivot = _core.pivot;
/* 公共工具 util.js / format.js：容差判定 + 数字格式化 */
var nearZero = _util.nearZero, pIsZero = _util.pIsZero;

var IP_EPS = 1e-6;

/* ---------------- 小工具 ---------------- */

/* 是不是整数（带容差：单纯形法算久了会有 2.9999999 这种尾巴） */
function ipIsInt(v) { return Math.abs(v - Math.round(v)) < IP_EPS; }
function ipRound(v) { return ipIsInt(v) ? Math.round(v) : v; }

/* 小数部分。注意先「吸附」到整数 —— 否则 2.9999999 会算出 0.9999999 这种假小数，
   由它推出来的割平面就是一整条错的行。 */
function ipFrac(v) {
  var r = Math.round(v);
  if (Math.abs(v - r) < 1e-7) return 0;
  var f = v - Math.floor(v);
  if (f > 1 - 1e-7) return 0;
  return f;
}

/* 找出所有要求取整的变量下标 */
function ipIntVars(problem) {
  var out = [];
  if (!problem.vtypes) return out;
  for (var j = 0; j < problem.vtypes.length; j++) {
    if (problem.vtypes[j] === 'int' || problem.vtypes[j] === 'bin') out.push(j);
  }
  return out;
}
function ipIsPureInteger(problem) {
  if (!problem.vtypes || !problem.vtypes.length) return false;
  for (var j = 0; j < problem.vtypes.length; j++) if (problem.vtypes[j] === 'cont') return false;
  return true;
}
function ipAllBinary(problem) {
  if (!problem.vtypes || !problem.vtypes.length) return false;
  for (var j = 0; j < problem.vtypes.length; j++) if (problem.vtypes[j] !== 'bin') return false;
  return true;
}

/* 追加若干「单变量界」约束（系数只有第 j 位是 1）。0-1 的 x ≤ 1 与分枝定界的
   每步上下界是同一件事，只写这一份，不再两处各拼一遍系数行。 */
function ipAppendBinds(p, bounds) {
  bounds.forEach(function (b) {
    var coef = [];
    for (var j = 0; j < p.c.length; j++) coef.push(j === b.j ? 1 : 0);
    p.constraints.push({ coef: coef, rel: b.rel, rhs: b.val });
  });
  return p;
}

/* 0-1 变量本身自带 0 ≤ x ≤ 1 的界，而单纯形法只知道 x ≥ 0。
   不把上界显式加进去，松弛问题就会给出 x_j = 2 这种「是整数但不是 0-1」的解，
   分枝定界还会把它当成合法整数解收下 —— 结果比真正的最优解还大。 */
function ipWithVarBounds(problem) {
  var p = {
    direction: problem.direction,
    c: problem.c.slice(),
    constraints: problem.constraints.map(function (k) {
      return { coef: k.coef.slice(), rel: k.rel, rhs: k.rhs };
    })
  };
  var binBounds = [];
  for (var j = 0; j < problem.c.length; j++) {
    if (problem.vtypes && problem.vtypes[j] === 'bin') binBounds.push({ j: j, rel: '<=', val: 1 });
  }
  return ipAppendBinds(p, binBounds);
}
/* 有没有 0-1 变量（用来决定要不要在输出里说明「已补上 x ≤ 1」） */
function ipHasBinary(problem) {
  if (!problem.vtypes) return false;
  for (var j = 0; j < problem.vtypes.length; j++) if (problem.vtypes[j] === 'bin') return true;
  return false;
}

/* 复制问题并追加若干上下界约束（分枝定界每走一步都要做这件事） */
function ipWithBounds(problem, bounds) {
  return ipAppendBinds(ipWithVarBounds(problem), bounds);   // 先补上 0-1 的 x ≤ 1
}

/* 解向量与目标值一律直接取共享内核的 SolveResult：
   solution 已经是「决策变量」口径，objective 对 max / min 都已还原过，
   这里不再各包一层同名函数。 */

/* =========================================================================
   1. 松弛问题：把整数限制去掉，得到普通线性规划
   ========================================================================= */
function ipRelaxation(problem) {
  return simplexSolve(ipWithVarBounds(problem));
}

/* 松弛问题的最优解是否已经满足所有整数要求 */
function ipRelaxIsIntegral(problem, res) {
  var idx = ipIntVars(problem);
  for (var i = 0; i < idx.length; i++) {
    var j = idx[i], v = res.solution[j];
    if (!ipIsInt(v)) return false;
    /* 0-1 变量不仅要是整数，还必须落在 {0,1} 里 */
    if (problem.vtypes[j] === 'bin' && v !== 0 && v !== 1) return false;
  }
  return true;
}


module.exports = {
  IP_EPS: IP_EPS,
  ipIsInt: ipIsInt,
  ipRound: ipRound,
  ipFrac: ipFrac,
  ipIntVars: ipIntVars,
  ipIsPureInteger: ipIsPureInteger,
  ipAllBinary: ipAllBinary,
  ipAppendBinds: ipAppendBinds,
  ipWithVarBounds: ipWithVarBounds,
  ipHasBinary: ipHasBinary,
  ipWithBounds: ipWithBounds,
  ipRelaxation: ipRelaxation,
  ipRelaxIsIntegral: ipRelaxIsIntegral
};
