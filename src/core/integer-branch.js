'use strict';
var simplexSolve = require('./simplex.js').simplexSolve;
var fmtNum = require('./format.js').fmtNum;
var shared = require('./integer-common.js');
var ipIsInt = shared.ipIsInt;
var ipFrac = shared.ipFrac;
var ipIntVars = shared.ipIntVars;
var ipWithBounds = shared.ipWithBounds;
var ipRelaxation = shared.ipRelaxation;
/* =========================================================================
   2. 分支定界法
   -------------------------------------------------------------------------
   反复做一件事：解一个线性规划松弛，如果最优解里还有非整数变量，就挑一个
   把它「劈」成两支（x_j ≤ ⌊v⌋ 与 x_j ≥ ⌈v⌉），分别再解。过程中用当前最好的
   整数解当作「界」，凡是松弛最优值已经不如它的分支直接剪掉。

   输出：每个结点的松弛问题解、它的界、以及「为什么继续分 / 为什么剪掉」。
   ========================================================================= */
function ipBranchBound(problem, opts) {
  opts = opts || {};
  /* 结点上限是防卡顿用的防线，但它一旦触发，**结论就不再是「最优」而只是「目前最好」**，
     所以必须把完成度一并报出去，不能让界面照旧写「最优解」。 */
  var MAXNODES = opts.maxNodes || 300;
  var sense = problem.direction === 'max' ? 'max' : 'min';
  var better = (sense === 'max')
    ? function (a, b) { return a > b + 1e-9; }
    : function (a, b) { return a < b - 1e-9; };
  var notWorse = (sense === 'max')
    ? function (a, b) { return a >= b - 1e-9; }
    : function (a, b) { return a <= b + 1e-9; };

  var intIdx = ipIntVars(problem);
  if (!intIdx.length) {
    return { key: 'bnb', name: '分枝定界法', applicable: false,
             reason: '没有整数变量，这是普通线性规划，用单纯形法模块求解即可。' };
  }

  var root = ipRelaxation(problem);
  if (root.status !== 'optimal') {
    return { key: 'bnb', name: '分枝定界法', applicable: false,
             reason: '松弛问题' + (root.status === 'infeasible' ? '无可行解' : '无界'),
             relax: root };
  }

  var nodes = [], trace = [];
  var id = 0, best = null, bestZ = null, bestNode = null;
  var stack = [{ id: ++id, parent: null, depth: 0, bounds: [] }];
  var truncated = false;

  while (stack.length) {
    if (nodes.length >= MAXNODES) { truncated = true; break; }
    var node = stack.pop();                       // 后进先出 = 深度优先
    var lp = ipWithBounds(problem, node.bounds);
    var res = simplexSolve(lp);
    node.lp = lp;
    node.res = res;
    node.solution = res.status === 'optimal' ? res.solution.slice() : null;
    node.objective = res.status === 'optimal' ? res.objective : null;
    node.relaxForView = { vars: res.vars, mConstraints: res.mConstraints,
                          nDecision: res.nDecision, steps: res.steps };

    /* ---- 逐条判断该怎么处置这个结点 ---- */
    if (res.status === 'infeasible') {
      node.action = 'prune';
      node.actionName = '剪枝（无可行解）';
      node.note = '加上这些限制之后问题没有可行解，这条分支走不下去，剪掉。';
      nodes.push(node);
      continue;
    }
    if (res.status !== 'optimal') {
      node.action = 'prune';
      node.actionName = '剪枝（无界）';
      node.note = '松弛问题无界，按题意无法继续定界，剪掉。';
      nodes.push(node);
      continue;
    }

    var allInt = true, fracJ = -1, fracV = 0, fracPart = -1;
    for (var q = 0; q < intIdx.length; q++) {
      var jj = intIdx[q], v = res.solution[jj];
      /* 0-1 变量除了要是整数，还得落在 {0,1} 里 —— 否则 x_j = 2 会被误当成可行整数解 */
      var bad = !ipIsInt(v) || (problem.vtypes[jj] === 'bin' && v !== 0 && v !== 1);
      if (bad) {
        allInt = false;
        var f = ipFrac(v);
        if (f > fracPart) { fracPart = f; fracJ = jj; fracV = v; }
      }
    }

    if (allInt) {
      /* 这个结点的松弛解本身就是整数解 → 可以拿它当新的「界」 */
      if (best === null || better(node.objective, bestZ)) {
        best = node.solution.slice(); bestZ = node.objective; bestNode = node.id;
        node.action = 'incumbent';
        node.actionName = '得到整数解，更新界';
        node.note = '松弛问题的最优解已经是整数解，它就是这条分支上最好的解；'
          + '用它把界更新为 ' + fmtNum(bestZ) + '，'
          + '以后凡是松弛最优值不如它的分支都可以剪掉。';
      } else {
        node.action = 'prune';
        node.actionName = '剪枝（不如已有的界）';
        node.note = '虽然也得到整数解，但目标值 ' + fmtNum(node.objective)
          + ' 不如已有的界 ' + fmtNum(bestZ) + '，剪掉。';
      }
      nodes.push(node);
      continue;
    }

    /* 还没得到整数解，先看界能不能剪 */
    if (best !== null && notWorse(bestZ, node.objective)) {
      node.action = 'prune';
      node.actionName = '剪枝（界已不优）';
      node.note = '松弛问题的最优值 ' + fmtNum(node.objective) + ' 已经'
        + (sense === 'max' ? '不超过' : '不低于') + '现有的界 ' + fmtNum(bestZ)
        + '。由于整数限制只会让目标值更差，这条分支上不可能找到更好的整数解，剪掉。';
      nodes.push(node);
      continue;
    }

    /* 需要继续分枝 */
    var lo = Math.floor(fracV), hi = lo + 1;
    node.action = 'branch';
    node.actionName = '分枝';
    node.fracJ = fracJ; node.fracV = fracV;
    node.note = '最优解里 x' + (fracJ + 1) + ' = ' + fmtNum(fracV)
      + ' 不是整数。围绕它把问题劈成两支：'
      + 'x' + (fracJ + 1) + ' ≤ ' + lo + ' 与 x' + (fracJ + 1) + ' ≥ ' + hi
      + '（这样任何整数解都必然落在其中一支里，一支不漏）。';

    /* 先入栈的是「≥ 右支」，后入栈的是「≤ 左支」——后进先出会先处理左支，
       和教材里先走 x_j ≤ ⌊v⌋ 那一支的习惯一致。 */
    var right = { id: ++id, parent: node.id, depth: node.depth + 1,
                  bounds: node.bounds.concat([{ j: fracJ, rel: '>=', val: hi }]) };
    var left = { id: ++id, parent: node.id, depth: node.depth + 1,
                 bounds: node.bounds.concat([{ j: fracJ, rel: '<=', val: lo }]) };
    node.children = [left.id, right.id];
    nodes.push(node);
    stack.push(right);
    stack.push(left);
  }

  /* 剩下的栈里还挂着的结点：因为已经找到界而没被展开——教材里也要交代一句 */
  var openLeft = stack.map(function (s) { return s.id; });
  var complete = !truncated;

  return {
    key: 'bnb', name: '分枝定界法', applicable: true, sense: sense,
    relax: root, nodes: nodes, openLeft: openLeft,
    truncated: truncated, complete: complete,
    maxNodes: MAXNODES,
    best: best, bestZ: bestZ, bestNode: bestNode
  };
}


module.exports = {
  ipBranchBound: ipBranchBound
};
