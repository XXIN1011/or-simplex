/* 整数规划公开入口；各方法的实现按职责拆分，导出接口保持兼容。 */
'use strict';
var validate = require('./parse.js').validate;
var parseNumber = require('./number-input.js').parseNumber;
var shared = require('./integer-common.js');
var ipIsInt = shared.ipIsInt;
var ipFrac = shared.ipFrac;
var ipIntVars = shared.ipIntVars;
var ipIsPureInteger = shared.ipIsPureInteger;
var ipAllBinary = shared.ipAllBinary;
var ipWithVarBounds = shared.ipWithVarBounds;
var ipHasBinary = shared.ipHasBinary;
var ipWithBounds = shared.ipWithBounds;
var ipRelaxation = shared.ipRelaxation;
var ipRelaxIsIntegral = shared.ipRelaxIsIntegral;
var ipBranchBound = require('./integer-branch.js').ipBranchBound;
var ipCuttingPlane = require('./integer-cut.js').ipCuttingPlane;
var ipImplicitEnum = require('./integer-enum.js').ipImplicitEnum;
/* =========================================================================
   5. 总入口：把四种方法的适用性和结果一次性算出来
   -------------------------------------------------------------------------
   返回 methods 数组，每项都带 applicable / reason。界面据此决定输出哪些：
     · 全部适用且规模不大 → 全部输出
     · 某个方法规模过大     → 提示用户按解法挑选
   ========================================================================= */
function ipSolve(problem, opts) {
  opts = opts || {};
  var validation = validate(problem);
  if (!validation.ok) return validation;
  /* 各整数算法要读原题做运算，必须复用校验后的数值，不能只规范化松弛表。 */
  problem = {
    direction: validation.direction, c: validation.c0,
    constraints: problem.constraints.map(function (k) {
      return { coef: k.coef.map(function (v) { return parseNumber(v); }), rel: k.rel, rhs: parseNumber(k.rhs) };
    }),
    vtypes: problem.vtypes
  };
  var n = problem.c.length;
  var intIdx = ipIntVars(problem);

  var relax = ipRelaxation(problem);

  /* 图解法：只有两个决策变量时才能画在平面上 */
  var graph = {
    key: 'graph', name: '图解法',
    applicable: (n === 2 && intIdx.length > 0)
  };
  if (n !== 2) {
    graph.reason = '图解法要把可行域画在平面直角坐标系上，所以只适用于**两个**决策变量的题；'
      + '本题有 ' + n + ' 个变量。';
  } else if (!intIdx.length) {
    graph.reason = '没有整数变量，这是普通线性规划，图解法请到单纯形法模块看。';
  }

  /* 只有松弛不可行才能推出整数不可行。无界/未收敛时，本实现无法判定整数结论。 */
  if (relax.status !== 'optimal') {
    var status = relax.status === 'infeasible' ? 'infeasible' : 'undetermined';
    var message = relax.status === 'infeasible'
      ? '松弛问题无可行解，原整数规划也无可行解。'
      : relax.status === 'unbounded'
        ? '松弛问题无界，但尚未确定整数可行性，不能据此判定原整数规划无界。本实现需要松弛最优解才能继续，整数问题结论未确定。'
        : '松弛问题达到迭代上限，尚未得到最优解；整数问题结论未确定。';
    return {
      ok: true, status: status, message: message,
      relax: relax, relaxIntegral: false, noOptimum: true,
      methods: [
        { key: 'graph', name: '图解法', applicable: false,
          reason: message },
        { key: 'bnb', name: '分枝定界法', applicable: false,
          reason: message },
        { key: 'cut', name: '割平面法', applicable: false, reason: message },
        { key: 'enum', name: '隐枚举法', applicable: false, reason: message }
      ]
    };
  }

  var relaxIntegral = ipRelaxIsIntegral(problem, relax);

  var bnb = ipBranchBound(problem, opts);
  var cut = ipCuttingPlane(problem, opts);
  var en = ipImplicitEnum(problem, opts);
  graph.result = (n === 2 && intIdx.length > 0) ? { relax: relax } : null;

  return {
    ok: true, relax: relax, relaxIntegral: relaxIntegral, noOptimum: false,
    intIdx: intIdx, nDecision: n,
    methods: [graph, bnb, cut, en]
  };
}

module.exports = {
  ipSolve: ipSolve,
  ipBranchBound: ipBranchBound,
  ipCuttingPlane: ipCuttingPlane,
  ipImplicitEnum: ipImplicitEnum,
  ipRelaxation: ipRelaxation,
  ipWithVarBounds: ipWithVarBounds,
  ipHasBinary: ipHasBinary,
  ipIsInt: ipIsInt, ipFrac: ipFrac, ipIntVars: ipIntVars,
  ipIsPureInteger: ipIsPureInteger, ipAllBinary: ipAllBinary,
  ipWithBounds: ipWithBounds
};
