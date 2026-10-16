'use strict';
var pivot = require('./simplex.js').pivot;
var pIsZero = require('./util.js').pIsZero;
var fmtNum = require('./format.js').fmtNum;
var shared = require('./integer-common.js');
var IP_EPS = shared.IP_EPS;
var ipIsInt = shared.ipIsInt;
var ipRound = shared.ipRound;
var ipFrac = shared.ipFrac;
var ipIsPureInteger = shared.ipIsPureInteger;
var ipRelaxation = shared.ipRelaxation;
/* =========================================================================
   3. 割平面法（Gomory 割）
   -------------------------------------------------------------------------
   在松弛问题的最优表上，从「取值不是整数」的那一行直接读出一条新的约束
   （割平面）加进去，把那个非整数解割掉，再用对偶单纯形法重新求最优。
   反复做，直到最优解全部取整。

   这条割的推导：设第 r 行的基变量 x_Br 取值为分数，把该行写成
        x_Br = b̄_r − Σ_{j∉基} ā_rj x_j
   两边取小数部分。因为 x_Br 与非基变量都要求取整，可以证明
        Σ_{j∉基} f(ā_rj)·x_j ≥ f(b̄_r)        （f(·) 表示取小数部分）
   这就是 Gomory 割：它把当前的分数解排除掉，但任何一个整数可行解都仍然满足它。

   当前实现支持的标准形式：全部变量取整、约束全部是 ≤、右端项非负、系数全为整数。
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
               reason: '第 ' + (i + 1) + ' 条约束是「' + k.rel + '」。当前割平面法实现'
                     + '要求全部约束都是 ≤（这样松弛变量本身也是整数，割才成立）。' };
    }
    if (k.rhs < -IP_EPS) {
      return { key: 'cut', name: '割平面法', applicable: false,
               reason: '第 ' + (i + 1) + ' 条约束的右端项是负的，当前割平面法实现要求右端项非负。' };
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
    /* 右端项为负时把整行取负后再取小数部分，保证割的方向正确。
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


module.exports = {
  ipCuttingPlane: ipCuttingPlane
};
