/* =========================================================================
   场景式灵敏度分析（教材做法）
   -------------------------------------------------------------------------
   教材的灵敏度分析不是"把题改掉从头再解一遍"，而是在**原来的最优表**上做局部修改
   再继续迭代。四类常考场景：

     ① 目标函数系数变化 c → 只有检验数行变，用 σ′ⱼ = c′ⱼ − c_B·Pⱼ 判断
     ② 右端项变化 b       → 只有右端列变，用 x′_B = B⁻¹b′ 判断
     ③ 增加一个约束       → 新行并入原表，看当前最优解是否满足它
     ④ 增加一个变量       → 新增一列，用 σ′新 = c′新 − c_B·P新 判断

   判断通过 → 最优基不变，直接给出新解与新目标值；
   判断不通过 → 继续迭代：检验数越界走**原始单纯形法**，右端项越界走**对偶单纯形法**。
   ========================================================================= */
'use strict';

/* Node 里每个文件是独立模块，需要把算法层的工具显式引进来；
   浏览器里各个 <script> 共用全局作用域，这段会自动跳过。 */
if (typeof module !== 'undefined' && module.exports) {
  var _sx = require('./simplex-core.js');
  var EPS = _sx.EPS, pSub = _sx.pSub, pMul = _sx.pMul, pCmp = _sx.pCmp,
      pIsPos = _sx.pIsPos, pIsZero = _sx.pIsZero, matInverse = _sx.matInverse,
      fmtNum = _sx.fmtNum, fmtPair = _sx.fmtPair, simplexSolve = _sx.simplexSolve;
}

/* =========================================================================
   1. 建模：把问题化成标准化形式，并给出变量表。
      步骤与 simplex-core.js 的建表完全一致（同样的取负规范化、同样的变量顺序），
      否则两边算出来的表对不上。这一点由 validate-sens.js 的「模型一致性」检查兜底。
   ========================================================================= */
function sensBuildModel(problem) {
  var n = problem.c.length;
  var m = problem.constraints.length;
  var swapSign = problem.direction === 'min' ? -1 : 1;

  var cons = problem.constraints.map(function (k) {
    return { coef: k.coef.map(Number), rel: k.rel, rhs: Number(k.rhs) };
  });
  var flipSign = [];
  for (var i = 0; i < m; i++) {
    flipSign[i] = 1;
    if (cons[i].rhs < -EPS) {
      cons[i].coef = cons[i].coef.map(function (v) { return -v; });
      cons[i].rhs = -cons[i].rhs;
      cons[i].rel = cons[i].rel === '<=' ? '>=' : (cons[i].rel === '>=' ? '<=' : '=');
      flipSign[i] = -1;
    }
    for (var j = 0; j < n; j++) if (Math.abs(cons[i].coef[j]) < EPS) cons[i].coef[j] = 0;
    if (Math.abs(cons[i].rhs) < EPS) cons[i].rhs = 0;
  }

  var vars = [];
  for (var jx = 0; jx < n; jx++) vars.push({ name: 'x' + (jx + 1), kind: 'x' });
  var sCol = [], aCol = [], basis0 = [];
  for (var i2 = 0; i2 < m; i2++) {
    var k2 = cons[i2];
    if (k2.rel === '<=') {
      sCol[i2] = vars.length; vars.push({ name: 's' + (i2 + 1), kind: 's' });
      basis0[i2] = sCol[i2];
    } else if (k2.rel === '>=') {
      sCol[i2] = vars.length; vars.push({ name: 's' + (i2 + 1), kind: 's' });
      aCol[i2] = vars.length; vars.push({ name: 'a' + (i2 + 1), kind: 'a' });
      basis0[i2] = aCol[i2];
    } else {
      aCol[i2] = vars.length; vars.push({ name: 'a' + (i2 + 1), kind: 'a' });
      basis0[i2] = aCol[i2];
    }
  }
  var N = vars.length;

  var cObj = [];
  for (var jc = 0; jc < N; jc++) cObj.push({ a: 0, b: 0 });
  for (var jd = 0; jd < n; jd++) cObj[jd] = { a: swapSign * Number(problem.c[jd]), b: 0 };
  for (var ia = 0; ia < m; ia++) if (aCol[ia] !== undefined) cObj[aCol[ia]] = { a: 0, b: -1 };

  var A0 = [], b0 = [];
  for (var ir = 0; ir < m; ir++) {
    var r = new Array(N).fill(0);
    for (var jr = 0; jr < n; jr++) r[jr] = cons[ir].coef[jr];
    if (sCol[ir] !== undefined) r[sCol[ir]] = (cons[ir].rel === '>=' ? -1 : 1);
    if (aCol[ir] !== undefined) r[aCol[ir]] = 1;
    A0.push(r);
    b0.push(cons[ir].rhs);
  }

  /* 变量名 → 列号，供「用基的名字去新问题里定位」 */
  var colOf = {};
  for (var v2 = 0; v2 < N; v2++) colOf[vars[v2].name] = v2;

  return {
    n: n, m: m, N: N, swapSign: swapSign, direction: problem.direction,
    cons: cons, flipSign: flipSign, vars: vars, colOf: colOf,
    sCol: sCol, aCol: aCol, basis0: basis0, cObj: cObj, A0: A0, b0: b0
  };
}

/* =========================================================================
   2. 用指定的一组基变量构造规范表（等价于对 A0 做 B⁻¹ 变换）
   ========================================================================= */
function sensTableau(model, basisCols) {
  var m = model.m, N = model.N;
  var B = [];
  for (var i = 0; i < m; i++) {
    var row = [];
    for (var k = 0; k < m; k++) row.push(model.A0[i][basisCols[k]]);
    B.push(row);
  }
  var Binv = matInverse(B);
  if (!Binv) return null;

  var rows = [];
  for (var i2 = 0; i2 < m; i2++) {
    var r = new Array(N + 1).fill(0);
    for (var j = 0; j < N; j++) {
      var s = 0;
      for (var k2 = 0; k2 < m; k2++) s += Binv[i2][k2] * model.A0[k2][j];
      r[j] = Math.abs(s) < 1e-12 ? 0 : s;
    }
    var sb = 0;
    for (var k3 = 0; k3 < m; k3++) sb += Binv[i2][k3] * model.b0[k3];
    r[N] = Math.abs(sb) < 1e-12 ? 0 : sb;
    rows.push(r);
  }

  var obj = sensObjRow(model, rows, basisCols);
  return { rows: rows, obj: obj, basis: basisCols.slice(), Binv: Binv };
}

/* 由 rows 与基算出检验数行，末位存 −z */
function sensObjRow(model, rows, basisCols) {
  var N = model.N, m = model.m;
  var obj = [];
  for (var j = 0; j < N; j++) obj.push({ a: model.cObj[j].a, b: model.cObj[j].b });
  obj.push({ a: 0, b: 0 });                       // 末位存 −z
  for (var i = 0; i < m; i++) {
    var cB = model.cObj[basisCols[i]];
    for (var j2 = 0; j2 <= N; j2++) obj[j2] = pSub(obj[j2], pMul(cB, rows[i][j2]));
  }
  return obj;
}

/* =========================================================================
   3. 继续迭代：检验数有正 → 原始单纯形一步；右端项有负 → 对偶单纯形一步
   ========================================================================= */
function sensIterate(model, T, maxIter) {
  var m = model.m, N = model.N, vars = model.vars;
  var rows = T.rows, obj = T.obj, basis = T.basis;
  var steps = [], status = 'optimal', iter = 0;
  var limit = maxIter || 200;

  function snap(extra) {
    var s = {
      iter: iter, rows: [], obj: [], basis: basis.slice(),
      entering: null, leaving: null, pivot: null, ratios: null,
      degenerate: false, note: '', dual: false
    };
    for (var x in extra) s[x] = extra[x];
    for (var i = 0; i < m; i++) s.rows.push(rows[i].slice());
    for (var j = 0; j <= N; j++) s.obj.push({ a: obj[j].a, b: obj[j].b });
    return s;
  }
  function pivot(r, e) {
    var p = rows[r][e];
    for (var j = 0; j <= N; j++) rows[r][j] /= p;
    for (var i = 0; i < m; i++) {
      if (i === r) continue;
      var f = rows[i][e];
      if (f === 0) continue;
      for (var j2 = 0; j2 <= N; j2++) rows[i][j2] -= f * rows[r][j2];
    }
    var fo = obj[e];
    for (var j3 = 0; j3 <= N; j3++) obj[j3] = pSub(obj[j3], pMul(fo, rows[r][j3]));
    basis[r] = e;
  }
  function positiveArtificial() {
    for (var i = 0; i < m; i++) {
      if (vars[basis[i]].kind === 'a' && rows[i][N] > 1e-7) return i;
    }
    return -1;
  }

  while (true) {
    /* 入基候选：σ_j > 0 中最大者（Dantzig） */
    var e = -1, best = null;
    for (var j = 0; j < N; j++) {
      if (pIsPos(obj[j]) && (best === null || pCmp(obj[j], best) > 0)) { best = obj[j]; e = j; }
    }

    if (e === -1) {
      /* 检验数全 ≤ 0。此时若还有人工变量取正值，说明原问题无可行解 */
      var ap = positiveArtificial();
      if (ap >= 0) {
        steps.push(snap({
          note: '所有检验数 σⱼ ≤ 0，但人工变量 ' + vars[basis[ap]].name +
                ' 仍取正值（= ' + fmtNum(rows[ap][N]) + '），说明新条件下的约束无法同时满足 → **无可行解**。'
        }));
        status = 'infeasible';
        break;
      }
      /* 再看右端项是否全非负 */
      var negRow = -1, mostNeg = -1e-9;
      for (var i2 = 0; i2 < m; i2++) {
        if (rows[i2][N] < mostNeg) { mostNeg = rows[i2][N]; negRow = i2; }
      }
      if (negRow === -1) {
        steps.push(snap({
          note: '检验数全部 σⱼ ≤ 0 且右端项全非负，已经得到新问题的最优解。'
        }));
        break;
      }
      /* ---- 对偶单纯形一步 ----
         比值取 |σⱼ ÷ a_rj|（只在该行的负系数上取）。σⱼ 可能带 M 项（基里残留人工
         变量时），而 M 是形式上的无穷大：必须先比 M 的系数、再比常数项。否则会
         挑中一个人工变量入基 —— 那既不是教材做法，中间解也不再是原问题的可行解。 */
      var ent = -1, best = null;
      var dualRatios = [];
      for (var j4 = 0; j4 < N; j4++) {
        if (rows[negRow][j4] < -EPS) {
          var den = rows[negRow][j4];
          var key = { a: Math.abs(obj[j4].a / den), b: Math.abs(obj[j4].b / den) };
          dualRatios.push({ col: j4, ratio: key.a, ratioM: key.b, ok: true });
          if (best === null || key.b < best.b - 1e-12 ||
              (Math.abs(key.b - best.b) <= 1e-12 && key.a < best.a - 1e-12)) {
            best = key; ent = j4;
          }
        } else {
          dualRatios.push({ col: j4, ratio: null, ratioM: null, ok: false });
        }
      }
      if (ent === -1) {
        steps.push(snap({
          note: '右端项为负的第 ' + (negRow + 1) + ' 行里没有负系数，对偶比值无法计算，' +
                '说明新条件下约束互相矛盾 → **无可行解**。'
        }));
        status = 'infeasible';
        break;
      }
      steps.push(snap({
        iter: iter, dual: true,
        entering: ent, leaving: negRow, pivot: rows[negRow][ent],
        ratios: dualRatios, dualRow: negRow, dualCol: ent,
        note: '<span class="row">对偶单纯形法：右端项第 ' + (negRow + 1) + ' 行 = '
          + fmtNum(rows[negRow][N]) + ' < 0，先让它出基。</span>'
          + '<span class="row">比值 θ′ⱼ = |σⱼ ÷ a<sub>' + (negRow + 1) + 'j</sub>|，'
          + '只在该行的负系数上取（否则 θ 无法保持右端项非负）：</span>'
          + dualRatios.filter(function (r) { return r.ok; }).map(function (r) {
              return '<span class="row">　' + vars[r.col].name + '：|' + fmtPair(obj[r.col])
                + ' ÷ ' + fmtNum(rows[negRow][r.col]) + '| = <b>'
                + fmtDualRatio(r.ratioM, r.ratio) + '</b></span>';
            }).join('')
          + '<span class="row">最小者对应 ' + vars[ent].name + ' 入基，'
          + vars[basis[negRow]].name + ' 出基。'
          + (Math.abs(rows[negRow][ent]) < 1e-9 ? '（退化：这一步不改变解）' : '') + '</span>'
      }));
      pivot(negRow, ent);
      iter++;
      if (iter > limit) { status = 'iteration-limit'; break; }
      continue;
    }

    /* ---- 原始单纯形一步 ---- */
    var ratios = [], r = -1, minRatio = Infinity;
    for (var i3 = 0; i3 < m; i3++) {
      if (rows[i3][e] > EPS) {
        var th = rows[i3][N] / rows[i3][e];
        ratios.push({ row: i3, theta: th, ok: true });
        if (th < minRatio - EPS) { minRatio = th; r = i3; }
      } else {
        ratios.push({ row: i3, theta: null, ok: false });
      }
    }
    if (r === -1) {
      var ap2 = positiveArtificial();
      if (ap2 >= 0) {
        steps.push(snap({
          iter: iter, entering: e, ratios: ratios,
          note: '入基变量 ' + vars[e].name + ' 所在列没有正系数，但人工变量 ' +
                vars[basis[ap2]].name + ' 仍取正值 → **无可行解**。'
        }));
        status = 'infeasible';
      } else {
        steps.push(snap({
          iter: iter, entering: e, ratios: ratios,
          note: '入基变量 ' + vars[e].name + ' 所在列没有正系数，它可以无限增大而始终满足约束 → **无界解**。'
        }));
        status = 'unbounded';
      }
      break;
    }
    steps.push(snap({
      iter: iter, entering: e, leaving: r, pivot: rows[r][e], ratios: ratios,
      degenerate: minRatio < 1e-7
    }));
    pivot(r, e);
    iter++;
    if (iter > limit) { status = 'iteration-limit'; break; }
  }

  return { steps: steps, status: status, rows: rows, obj: obj, basis: basis };
}

/* =========================================================================
   4. 从表里读出解与目标值（沿用 simplex-core 的约定：obj[N] 存 −z）
   ========================================================================= */
function sensReadOut(model, T) {
  var solution = new Array(model.n).fill(0);
  for (var i = 0; i < model.m; i++) {
    if (T.basis[i] < model.n) solution[T.basis[i]] = T.rows[i][model.N];
  }
  for (var j = 0; j < model.n; j++) if (Math.abs(solution[j]) < 1e-9) solution[j] = 0;
  var zInt = -T.obj[model.N].a;
  var zUser = model.swapSign < 0 ? -zInt : zInt;
  var names = T.basis.map(function (c) { return model.vars[c].name; });
  var slack = [];
  for (var i2 = 0; i2 < model.m; i2++) if (model.sCol[i2] !== undefined) {
    slack.push({ i: i2, col: model.sCol[i2], basic: T.basis.indexOf(model.sCol[i2]) !== -1,
                 value: T.basis.indexOf(model.sCol[i2]) !== -1 ? T.rows[T.basis.indexOf(model.sCol[i2])][model.N] : null });
  }
  return { solution: solution, objective: zUser, basisNames: names, slack: slack };
}

/* =========================================================================
   5. 四类场景
   ========================================================================= */

/* 通用收尾：把「判断 + 继续迭代」组装成统一结构 */
function sensFinish(model, T, judgement, kind, title, extra) {
  var iter = sensIterate(model, T);
  var out = sensReadOut(model, iter);
  var res = {
    ok: true, kind: kind, title: title,
    judgement: judgement,
    vars: model.vars, N: model.N, n: model.n, m: model.m,
    /* 迭代表渲染函数（ui.js 的 renderTable）按这两个字段决定行数与列数，
       场景结果必须带上，否则基行画不出来 */
    mConstraints: model.m, nDecision: model.n,
    direction: model.direction, swapSign: model.swapSign,
    steps: iter.steps, status: iter.status,
    result: out, model: model
  };
  for (var k in extra) res[k] = extra[k];
  return res;
}

/* ---- ① 目标函数系数变化 ---- */
function sensChangeC(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  newProb.c = scenario.c.map(Number);
  var model = sensBuildModel(newProb);

  var baseRes = simplexSolve(baseProblem);
  var baseModel = sensBuildModel(baseProblem);
  var baseNames = sensBasisNames(baseRes);

  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在改动后无法构造（基矩阵奇异）');
  var T = sensTableau(model, basisCols);
  if (!T) return sensFail('原最优基在改动后无法构造（基矩阵奇异）');

  /* 教材式判断：逐个非基变量算新检验数 */
  var lines = [], changed = false;
  for (var j = 0; j < model.n; j++) {
    if (T.basis.indexOf(j) !== -1) continue;
    var newC = model.cObj[j];
    var zj = sensZj(model, T, j);
    var sig = pSub(newC, zj);
    var oldSig = sensZjOf(baseModel, baseRes, j);
    if (pIsPos(sig)) {
      changed = true;
      lines.push('σ′' + sub(j + 1) + ' = c′' + sub(j + 1) + ' − z' + sub(j + 1) + ' = '
        + fmtPair(newC) + ' − ' + fmtPair(zj) + ' = ' + fmtPair(sig) + ' > 0，故最优解改变');
    } else if (oldSig && pCmp(sig, oldSig) !== 0) {
      lines.push('σ′' + sub(j + 1) + ' = ' + fmtPair(sig) + ' ≤ 0，' + nm(j) + ' 仍不进基');
    }
  }
  if (!changed) {
    lines.push('所有非基变量的检验数 σ′ⱼ ≤ 0，最优基不变；最优解不变，只有目标值变化');
  }

  var judgement = {
    changed: changed,
    title: '检验数检验',
    head: '把新系数代入原最优表，重算检验数 σ′ⱼ = c′ⱼ − zⱼ：',
    lines: lines,
    conclusion: changed ? '最优基改变，需在原最优表上继续迭代' : '最优基不变'
  };
  return sensFinish(model, T, judgement, 'c', '目标函数系数变化', { newProblem: newProb });
}

/* ---- ② 右端项变化 ---- */
function sensChangeB(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  scenario.rhs.forEach(function (v, i) { newProb.constraints[i].rhs = Number(v); });
  var model = sensBuildModel(newProb);

  var baseRes = simplexSolve(baseProblem);
  var baseNames = sensBasisNames(baseRes);
  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在改动后无法构造（新右端项使基矩阵奇异）');
  var T = sensTableau(model, basisCols);
  if (!T) return sensFail('原最优基在改动后无法构造（新右端项使基矩阵奇异）');

  /* 教材式判断：x′_B = B⁻¹b′ */
  var xB = [], neg = false;
  for (var i = 0; i < model.m; i++) {
    var v = T.rows[i][model.N];
    xB.push(v);
    if (v < -1e-9) neg = true;
  }
  var lines = [];
  lines.push('B⁻¹b′ = ' + vecStr(xB) + (neg ? '，其中有负分量 → 原基不再可行' : ' > 0，最优基不变'));
  if (!neg) {
    lines.push('基变量取值变为 ' + T.basis.map(function (c, i2) {
      return model.vars[c].name + ' = ' + fmtNum(xB[i2]);
    }).join('、') + '；非基变量仍取 0');
  } else {
    lines.push('右端项越界，用**对偶单纯形法**在原来的表上继续迭代即可恢复可行');
  }

  var judgement = {
    changed: neg,
    title: '右端项检验',
    head: '目标的系数没变，所以检验数行不变；只有右端列要换成新的 x′_B = B⁻¹b′：',
    lines: lines,
    matrix: model.m <= 4 ? matrixStr(T.Binv) : null,
    conclusion: neg ? '最优基不变，但基取值越界 → 对偶单纯形法继续' : '最优基不变，直接得到新解'
  };
  return sensFinish(model, T, judgement, 'b', '右端项变化', { newProblem: newProb });
}

/* ---- ③ 增加一个约束 ---- */
function sensAddConstraint(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  newProb.constraints.push({
    coef: scenario.coef.map(Number), rel: scenario.rel, rhs: Number(scenario.rhs)
  });
  var model = sensBuildModel(newProb);
  var baseRes = simplexSolve(baseProblem);
  var baseNames = sensBasisNames(baseRes);

  /* 旧基在新模型里的列号（新约束的 s/a 排在最后，旧列号其实不变，但仍按名字定位更稳） */
  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在新问题里无法定位');

  var mOld = baseProblem.constraints.length;
  var N = model.N;
  var baseModel = sensBuildModel(baseProblem);
  var baseN = baseModel.N;

  /* 旧表：前 mOld 行照抄。注意旧表的列是 0..baseN-1、右端项在列 baseN，
     而新表里下标 baseN 已经是「新增的 s/a 列」了，所以右端项必须单独搬。 */
  var rows = [];
  for (var i = 0; i < mOld; i++) rows.push(new Array(N + 1).fill(0));
  var baseT = sensTableau(baseModel, sensMapBasis(baseModel, baseNames));
  if (!baseT) return sensFail('原最优表构造失败');
  for (var i2 = 0; i2 < mOld; i2++) {
    for (var j = 0; j < baseN; j++) rows[i2][j] = baseT.rows[i2][j];
    rows[i2][N] = baseT.rows[i2][baseN];
  }

  /* 新行：先写成原始系数，再消去旧基变量。
     消元后该行的右端项恰好就是「新约束在当前最优解处的余量」。 */
  var newRow = new Array(N + 1).fill(0);
  var last = mOld;                                  // 新约束在 cons 里的下标
  for (var j2 = 0; j2 < model.n; j2++) {
    newRow[j2] = model.cons[last].coef[j2];
  }
  if (model.sCol[last] !== undefined) {
    newRow[model.sCol[last]] = (model.cons[last].rel === '>=' ? -1 : 1);
  }
  if (model.aCol[last] !== undefined) newRow[model.aCol[last]] = 1;
  newRow[N] = model.cons[last].rhs;

  /* 消元：newRow -= newRow[基列ᵖ] · 第 p 行。
     列与右端项要分开搬（见上），否则右端项会被写进新增的 s 列里。 */
  for (var p = 0; p < mOld; p++) {
    var cb = newRow[basisCols[p]];
    if (Math.abs(cb) < 1e-12) continue;
    for (var j3 = 0; j3 < baseN; j3++) newRow[j3] -= cb * baseT.rows[p][j3];
    newRow[N] -= cb * baseT.rows[p][baseN];
  }

  /* ≥ 约束的剩余变量在标准化里系数是 −1，要让它可以当基变量须整行取负。
     取负后右端项 = 新约束左端 − b，正是「剩余量」，为负即当前解不满足。 */
  var isGe = (model.cons[last].rel === '>=');
  if (isGe) {
    for (var j4 = 0; j4 <= N; j4++) newRow[j4] = -newRow[j4];
  }
  rows.push(newRow);

  var basis = basisCols.slice();
  basis.push(model.cons[last].rel === '=' ? model.aCol[last] : model.sCol[last]);

  var T = { rows: rows, obj: null, basis: basis };
  T.obj = sensObjRow(model, rows, basis);

  /* 教材式判断：当前最优解是否满足新约束 */
  var lhs = 0;
  for (var j5 = 0; j5 < model.n; j5++) lhs += model.cons[last].coef[j5] * baseRes.solution[j5];
  var sl = newRow[N];                                // 新约束在当前解处的余量（基变量值）
  var sat = sl > -1e-9;
  var sym = model.cons[last].rel;
  var lines = [];
  lines.push('当前最优解 (' + baseRes.solution.map(fmtNum).join(', ') + ') 处，新约束左端 = '
    + fmtNum(lhs) + ' ' + sym + ' ' + fmtNum(model.cons[last].rhs)
    + ' → ' + (sat ? '满足' : '不满足'));
  lines.push('把新行并入原表并消去基变量后，它自己的松弛/剩余变量取值 = ' + fmtNum(sl)
    + (sat ? ' ≥ 0，原最优解仍然可行，最优解不变'
           : ' < 0，原最优解对新问题不可行 → 用**对偶单纯形法**继续迭代'));

  var judgement = {
    changed: !sat,
    title: '新约束检验',
    head: '把新约束直接并入原来的最优表，看当前最优解是否满足它：',
    lines: lines,
    conclusion: sat ? '最优解不变' : '原最优解不可行，需继续迭代'
  };
  return sensFinish(model, T, judgement, 'add-con', '增加一个约束', { newProblem: newProb });
}

/* ---- ④ 增加一个变量 ---- */
function sensAddVar(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  newProb.c = newProb.c.concat([Number(scenario.c)]);
  scenario.coef.forEach(function (v, i) { newProb.constraints[i].coef.push(Number(v)); });
  var model = sensBuildModel(newProb);

  var baseRes = simplexSolve(baseProblem);
  var baseNames = sensBasisNames(baseRes);
  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在新问题里无法定位');
  var T = sensTableau(model, basisCols);
  if (!T) return sensFail('原最优基在新问题里无法定位');

  var jNew = model.n - 1;
  var newC = model.cObj[jNew];
  var zj = sensZj(model, T, jNew);
  var sig = pSub(newC, zj);
  var changed = pIsPos(sig);

  var lines = [];
  lines.push('新变量 ' + nm(jNew) + ' 的检验数 σ′' + sub(jNew + 1) + ' = c′' + sub(jNew + 1)
    + ' − z' + sub(jNew + 1) + ' = ' + fmtPair(newC) + ' − ' + fmtPair(zj) + ' = ' + fmtPair(sig));
  lines.push(changed
    ? '> 0，说明增加这个变量还能让目标函数变好 → 它在新的最优解里会取正值，需继续迭代'
    : '≤ 0，说明增加它不会改善目标函数 → 它仍取 0，最优解不变');

  var judgement = {
    changed: changed,
    title: '新变量检验',
    head: '把新变量作为新的一列并入原最优表，算它的检验数：',
    lines: lines,
    conclusion: changed ? '最优解改变，需继续迭代' : '最优解不变'
  };
  return sensFinish(model, T, judgement, 'add-var', '增加一个变量', { newProblem: newProb });
}

/* =========================================================================
   6. 工具
   ========================================================================= */
function sensClone(p) {
  return {
    direction: p.direction,
    c: p.c.map(Number),
    constraints: p.constraints.map(function (k) {
      return { coef: k.coef.map(Number), rel: k.rel, rhs: Number(k.rhs) };
    })
  };
}
function sensBasisNames(res) {
  var last = res.steps[res.steps.length - 1];
  return last.basis.map(function (c) { return res.vars[c].name; });
}
function sensMapBasis(model, names) {
  var cols = [];
  for (var i = 0; i < names.length; i++) {
    if (model.colOf[names[i]] === undefined) return null;
    cols.push(model.colOf[names[i]]);
  }
  return cols;
}
/* σⱼ = c_B·(B⁻¹Pⱼ) —— 即「第 j 列的 zⱼ」 */
function sensZj(model, T, j) {
  var acc = { a: 0, b: 0 };
  for (var i = 0; i < model.m; i++) {
    acc = pAdd2(acc, pMul(model.cObj[T.basis[i]], T.rows[i][j]));
  }
  return acc;
}
/* 基准解里某个非基变量的旧检验数（用于对比说明） */
function sensZjOf(baseModel, baseRes, j) {
  try {
    var names = sensBasisNames(baseRes);
    var cols = sensMapBasis(baseModel, names);
    if (!cols || j >= baseModel.N) return null;
    var T = sensTableau(baseModel, cols);
    if (!T) return null;
    return pSub(baseModel.cObj[j], sensZj(baseModel, T, j));
  } catch (e) { return null; }
}
function pAdd2(x, y) { return { a: x.a + y.a, b: x.b + y.b }; }
function nm(j) { return 'x' + (j + 1); }
function sub(k) { return String(k).replace(/[0-9]/g, function (d) {
  return '₀₁₂₃₄₅₆₇₈₉'[+d];
}); }
function vecStr(v) { return '(' + v.map(fmtNum).join(', ') + ')ᵀ'; }
/* 对偶比值可能带 M 项，显示成「2M + 3」这类样子 */
function fmtDualRatio(b, a) {
  if (!(b > 1e-9)) return fmtNum(a);
  var m = Math.abs(b - 1) < 1e-9 ? 'M' : fmtNum(b) + 'M';
  return (a > 1e-9) ? (m + ' + ' + fmtNum(a)) : m;
}
function matrixStr(M) {
  return M.map(function (row) { return '(' + row.map(fmtNum).join(' ') + ')'; }).join('');
}
function sensFail(msg) { return { ok: false, message: msg }; }

/* 统一入口 */
function sensAnalyze(baseProblem, scenario) {
  var base = simplexSolve(baseProblem);
  if (base.status !== 'optimal' || base.sensitivity === null) {
    return { ok: false, message: '基准问题没有最优解，无法做灵敏度分析。' };
  }
  if (!scenario || !scenario.type) return { ok: false, message: '请选择要分析的变化类型。' };
  var r;
  if (scenario.type === 'c') r = sensChangeC(baseProblem, scenario);
  else if (scenario.type === 'b') r = sensChangeB(baseProblem, scenario);
  else if (scenario.type === 'add-con') r = sensAddConstraint(baseProblem, scenario);
  else if (scenario.type === 'add-var') r = sensAddVar(baseProblem, scenario);
  else return { ok: false, message: '未知的分析类型。' };
  if (r && r.ok) r.base = { solution: base.solution, objective: base.objective,
                            basisNames: sensBasisNames(base), dual: base.dual };
  return r;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sensAnalyze: sensAnalyze,
    sensBuildModel: sensBuildModel,
    sensTableau: sensTableau,
    sensIterate: sensIterate,
    sensReadOut: sensReadOut
  };
}
