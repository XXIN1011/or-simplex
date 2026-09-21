/* =========================================================================
   整数规划（教材第 3 章）
   -------------------------------------------------------------------------
   和单纯形法一样，这里做的是「输入任意一道整数规划题 → 输出规范化的完整计算过程」，
   不是把例题的参数写死在程序里。

   问题对象 problem = {
     direction: 'max' | 'min',
     c:         [ … ],
     constraints: [ { coef: [ … ], rel: '<=|>=|=', rhs } ],
     vtypes:    [ 'cont' | 'int' | 'bin' ]     每个变量：连续 / 整数 / 0-1
   }

   四种方法各有各的适用范围，本文件负责三件事：
     ① 各自算出结果（连同**每一步**的中间过程，供界面按教材写法展示）
     ② 判定自己在当前这道题上到底能不能用（不能用就不输出，理由一并给出）
     ③ 规模过大时给出提示，让界面改为「按用户选择的解法输出」

   本文件只留整数规划**独有**的东西：变量整性 / 0-1 判定、四种方法本身、
   适用性判定与理由、规模守卫、界面要的过程数据。
   线性规划的求解与枢轴变换一律复用共享内核 src/core/simplex.js
   （simplexSolve / pivot），容差判定与数字格式化用 src/core/util.js、format.js。
   ========================================================================= */
'use strict';

/* 依赖：求解内核 + 公共工具 + 格式化（显式 require，浏览器端由打包器提供 require）。
   本文件不再自带求解内核的任何一份拷贝：松弛问题、分枝结点问题都走 simplexSolve，
   割平面的对偶单纯形迭代里枢轴变换也走共享内核的 pivot。 */
var _core = require('./simplex.js');
var _util = require('./util.js');
var _fmt = require('./format.js');
/* 求解内核 simplex.js：求解入口 + 枢轴变换 */
var simplexSolve = _core.simplexSolve;
var pivot = _core.pivot;
/* 公共工具 util.js / format.js：容差判定 + 数字格式化 */
var nearZero = _util.nearZero, pIsZero = _util.pIsZero;
var fmtNum = _fmt.fmtNum;

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

/* =========================================================================
   3. 割平面法（Gomory 割）
   -------------------------------------------------------------------------
   在松弛问题的最优表上，从「取值不是整数」的那一行直接读出一条新的约束
   （割平面）加进去，把那个非整数解割掉，再用对偶单纯形法重新求最优。
   反复做，直到最优解全部取整。

   这条割的来历（教材推导）：设第 r 行的基变量 x_Br 取值为分数，把该行写成
        x_Br = b̄_r − Σ_{j∉基} ā_rj x_j
   两边取小数部分。因为 x_Br 与非基变量都要求取整，可以证明
        Σ_{j∉基} f(ā_rj)·x_j ≥ f(b̄_r)        （f(·) 表示取小数部分）
   这就是 Gomory 割：它把当前的分数解排除掉，但任何一个整数可行解都仍然满足它。

   适用范围（教材的标准形式）：全部变量取整、约束全部是 ≤、右端项非负、系数全为整数。
   ========================================================================= */
function ipCuttingPlane(problem, opts) {
  opts = opts || {};
  var MAXCUTS = opts.maxCuts || 40;

  if (!ipIsPureInteger(problem)) {
    return { key: 'cut', name: '割平面法', applicable: false,
             reason: '有变量不要求取整（混合整数规划）。割平面法是由「所有变量都取整」'
                   + '推出割的，混合情形不能直接用，请用分枝定界法。' };
  }
  for (var i = 0; i < problem.constraints.length; i++) {
    var k = problem.constraints[i];
    if (k.rel !== '<=') {
      return { key: 'cut', name: '割平面法', applicable: false,
               reason: '第 ' + (i + 1) + ' 条约束是「' + k.rel + '」。割平面法的教材形式'
                     + '要求全部约束都是 ≤（这样松弛变量本身也是整数，割才成立）。' };
    }
    if (k.rhs < -IP_EPS) {
      return { key: 'cut', name: '割平面法', applicable: false,
               reason: '第 ' + (i + 1) + ' 条约束的右端项是负的，教材形式要求非负。' };
    }
  }
  var allIntData = problem.c.every(function (v) { return ipIsInt(v); })
    && problem.constraints.every(function (k) {
        return ipIsInt(k.rhs) && k.coef.every(function (v) { return ipIsInt(v); });
      });
  if (!allIntData) {
    return { key: 'cut', name: '割平面法', applicable: false,
             reason: '目标系数/技术系数/右端项里有非整数。割平面法要求全部数据为整数，'
                   + '否则「松弛变量也是整数」这一前提不成立，割推不出来。' };
  }

  var root = ipRelaxation(problem);
  if (root.status !== 'optimal') {
    return { key: 'cut', name: '割平面法', applicable: false,
             reason: '松弛问题' + (root.status === 'infeasible' ? '无可行解' : '无界') + '，无法起步。',
             relax: root };
  }

  /* 从松弛问题的最优表接着做。表结构沿用 simplex-core 的那一套：
     rows[i][0..N-1] 是系数，rows[i][N] 是右端项；basis[i] 是第 i 行的基变量。 */
  var vars = root.vars.map(function (v) { return { name: v.name, kind: v.kind }; });
  var N = vars.length;
  var m = root.mConstraints;
  var lastStep = root.steps[root.steps.length - 1];
  var rows = lastStep.rows.map(function (r) { return r.slice(); });
  var obj = lastStep.obj.map(function (o) { return { a: o.a, b: o.b }; });
  var basis = lastStep.basis.slice();

  /* 哪些列是「原始列」（决策变量 + 原始松弛变量）。割只允许从原始列做基的行推出：
     原始松弛变量 = b − Ax，数据与 x 都是整数时它必为整数；
     而割自己引进的剩余变量不保证是整数，从它的行推出来的割并不成立。 */
  var isOrigCol = new Array(N).fill(true);

  /* 表数据打成「标准型」视图，枢轴变换交给共享内核 simplex.js 的 pivot
     （m / N 每加一刀都会变，改完要同步回这里）。 */
  var table = { m: m, N: N, rows: rows, obj: obj, basis: basis };

  /* 割平面的对偶枢轴：消元实现只有共享内核的一份（simplex.js 的 pivot），
     这里只负责保留原实现在数值上的两处容差约定，好让输出逐位不变：
       · 入基变量的检验数落进 1e-9 → 该次枢轴整个 σ 行不动（原实现跳过更新）。
         先把 σ 行存一份，做完再把原样的对象放回去，就与「不动」逐位一致。
       · |a_ie| < 1e-12 的行原实现整行不消元。先把该格置 0（内核看到 f = 0 就不动这行），
         枢轴做完再把原值放回，这一行就与原来一样分毫未动。
     两处都只是 1e-12 以下的毛刺口径，不涉及任何数学推导。 */
  function ipDualPivot(negRow, enter) {
    var sigmaKeep = pIsZero(obj[enter]) ? obj.slice() : null;
    var kept = [];
    for (var ip = 0; ip < m; ip++) {
      var av = Math.abs(rows[ip][enter]);
      if (ip !== negRow && av > 0 && av < 1e-12) { kept.push([ip, rows[ip][enter]]); rows[ip][enter] = 0; }
    }
    pivot(table, negRow, enter);
    if (sigmaKeep) for (var jo = 0; jo <= N; jo++) obj[jo] = sigmaKeep[jo];
    for (var kp = 0; kp < kept.length; kp++) rows[kept[kp][0]][enter] = kept[kp][1];
  }

  var cuts = [];
  var converged = false;

  for (var round = 0; round <= MAXCUTS; round++) {
    /* 找一个「原始列做基、取值又是分数」的行；小数部分最大者优先 */
    var pick = -1, pickFrac = -1;
    for (var r2 = 0; r2 < m; r2++) {
      if (!isOrigCol[basis[r2]]) continue;
      var bv = rows[r2][N];
      if (!ipIsInt(bv) && ipFrac(bv) > pickFrac) { pickFrac = ipFrac(bv); pick = r2; }
    }
    if (pick === -1) { converged = true; break; }

    var bVal = rows[pick][N];
    var fB = ipFrac(bVal);
    var isNeg = (bVal < 0);
    /* 右端项为负时按教材的做法把整行取负后再取小数部分，保证割的方向正确。
       割的写法：Σ f(ā_rj)·x_j ≥ f(b̄_r)，加剩余变量后整行取负 → −Σ f(ā_rj)x_j + s = −f(b̄_r) */
    var cutCoef = [];
    for (var j2 = 0; j2 < N; j2++) {
      var a = isNeg ? -rows[pick][j2] : rows[pick][j2];
      cutCoef[j2] = -ipFrac(a);
    }
    var rhsCut = -(isNeg ? ipFrac(-bVal) : fB);

    /* ---- 加一列（新的剩余变量）与一行（割） ----
       注意：新列必须**插在右端项之前**。图省事用 push 把 0 加到末尾的话，
       右端项就被顶到了「新列」的位置、而新的右端项变成 0 —— 整张表当场废掉。 */
    var newColIdx = N;
    for (var r3 = 0; r3 < m; r3++) rows[r3].splice(N, 0, 0);
    obj.splice(N, 0, { a: 0, b: 0 });
    vars.push({ name: 's' + (vars.length + 1), kind: 's' });
    isOrigCol.push(false);

    var newRow = cutCoef.slice();
    newRow.push(1);                              // 新剩余变量的系数为 1
    newRow.push(rhsCut);
    rows.push(newRow);
    basis.push(newColIdx);
    N = N + 1; m = m + 1;
    table.N = N; table.m = m;                    // 表宽表长都变了，同步给共享内核的视图

    /* ---- 用对偶单纯形法把新表调回可行 ---- */
    var dualSteps = [];
    var guard = 0;
    while (guard++ < 200) {
      var negRow = -1, mostNeg = 0;
      for (var r4 = 0; r4 < m; r4++) {
        if (rows[r4][N] < -1e-9 && rows[r4][N] < mostNeg) { mostNeg = rows[r4][N]; negRow = r4; }
      }
      if (negRow === -1) break;

      /* 入基列：|σ_j ÷ a_rj| 最小者；σ 可能带 M 项，必须先比 M 的系数 */
      var enter = -1, bestKey = null;
      for (var j3 = 0; j3 < N; j3++) {
        if (rows[negRow][j3] >= -1e-9) continue;
        var key = { a: Math.abs(obj[j3].a / rows[negRow][j3]),
                    b: Math.abs(obj[j3].b / rows[negRow][j3]) };
        if (bestKey === null || key.b < bestKey.b - 1e-12 ||
            (Math.abs(key.b - bestKey.b) <= 1e-12 && key.a < bestKey.a - 1e-12)) {
          bestKey = key; enter = j3;
        }
      }
      if (enter === -1) {
        dualSteps.push({ ok: false, note: '出基行里没有负系数，对偶比值算不出来 —— '
          + '这种情况说明问题无可行解。' });
        break;
      }

      var ratioTxt = [];
      for (var j4 = 0; j4 < N; j4++) {
        if (rows[negRow][j4] >= -1e-9) continue;
        ratioTxt.push('σ' + (j4 + 1) + ' ÷ a = ' + fmtNum(obj[j4].a)
          + ' ÷ ' + fmtNum(rows[negRow][j4]));
      }
      dualSteps.push({
        ok: true, negRow: negRow, enter: enter,
        leaveName: vars[basis[negRow]].name, enterName: vars[enter].name,
        rhs: rows[negRow][N], ratios: ratioTxt,
        note: '第 ' + (negRow + 1) + ' 行右端项 ' + fmtNum(rows[negRow][N])
          + ' < 0，原基不再可行；检验数已经全 ≤ 0，所以用对偶单纯形法：'
          + '比值 |σ ÷ a| 最小的是 ' + vars[enter].name + '，让它入基，'
          + vars[basis[negRow]].name + ' 出基。'
      });
      /* 枢轴变换调共享内核 simplex.js 的 pivot（见上面 ipDualPivot 的两处容差约定） */
      ipDualPivot(negRow, enter);
      dualSteps[dualSteps.length - 1].snapshot =
        { rows: rows.map(function (r) { return r.slice(); }),
          obj: obj.map(function (o) { return { a: o.a, b: o.b }; }),
          basis: basis.slice() };
    }

    cuts.push({
      round: round + 1, row: pick, basicName: vars[basis[pick]].name,
      value: bVal, cutCoef: cutCoef.slice(0, cutCoef.length), rhs: rhsCut,
      newVarName: vars[newColIdx].name,
      /* 存一份「当时有几列」的快照：每加一刀表就宽一列，
         渲染时必须用它当时的列数，拿最终列数去渲染早期表会直接越界。 */
      varsAfter: vars.slice(0, N),
      text: '第 ' + (pick + 1) + ' 行的基变量 ' + vars[basis[pick]].name
        + ' = ' + fmtNum(bVal) + ' 不是整数，围绕这一行推出割：',
      dualSteps: dualSteps,
      rowsAfter: rows.map(function (r) { return r.slice(); }),
      objAfter: obj.map(function (o) { return { a: o.a, b: o.b }; }),
      basisAfter: basis.slice(), N: N, m: m
    });
  }

  /* 读出最后一张表的解 */
  var solution = [], z = 0;
  for (var j5 = 0; j5 < problem.c.length; j5++) solution.push(0);
  for (var r5 = 0; r5 < m; r5++) {
    var bi = basis[r5];
    if (bi < problem.c.length) solution[bi] = ipRound(rows[r5][N]);
  }
  var zz = 0;
  for (var j6 = 0; j6 < problem.c.length; j6++) zz += problem.c[j6] * solution[j6];

  return {
    key: 'cut', name: '割平面法', applicable: true, sense: problem.direction,
    relax: root, cuts: cuts, converged: converged, maxCuts: MAXCUTS,
    vars: vars, rows: rows, obj: obj, basis: basis, N: N, m: m,
    solution: solution, objective: zz,
    integral: solution.every(function (v, j) { return ipIsInt(v); })
  };
}

/* 注：本文件原先自带一份 ipPivot（表上的枢轴变换），与 simplex.js 的 pivot 是同一套
   高斯消元，现已删除 —— 割平面的对偶单纯形直接调共享内核的 pivot(table, r, e)。
   下面进入隐枚举法。 */

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

/* =========================================================================
   5. 总入口：把四种方法的适用性和结果一次性算出来
   -------------------------------------------------------------------------
   返回 methods 数组，每项都带 applicable / reason。界面据此决定输出哪些：
     · 全部适用且规模不大 → 全部输出
     · 某个方法规模过大     → 提示用户按解法挑选
   ========================================================================= */
function ipSolve(problem, opts) {
  opts = opts || {};
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

  /* 松弛问题都不行的话，四种方法都无从谈起 */
  if (relax.status !== 'optimal') {
    var st = relax.status === 'infeasible' ? '无可行解' : '无界';
    return {
      ok: true, relax: relax, relaxIntegral: false, noOptimum: true,
      methods: [
        { key: 'graph', name: '图解法', applicable: false,
          reason: '松弛问题' + st + '，没有最优解可谈。' },
        { key: 'bnb', name: '分枝定界法', applicable: false,
          reason: '松弛问题' + st + '。整数规划的可行域是松弛问题可行域的一部分，'
                + '松弛问题' + st + '时整数规划也' + st + '。' },
        { key: 'cut', name: '割平面法', applicable: false, reason: '松弛问题' + st + '。' },
        { key: 'enum', name: '隐枚举法', applicable: false, reason: '松弛问题' + st + '。' }
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
