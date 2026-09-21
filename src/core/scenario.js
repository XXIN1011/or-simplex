/* =========================================================================
   场景式灵敏度分析（教材做法）
   -------------------------------------------------------------------------
   教材的灵敏度分析不是"把题改掉从头再解一遍"，而是在**原来的最优表**上做局部修改
   再继续迭代。按徐玖平《运筹学（第四版）》第 2 章的小节，常考的是这几类：

     ① 目标函数系数变化 c（2.5.2 非基变量系数 / 2.5.4 基变量系数）
          · 非基变量：只重算它自己那一列的 σ′_j = c′_j − z_j
          · 基变量  ：进了 c_B，σ 的**整行**都要重算
     ② 技术系数变化 a_ij（列系数）
          · x_j 非基：B 不含 P_j → 只重算这一列
          · x_j 是基：B 的第 k 列就是 P_j → **整张表重算**
     ③ 右端项变化 b       → 只有右端列变，用 x′_B = B⁻¹b′ 判断
     ④ 增加一个约束       → 新行并入原表，看当前最优解是否满足它
     ⑤ 增加一个变量       → 新增一列，用 σ′新 = c′新 − c_B·P新 判断

   判断通过 → 最优基不变，直接给出新解与新目标值；
   判断不通过 → 继续迭代：检验数越界走**原始单纯形法**，右端项越界走**对偶单纯形法**，
   两者同时越界时两种局部迭代法都不适用（教材的做法是重新求解，见 sensChangeA）。
   ========================================================================= */
'use strict';

/* 依赖：求解内核 + 输入解析 + 数据模型 + 公共工具 + 格式化。
   原则是「别的模块已经有的东西一律不再写第二遍」：
     · 建模与初始表      → parse.js 的 toStandardForm
     · 入基 / 比值 / 枢轴 → simplex.js 的 selectEnteringDantzig / ratioTest / pivot
     · 完整求解、对偶解   → simplex.js 的 simplexSolve
     · 数值判定与矩阵运算 → util.js；数字与 λ 表达式的显示 → format.js
   本模块只留自己独有的部分：五类场景变换、参数线性规划的分段行走与 λ 区间求解，
   以及把它们组织成界面要用的报告结构。
   依赖一律显式 require（浏览器端由 src/build.js 的迷你打包器提供 require）。 */
var _core = require('./simplex.js');
var _util = require('./util.js');
var _fmt = require('./format.js');
var _parse = require('./parse.js');
var _model = require('./model.js');

var simplexSolve = _core.simplexSolve;
var selectEnteringDantzig = _core.selectEnteringDantzig;   // 入基规则（σ_j > 0 中最大者）
var ratioTest = _core.ratioTest;                           // 最小比值规则
var pivot = _core.pivot;                                   // 枢轴变换（就地改 rows / obj / basis）
var toStandardForm = _parse.toStandardForm;                 // 校验 + 规范化 + 建初始表
var createSnapshot = _model.createSnapshot;                 // 迭代快照（字段与顺序同内核）
var createConstraint = _model.createConstraint;
var createLPProblem = _model.createLPProblem;

var EPS = _util.EPS, pAdd = _util.pAdd, pSub = _util.pSub, pMul = _util.pMul,
    pIsPos = _util.pIsPos, matInverse = _util.matInverse, matVec = _util.matVec,
    clampSign = _util.clampSign;
var fmtNum = _fmt.fmtNum, fmtPair = _fmt.fmtPair, fmtAff = _fmt.fmtAff;

/* =========================================================================
   1. 建模：把问题化成标准化形式，并给出本模块要用的几个视图。
      ---------------------------------------------------------------------
      标准化本身（取负规范化、变量顺序、初始表、检验数行）**一律交给
      parse.js 的 toStandardForm** —— 与求解内核同一份实现，两边的表不可能分叉
      （由 test/algorithm/scenario-test.js 的「建表一致性自检」兜底）。
      这里只把标准型投影成几个视图：cons（系数与关系符都取规范化之后的值）、
      sCol / aCol（松弛/剩余变量、人工变量的列号）、basis0（标准初始基）、
      b0（内部右端项）、cObj / A0、colOf（变量名 → 列号）。
      关系符不靠「再翻一次符号」推，而是从标准型的结构直接读：
      ≤ 补一个松弛变量；≥ 补松弛变量**并且**补人工变量；= 只补人工变量。
   ========================================================================= */
function sensBuildModel(problem) {
  var parsed = toStandardForm(problem);
  if (!parsed.ok) return null;            // 输入不合法：调用方转成 { ok:false, message }
  var form = parsed.form;
  var n = form.n, m = form.m, N = form.N;

  var colOf = {};
  for (var v = 0; v < N; v++) colOf[form.vars[v].name] = v;

  var sCol = [], aCol = [], cons = [];
  for (var i = 0; i < m; i++) {
    var si = colOf['s' + (i + 1)], ai = colOf['a' + (i + 1)];
    if (si !== undefined) sCol[i] = si;
    if (ai !== undefined) aCol[i] = ai;
    cons.push(createConstraint(form.A0[i].slice(0, n),
      si === undefined ? '=' : (ai === undefined ? '<=' : '>='),
      form.consRhs[i]));
  }

  return {
    n: n, m: m, N: N, swapSign: form.swapped ? -1 : 1, direction: form.direction,
    cons: cons, flipSign: form.flipSign, vars: form.vars, colOf: colOf,
    sCol: sCol, aCol: aCol, basis0: form.basis.slice(), cObj: form.cObj,
    A0: form.A0, b0: form.consRhs.slice()
  };
}

/* =========================================================================
   2. 用指定的一组基变量构造规范表（等价于对 A0 做 B⁻¹ 变换）。
      B⁻¹ 交给 util.js 的 matInverse，B⁻¹·[A0 | b] 交给 util.js 的 matVec ——
      求逆与矩阵乘向量都复用共享实现。返回的对象带 rows / obj / basis / m / N，
      与 simplex.js 的 pivot / ratioTest / selectEnteringDantzig 所需字段同构，
      迭代那一段就是直接在这些表上跑内核函数的；Binv 另留给界面显示。
   ========================================================================= */
function sensTableau(model, basisCols) {
  var m = model.m, N = model.N;
  var B = [];
  for (var i = 0; i < m; i++) {
    B.push(basisCols.map(function (c) { return model.A0[i][c]; }));
  }
  var Binv = matInverse(B);
  if (!Binv) return null;                 // 基矩阵奇异 → 调用方按「这组基不能用了」处理

  var rows = [];
  for (var i2 = 0; i2 < m; i2++) rows.push(new Array(N + 1).fill(0));
  /* 一列一列地做变换：前 N 列来自 A0，末位是右端项，单独搬 b0 */
  for (var j = 0; j < N; j++) {
    var col = matVec(Binv, model.A0.map(function (row) { return row[j]; }));
    for (var i3 = 0; i3 < m; i3++) rows[i3][j] = snapTiny(col[i3]);
  }
  var rhs = matVec(Binv, model.b0);
  for (var i4 = 0; i4 < m; i4++) rows[i4][N] = snapTiny(rhs[i4]);

  return {
    rows: rows, obj: sensObjRow(model, rows, basisCols), basis: basisCols.slice(), Binv: Binv,
    /* 内核的 pivot / ratioTest / selectEnteringDantzig 只认标准型的表部分，即 m 与 N */
    m: m, N: N
  };
}

/* 建表时的 1e-12 归零（沿用旧实现；显示层另由 fmtNum 做 1e-9 容差） */
function snapTiny(v) { return Math.abs(v) < 1e-12 ? 0 : v; }

/* 由 rows 与基算出检验数行，末位存 −z。
   pair 算术（pSub / pMul）走 util.js；内核里没有「按任意一组基建 σ 行」的入口，
   parse.js 只建初始基那一份，所以这里按定义算：σⱼ = cⱼ − c_B·(B⁻¹Pⱼ)。 */
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
      三件数值活全部直接用内核实现：selectEnteringDantzig(T) 选入基、
      ratioTest(T, e) 做最小比值、pivot(T, r, e) 做枢轴变换。本函数不是第二个
      求解器，而是「内核四件套 + 对偶分支 + 教材文案」的组装，只剩两件内核没有的
      东西：本模块独有的判定顺序与说明文字（快照的 note 直接渲染到界面），以及
      右端项越界时的**对偶单纯形一步**（内核的 solveStandardForm 只走原始单纯形）。
   ========================================================================= */
function sensIterate(model, T, maxIter) {
  var m = model.m, N = model.N, vars = model.vars;
  var rows = T.rows, obj = T.obj, basis = T.basis;
  var steps = [], status = 'optimal', iter = 0;
  var limit = maxIter || 200;

  /* 快照：数值与字段顺序都走 model.js 的 createSnapshot（与内核逐字一致）。
     dual 的默认值放在 extra 的第一位、迭代数默认取当前 iter —— 这样生成出来的
     快照字段与顺序和旧实现完全一致。 */
  function snap(extra) {
    var ex = { iter: iter, dual: extra.dual === true };
    for (var x in extra) ex[x] = extra[x];
    return createSnapshot(T, ex);
  }
  /* 基里还残留取正值的人工变量 → 原问题的约束并没有被真正满足 */
  function positiveArtificial() {
    for (var i = 0; i < m; i++) {
      if (vars[basis[i]].kind === 'a' && rows[i][N] > 1e-7) return i;
    }
    return -1;
  }

  while (true) {
    /* 入基候选：σ_j > 0 中最大者（Dantzig）—— 与内核同一个实现 */
    var e = selectEnteringDantzig(T);

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
      var dualRatios = dualRatioList(T, negRow);
      var ent = dualEnter(dualRatios);
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
      pivot(T, negRow, ent);
      iter++;
      if (iter > limit) { status = 'iteration-limit'; break; }
      continue;
    }

    /* ---- 原始单纯形一步 ---- */
    var rt = ratioTest(T, e);
    var ratios = rt.ratios, r = rt.r, minRatio = rt.minRatio;
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
    pivot(T, r, e);
    iter++;
    if (iter > limit) { status = 'iteration-limit'; break; }
  }

  return { steps: steps, status: status, rows: rows, obj: obj, basis: basis };
}

/* 对偶比值表 θ′ⱼ = |σⱼ ÷ a_rj|：只在该行（第 r 行）的负系数上取 —— 否则 θ 无法
   保持右端项非负。σ 可能带 M 项，而 M 是形式上的无穷大：先比 M 的系数、再比常数项，
   否则会挑中一个人工变量入基。 */
function dualRatioList(T, r) {
  var N = T.N, list = [];
  for (var j = 0; j < N; j++) {
    if (T.rows[r][j] < -EPS) {
      var den = T.rows[r][j];
      list.push({ col: j, ratio: Math.abs(T.obj[j].a / den),
                  ratioM: Math.abs(T.obj[j].b / den), ok: true });
    } else {
      list.push({ col: j, ratio: null, ratioM: null, ok: false });
    }
  }
  return list;
}

/* 从比值表里挑最小的那一列入基（M 项优先）；没有可用的列返回 −1 */
function dualEnter(list) {
  var best = null, col = -1;
  for (var i = 0; i < list.length; i++) {
    if (!list[i].ok) continue;
    var a = list[i].ratio, b = list[i].ratioM;
    if (best === null || b < best.b - 1e-12 ||
        (Math.abs(b - best.b) <= 1e-12 && a < best.a - 1e-12)) {
      best = { a: a, b: b }; col = list[i].col;
    }
  }
  return col;
}

/* =========================================================================
   4. 从表里读出解与目标值（沿用内核的约定：obj[N] 存 −z）。
      没有换成内核的 readOut：它返回整个 SolveResult，而且会按「基里残留取正值的
      人工变量」把 status 改判成无可行解、把目标值置空 —— 本模块只有取正才算
      不可行（取 0 时解照读），界面上显示的字符串也不一样，所以按本模块要的
      四个字段（解 / 目标值 / 基名 / 松弛变量）自己读一遍。
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

/* ---- ① 目标函数系数变化（教材 2.5.2 非基变量系数 / 2.5.4 基变量系数） ----
   教材把这一类按「改的是谁的系数」拆成两小节，因为**判据完全不同**：

     · 改的是**非基变量**的 c_j —— 它只出现在自己那一列的检验数里：
         σ′_j = c′_j − z_j ,  z_j = c_B·(B⁻¹P_j)
       c_B 没动，z_j 原封不动，所以**只需重算那一列**。

     · 改的是**基变量**的 c_j —— 它进的是 c_B，而 z_j = c_B·(B⁻¹P_j) 里每一项都含 c_B，
       所以**σ 的整行都要重算**：σ′_j = σ_j − Δ·(B⁻¹P_j)_k 。
       （被改的那一列是特例：c′_j 自己也加了 Δ，与 z′_j 里的 Δ 正好抵消，仍有 σ′_j = 0。）

   两种情形有个共同结论：**右端项 B⁻¹b 与 c 无关**，所以只要基仍然最优，
   **解本身不变**，变的只是目标值；若改的是非基变量，它还取 0，连目标值也不变。
   ========================================================================= */
function sensChangeC(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  newProb.c = scenario.c.map(Number);
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('改动后的条件不合法（系数个数或数值对不上），无法建立标准型。');

  var baseRes = simplexSolve(baseProblem);
  var baseModel = sensBuildModel(baseProblem);
  var baseNames = sensBasisNames(baseRes);

  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在改动后无法定位（变量名对不上）');
  var T = sensTableau(model, basisCols);
  if (!T) return sensFail('原最优基在改动后无法构造（基矩阵奇异）');
  var baseT = sensTableau(baseModel, basisCols);
  if (!baseT) return sensFail('原最优表构造失败');

  /* 逐个数一变，基数按「是不是基变量」归到两个块里 */
  var nbLines = [], bLines = [], changed = false, hasBasic = false, hasNonBasic = false;
  for (var j = 0; j < model.n; j++) {
    var oldC = Number(baseProblem.c[j]), newC = Number(newProb.c[j]);
    if (Math.abs(newC - oldC) < 1e-12) continue;      // 这个系数没动
    var d = newC - oldC;
    var k = basisCols.indexOf(j);

    if (k === -1) {
      /* --- 非基变量：只影响它自己那一列的检验数 --- */
      hasNonBasic = true;
      var zj = sensZj(model, T, j);
      var sig = T.obj[j];                              // 新表里已经算好的 σ′_j
      var l = 'x' + (j + 1) + '：c' + sub(j + 1) + ' 由 ' + fmtNum(oldC) + ' 改为 ' + fmtNum(newC)
        + '　→　σ′' + sub(j + 1) + ' = c′' + sub(j + 1) + ' − z' + sub(j + 1) + ' = '
        + fmtPair(model.cObj[j]) + ' − ' + fmtPair(zj) + ' = ' + fmtPair(sig);
      if (pIsPos(sig)) { changed = true; l += ' > 0 → 这一列能进基，最优解要改'; }
      else { l += ' ≤ 0 → 仍不进基'; }
      nbLines.push(l);
    } else {
      /* --- 基变量：c_B 变了 → σ 整行重算 --- */
      hasBasic = true;
      var who = [];
      for (var jj = 0; jj < model.N; jj++) if (pIsPos(T.obj[jj])) who.push('x' + (jj + 1));
      var l2 = 'x' + (j + 1) + '：c' + sub(j + 1) + ' 由 ' + fmtNum(oldC) + ' 改为 ' + fmtNum(newC)
        + '，Δ = ' + fmtNum(d) + '。它是第 ' + (k + 1) + ' 个基变量，进了 c_B，'
        + '所以**σ 的整行都要重算**：σ′ⱼ = σⱼ − Δ·(B⁻¹Pⱼ)' + sub(k + 1) + '。';
      l2 += who.length
        ? '重算后 σ′ 变正的列有 ' + who.join('、') + ' → 最优解要改'
        : '重算后所有 σ′ⱼ ≤ 0 → 原基仍是最优基';
      bLines.push(l2);
      if (who.length) changed = true;
    }
  }

  var blocks = [];
  if (nbLines.length) blocks.push({ label: '非基变量的系数（教材 2.5.2）', lines: nbLines });
  if (bLines.length) blocks.push({ label: '基变量的系数（教材 2.5.4）', lines: bLines });

  var lines = [];
  if (!blocks.length) lines.push('这次没有改动任何目标函数系数，最优解与目标值都不变。');

  var concl;
  if (changed) {
    concl = '最优基改变，在原最优表上继续迭代（用原始单纯形法）';
  } else if (blocks.length) {
    /* B⁻¹b 与 c 无关：只要基还最优，解就不动 */
    concl = '最优基不变；右端项 B⁻¹b 与 c 无关，所以最优解不变'
      + (hasNonBasic && !hasBasic
          ? '，而且改的是非基变量、它仍取 0，目标值也不变'
          : '，只有目标值随新系数变化');
  } else {
    concl = '没有变化';
  }

  var judgement = {
    changed: changed,
    title: '检验数检验',
    head: '把新系数代回原最优表，检查检验数 σ′ⱼ = c′ⱼ − zⱼ 有没有变正：',
    blocks: blocks,
    lines: lines,
    conclusion: concl
  };
  return sensFinish(model, T, judgement, 'c', '目标函数系数变化', { newProblem: newProb });
}

/* ---- ② 右端项变化 ---- */
function sensChangeB(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  scenario.rhs.forEach(function (v, i) { newProb.constraints[i].rhs = Number(v); });
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('改动后的条件不合法（系数个数或数值对不上），无法建立标准型。');

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

/* ---- ② 技术系数 a_ij 变化 ----
   判据的差别比改 c 还大，教材同样分成两种情形：

     · x_j 是**非基变量** → 基矩阵 B 的列全是基变量的列，P_j 不在其中，
       所以 B、B⁻¹、x_B、z **全都不变**，只有 P_j 那一列变 → 只有 σ_j 会动：
         σ′_j = c_j − c_B·(B⁻¹P′_j)
       又因为 x_j = 0，它在约束里的那一项恒等于 0 —— 连约束都没被改动。

     · x_j 是**基变量**（设在第 k 行）→ B 的第 k 列**正是** P_j，它一变 B 就变、
       B⁻¹ 跟着变，于是**整张表（每一行、x_B、σ 全部）都要重算**。
       重算后：x′_B 出现负分量 → 失去可行性（该用对偶单纯形法）；
                 σ′ 出现正分量 → 失去最优性（该用原始单纯形法）。
       **两者同时坏掉时，两种局部迭代法都不适用**，只能重新求解。
   ========================================================================= */
function sensChangeA(baseProblem, scenario) {
  var i = Number(scenario.con), j = Number(scenario.v), val = Number(scenario.value);
  var newProb = sensClone(baseProblem);
  var oldA = Number(baseProblem.constraints[i].coef[j]);
  newProb.constraints[i].coef[j] = val;
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('改动后的条件不合法（系数个数或数值对不上），无法建立标准型。');

  var baseRes = simplexSolve(baseProblem);
  var baseNames = sensBasisNames(baseRes);
  var basisCols = sensMapBasis(model, baseNames);
  if (basisCols === null) return sensFail('原最优基在新问题里无法定位（变量名对不上）');

  var k = basisCols.indexOf(j);
  var isBasic = (k !== -1);
  var lines = [], changed, restart = false, negRow = -1, posCol = -1;

  var T = sensTableau(model, basisCols);
  if (T === null) {
    /* 改完之后原基的基矩阵奇异（列变得线性相关）→ 局部修改法无从谈起 */
    if (!isBasic) return sensFail('改完之后原最优基的基矩阵变成奇异矩阵，这个基不能再用，需要重新求解');
    lines.push('x' + (j + 1) + ' 是**基变量**，改的是它自己的列。重算后发现'
      + '原最优基的基矩阵 B 已经**奇异**（列之间线性相关），它不再能充当一组基 —— '
      + '局部修改法（原始/对偶单纯形二选一）无从谈起，只能重新求解。');
    lines.push('下面从标准初始基（松弛/剩余变量 + 人工变量）重跑一遍大 M 法。');
    var T0 = sensTableau(model, model.basis0);
    if (!T0) return sensFail('重新求解时无法构造初始表');
    return sensFinish(model, T0, {
      changed: true, title: '技术系数检验',
      head: '把 a' + sub(i + 1) + sub(j + 1) + '（第 ' + (i + 1) + ' 条约束里 x' + (j + 1)
        + ' 的系数）由 ' + fmtNum(oldA) + ' 改成 ' + fmtNum(val) + '，看它对原最优表的影响：',
      lines: lines, conclusion: '原最优基被破坏（基矩阵奇异），改为重新求解'
    }, 'a', '技术系数 a_ij 变化',
      { newProblem: newProb, restart: true, aInfo: { i: i, j: j, oldA: oldA, newA: val } });
  }

  if (!isBasic) {
    /* ---------- 非基变量的列：只动这一列 ---------- */
    var colNums = [];
    for (var r = 0; r < model.m; r++) colNums.push(T.rows[r][j]);
    var zj = sensZj(model, T, j);
    var sig = pSub(model.cObj[j], zj);
    changed = pIsPos(sig);

    lines.push('x' + (j + 1) + ' 是**非基变量**，它的列 P' + sub(j + 1)
      + ' 不在基矩阵 B 里 → B、B⁻¹、x_B、z 全都不变，**只有这一列要换**，'
      + '所以只需重算它自己的检验数：');
    lines.push('σ′' + sub(j + 1) + ' = c' + sub(j + 1) + ' − c_B·(B⁻¹P′' + sub(j + 1) + ') = '
      + fmtPair(model.cObj[j]) + ' − ' + fmtPair(zj) + ' = ' + fmtPair(sig));
    lines.push('其中 B⁻¹P′' + sub(j + 1) + ' = ' + vecStr(colNums)
      + '（原来的第 ' + (i + 1) + ' 行系数由 ' + fmtNum(oldA) + ' 改成 ' + fmtNum(val) + '，'
      + '这一列的值随之变化）');
    lines.push(changed
      ? 'σ′' + sub(j + 1) + ' > 0 → 这一列能进基，最优解要改，接**原始单纯形法**继续迭代。'
      : 'σ′' + sub(j + 1) + ' ≤ 0 → 这一列仍不进基。又因为 x' + (j + 1) + ' = 0，'
        + '它在约束 ' + (i + 1) + ' 里的那一项 a·x' + (j + 1) + ' 恒等于 0，'
        + '**约束其实一点没被改动** → 最优解与目标值都不变。');
  } else {
    /* ---------- 基变量的列：整张表重算 ---------- */
    lines.push('x' + (j + 1) + ' 是**基变量**（第 ' + (k + 1) + ' 行的基变量），'
      + '基矩阵 B 的第 ' + (k + 1) + ' 列**正是** P' + sub(j + 1) + '。'
      + '它一变 B 就变、B⁻¹ 跟着变，所以**整张表（每一行、x_B、σ 全部）都要重算**，'
      + '不能只看这一列。');
    if (model.m <= 4) lines.push('重算后 B⁻¹ = ' + matrixStr(T.Binv));

    var xB = [];
    for (var r2 = 0; r2 < model.m; r2++) {
      xB.push(T.rows[r2][model.N]);
      if (T.rows[r2][model.N] < -1e-9 && negRow === -1) negRow = r2;
    }
    for (var c2 = 0; c2 < model.N; c2++) if (pIsPos(T.obj[c2])) { posCol = c2; break; }

    lines.push('新右端项 x′_B = B⁻¹b = ' + vecStr(xB)
      + (negRow === -1
          ? ' ≥ 0 → 可行性没坏'
          : '，其中第 ' + (negRow + 1) + ' 行 = ' + fmtNum(xB[negRow]) + ' < 0 → **原基不再可行**'));
    lines.push('新检验数行 σ′ = c − c_B·B⁻¹A′：'
      + (posCol === -1
          ? '全部 σ′ⱼ ≤ 0 → 最优性没坏'
          : 'σ′' + sub(posCol + 1) + ' = ' + fmtPair(T.obj[posCol]) + ' > 0 → **原基不再最优**'));

    changed = (negRow !== -1 || posCol !== -1);
    if (negRow !== -1 && posCol !== -1) {
      restart = true;
      lines.push('两个条件**同时**被破坏：表既不可行又不最优。'
        + '原始单纯形法要求右端项非负、对偶单纯形法要求检验数非正，'
        + '**两种局部迭代法都用不上** —— 教材的做法是重新求解。'
        + '下面从标准初始基（松弛/剩余变量 + 人工变量）重跑一遍大 M 法。');
    } else if (negRow !== -1) {
      lines.push('只有可行性被破坏（检验数仍全 ≤ 0）→ 用**对偶单纯形法**在原表上继续迭代。');
    } else if (posCol !== -1) {
      lines.push('只有最优性被破坏（右端项仍全 ≥ 0）→ 用**原始单纯形法**在原表上继续迭代。');
    } else {
      lines.push('两个条件都没坏 → 原基仍是新问题的最优基，直接读出新解。');
    }
  }

  var Tuse = T;
  if (restart) {
    Tuse = sensTableau(model, model.basis0);          // 标准初始基（B = 单位阵）
    if (!Tuse) return sensFail('重新求解时无法构造初始表');
  }

  var judgement = {
    changed: changed,
    title: '技术系数检验',
    head: '把 a' + sub(i + 1) + sub(j + 1) + '（第 ' + (i + 1) + ' 条约束里 x' + (j + 1)
      + ' 的系数）由 ' + fmtNum(oldA) + ' 改成 ' + fmtNum(val)
      + '，看它对原最优表的影响：',
    lines: lines,
    conclusion: !changed ? '最优解与目标值都不变'
      : (restart ? '原表可行性与最优性同时被破坏，改为重新求解'
                 : '最优基改变，在原最优表上继续迭代')
  };
  return sensFinish(model, Tuse, judgement, 'a', '技术系数 a_ij 变化',
    { newProblem: newProb, restart: restart, aInfo: { i: i, j: j, oldA: oldA, newA: val } });
}

/* ---- ③ 增加一个约束 ---- */
function sensAddConstraint(baseProblem, scenario) {
  var newProb = sensClone(baseProblem);
  newProb.constraints.push({
    coef: scenario.coef.map(Number), rel: scenario.rel, rhs: Number(scenario.rhs)
  });
  var model = sensBuildModel(newProb);
  if (!model) return sensFail('新约束不合法（系数个数或数值对不上），无法并入原表。');
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

  /* 新表：前 mOld 行是原最优表，最后一行是新约束消除基变量后的结果。
     表对象带上 m / N —— 内核的 pivot / ratioTest / selectEnteringDantzig 要用 */
  var T = { rows: rows, obj: sensObjRow(model, rows, basis), basis: basis, m: model.m, N: N };

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
  if (!model) return sensFail('新增变量不合法（系数个数或数值对不上），无法并入原表。');

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
   6. 参数线性规划（教材 2.6）
   -------------------------------------------------------------------------
   前面几类都是「把某个系数改成一个新数」，这里改成一个**参数 λ**，
   要求的是「λ 在什么范围内最优基不变」，以及 λ 越过临界值后最优解怎么接着变。

     2.6.1 变量系数：c_j(λ) = c_j + λ·d_j
           σ_j(λ) = σ_j + λ·τ_j ，其中 τ_j = d_j − d_B·(B⁻¹P_j)
           要求所有 σ_j(λ) ≤ 0 → 交出一段 λ 区间。
           区间端点处某列的 σ 恰好为 0，让它入基即可（右端项 B⁻¹b 与 λ 无关、
           始终非负，所以用**原始单纯形法**，只需处理最小比值）。

     2.6.2 右边系数：b_i(λ) = b_i + λ·e_i
           此时 c 没变 → 检验数行与 λ 完全无关，σ ≤ 0 一路保持。
           x_B(λ) = B⁻¹b + λ·B⁻¹e ，要求所有分量 ≥ 0 → 交出一段 λ 区间。
           区间端点处某行取值恰好为 0，让它出基（检验数已经全部非正，
           所以用**对偶单纯形法**选入基列）。
   ========================================================================= */

/* λ 的零容差（旧实现里的 LAM_EPS）就是全局 EPS，两者同为 1e-9；
   「小于容差就当 0」用 util.js 的 clampSign，「a + b·λ」的显示用 format.js 的
   fmtAff（与原实现逐字相同）—— 这两个小工具不再各留一份。 */

/* 把若干条限制（a + b·λ ≤ 0 或 ≥ 0）交成一个 λ 区间；交不出来返回 null。
   b > 0 的式子给上界，b < 0 的给下界，b = 0 的要求自身成立。 */
function lamInterval(list, sense) {
  var lo = -Infinity, hi = Infinity;
  for (var i = 0; i < list.length; i++) {
    var a = list[i].a, b = list[i].b;
    if (sense === 'ge') { a = -a; b = -b; }
    if (Math.abs(b) < EPS) {
      if (a > EPS) return null;                     // 与 λ 无关却恒大于 0
    } else if (b > 0) {
      var t = -a / b;
      if (t < hi) hi = t;
    } else {
      var t2 = -a / b;
      if (t2 > lo) lo = t2;
    }
  }
  if (hi < lo - 1e-7) return null;
  return { lo: lo, hi: hi };
}

/* σ(λ) 的 λ 系数：τ_j = d_j − d_B·(B⁻¹P_j)。
   松弛/人工变量的目标系数里没有参数，所以 d_B 对它们取 0。 */
function paramTau(model, T, basis, d, j) {
  var acc = (j < model.n ? d[j] : 0);
  for (var i = 0; i < model.m; i++) {
    var bc = basis[i];
    if (bc >= model.n) continue;
    acc -= d[bc] * T.rows[i][j];
  }
  return clampSign(acc);
}

/* B⁻¹·v：矩阵乘向量走 util.js 的 matVec，末了把 1e-12 以下的毛刺归零 ——
   与旧实现在每个分量上直接归零等价，λ 区间与 x(λ)/z(λ) 的数字一字不变。 */
function binvVec(Binv, v) {
  var out = matVec(Binv, v);
  for (var i = 0; i < out.length; i++) out[i] = snapTiny(out[i]);
  return out;
}

/* 把「这一组基在 λ 上成立的那一段」整理成一条记录 */
function paramSeg(model, T, basis, kind, data, iv, edge) {
  var n = model.n;
  var be = (kind === 'b') ? binvVec(T.Binv, data) : null;
  var xAff = [], i, j;
  for (j = 0; j < n; j++) xAff.push({ a: 0, b: 0 });
  for (i = 0; i < model.m; i++) {
    if (basis[i] < n) xAff[basis[i]] = { a: T.rows[i][model.N], b: be ? be[i] : 0 };
  }
  /* z(λ) = Σ c_j(λ)·x_j(λ)，只累加决策变量（松弛/人工变量目标系数为 0）。
     这里算的是**内部**目标值（min 问题在建表时已被取负），最后由调用方换算回去。 */
  var zAff = { a: 0, b: 0 };
  for (j = 0; j < n; j++) {
    var cInt = model.cObj[j].a;                  // 决策变量不带 M 项
    var xj = xAff[j];
    zAff.a += cInt * xj.a;
    if (kind === 'c') zAff.b += data[j] * xj.a;
    else zAff.b += cInt * xj.b;
  }
  return {
    lo: iv.lo, hi: iv.hi, edge: edge,
    basisNames: basis.map(function (c) { return model.vars[c].name; }),
    x: xAff, z: zAff,
    entering: null, leaving: null, note: ''
  };
}

/* 从某一组基出发，沿 λ 增大（dir=+1）或减小（dir=-1）方向逐段走下去 */
function walkParam(model, startBasis, kind, data, dir) {
  var basis = startBasis.slice();
  var segs = [];
  var cur = 0;

  for (var it = 0; it < 80; it++) {
    var T = sensTableau(model, basis);
    if (!T) return { segs: segs, broken: '基矩阵奇异' };

    /* 把所有「必须 ≤ 0」或「必须 ≥ 0」的量写成 a + b·λ */
    var list = [], i, j, be = null;
    if (kind === 'c') {
      for (j = 0; j < model.N; j++) {
        if (Math.abs(T.obj[j].b) > EPS) continue;   // 带 M 项 → 对 λ 不构成限制
        list.push({ a: T.obj[j].a, b: paramTau(model, T, basis, data, j), col: j });
      }
    } else {
      be = binvVec(T.Binv, data);
      for (i = 0; i < model.m; i++) {
        list.push({ a: T.rows[i][model.N], b: be[i], row: i });
      }
      /* 还有一条容易被忽略的限制：右端项为负的约束在建表时被「整行取负」过，
         只有取负之后仍然非负，同一套标准化形式才一直成立。
         一旦 b_i(λ) 变号，这套形式就整体换了 —— 所以把「内部右端项保持非负」
         也当成 λ 的限制加进来。它给出的边界不是换基点，而是本模块的适用边界。 */
      for (i = 0; i < model.m; i++) {
        if (Math.abs(data[i]) < EPS) continue;
        list.push({ a: model.b0[i], b: data[i], norm: true, row: i });
      }
    }

    var iv = lamInterval(list, kind === 'c' ? 'le' : 'ge');
    if (!iv) return { segs: segs, broken: 'λ = 0 处原基就不满足条件（数值上不该发生）' };

    /* 基里残留取值为 0 的人工变量：它在新条件下必须**仍然恰好是 0**。
       这个限制与「往哪个方向走」无关，而且必须是**等式**而不是不等式：
         · 变成正值 → 原约束并没有被真正满足（新条件下无可行解）；
         · 变成负值 → 原基不再可行（理论上能用对偶单纯形把它顶出基，但这条路径未实现）。
       所以只要它随 λ 会变（ab ≠ 0），这组基就**只在 λ = 0 这一点上成立** —— 把区间钉住。

       ★ 两个坑：
       ① 必须同时把 lo 和 hi 都钉到 0，不能只夹当前行走方向。同一个基会被「向上」和
          「向下」两次行走各记录一遍，只夹一个方向的话，另一个方向记下来的那份仍带着过宽
          的区间，合并时取的是它 —— 夹好的那份被丢掉，于是把「无可行解」的 λ 区间
          当成最优区间报了出去。（真实踩过：随机题里约一半的运行会失败。）
       ② 底下立刻要判一次空区间：钉完之后可能落在原区间之外。 */
    var artBlock = '';
    if (kind === 'b') {
      for (i = 0; i < model.m; i++) {
        if (model.vars[basis[i]].kind !== 'a') continue;
        var ab = be[i];
        if (Math.abs(ab) < EPS) continue;
        iv.lo = Math.max(iv.lo, 0);
        iv.hi = Math.min(iv.hi, 0);
        artBlock = '基里残留的人工变量 ' + model.vars[basis[i]].name
          + ' 会随 λ 变成非零值，而人工变量必须恒为 0（它一旦取正值，就说明原约束并没有'
          + '被真正满足）。因此这组基只在 λ = 0 处成立，这个方向只能分析到这一点为止。';
      }
    }
    if (iv.hi < iv.lo - 1e-9) return { segs: segs, ended: artBlock || '区间为空' };

    segs.push(paramSeg(model, T, basis, kind, data, iv, cur));
    if (artBlock) { segs[segs.length - 1].note = artBlock; return { segs: segs, ended: artBlock }; }

    /* 这个方向走到头了？ */
    if (dir > 0 ? (iv.hi === Infinity) : (iv.lo === -Infinity)) return { segs: segs };

    var edge = dir > 0 ? iv.hi : iv.lo;

    /* 找出在边界上恰好取 0 的那一条 → 它决定谁进谁出 */
    var hits = [];
    for (i = 0; i < list.length; i++) {
      if (Math.abs(list[i].b) < EPS) continue;
      if (Math.abs(-list[i].a / list[i].b - edge) > 1e-7) continue;
      var good = (kind === 'c')
        ? (dir > 0 ? list[i].b > 0 : list[i].b < 0)     // σ 上界来自 b>0 的列
        : (dir > 0 ? list[i].b < 0 : list[i].b > 0);    // x_B 下界来自 b<0 的行
      if (good) hits.push(list[i]);
    }
    if (!hits.length) return { segs: segs };             // 退化：边界没有可动的列

    /* 撞上的是「标准化适用边界」就不能当换基点处理 —— 直接停，并说明原因。
       （越过它之后建表用的整行取负会翻转，后面算出来的东西没有意义。） */
    var normHit = hits.filter(function (h) { return h.norm; })[0];
    if (normHit) {
      segs[segs.length - 1].note = 'λ 越过这个值后，约束 ' + (normHit.row + 1)
        + ' 的右端项会变号，标准化形式随之改变 —— 本模块在此停止，越界部分请手工复核';
      return { segs: segs, ended: '右端项变号' };
    }
    var pick = hits[0];

    var ent = -1, lv = -1, why = '';
    if (kind === 'c') {
      ent = pick.col;
      var bestR = Infinity;
      for (i = 0; i < model.m; i++) {
        if (T.rows[i][ent] > EPS) {
          var th = T.rows[i][model.N] / T.rows[i][ent];
          if (th < bestR - EPS) { bestR = th; lv = i; }
        }
      }
      if (lv === -1) { why = '该列在表中没有正分量，λ 越界后目标值无界'; }
    } else {
      lv = pick.row;
      ent = dualEnter(dualRatioList(T, lv));
      if (ent === -1) { why = '该行在表中没有负系数，对偶比值算不出来 → λ 越界后无可行解'; }
    }

    var last = segs[segs.length - 1];
    last.edge = edge; last.entering = ent; last.leaving = lv;
    if (why) { last.note = why; return { segs: segs, ended: why }; }

    /* 防止原地打转（退化时边界值可能等于当前 λ） */
    if (dir > 0 ? (edge <= cur + 1e-9) : (edge >= cur - 1e-9)) {
      return { segs: segs, ended: '临界值处出现退化，λ 不再前进（该基与相邻基在这一点上重合）' };
    }
    cur = edge;
    var nb = basis.slice();
    nb[lv] = ent;
    basis = nb;
  }
  return { segs: segs, ended: '段数超过上限，提前停止' };
}

/* 统一入口：参数线性规划（2.6.1 变量系数 / 2.6.2 右边系数） */
function sensParam(baseProblem, scenario) {
  var kind = scenario.kind;                     // 'c' 或 'b'
  var res0 = simplexSolve(baseProblem);
  if (res0.status !== 'optimal') {
    return sensFail('λ = 0 时基准题没有最优解，参数线性规划要从一张最优表出发。');
  }
  var model = sensBuildModel(baseProblem);
  var startBasis = sensMapBasis(model, sensBasisNames(res0));
  if (startBasis === null) return sensFail('λ = 0 的最优基无法定位。');

  var data, warn = '';
  if (kind === 'c') {
    var dUser = (scenario.d || []).map(Number);
    if (dUser.length !== model.n) return sensFail('λ 的系数个数要和变量个数一致。');
    if (!dUser.some(function (v) { return Math.abs(v) > 1e-12; })) {
      return sensFail('至少要给一个变量的系数填上 λ 的系数，否则 λ 不影响任何东西。');
    }
    /* 内部问题统一按 max 处理（min 已取负），所以 λ 的系数也要跟着取负 */
    data = dUser.map(function (v) { return model.swapSign * v; });
  } else {
    var eUser = (scenario.e || []).map(Number);
    if (eUser.length !== model.m) return sensFail('λ 的系数个数要和约束条数一致。');
    if (!eUser.some(function (v) { return Math.abs(v) > 1e-12; })) {
      return sensFail('至少要给一个右端项填上 λ 的系数，否则 λ 不影响任何东西。');
    }
    /* 右端项为负的约束会被整行取负，参数方向也要跟着换算回去 */
    data = eUser.map(function (v, i) { return model.flipSign[i] * v; });
  }

  var up = walkParam(model, startBasis, kind, data, +1);
  var down = walkParam(model, startBasis, kind, data, -1);

  /* 向上走的第一段与向下走的第一段是同一组基，合并时去掉一个 */
  var segs = down.segs.slice().reverse().concat(up.segs.slice(1));
  if (!segs.length) return sensFail('没能算出任何 λ 区间。');

  /* 换算回用户口径：解不变；目标值在 min 方向要反号 */
  var sign = model.swapSign;
  segs.forEach(function (s) {
    s.z = { a: clampSign(sign * s.z.a), b: clampSign(sign * s.z.b) };
    s.x.forEach(function (v) { v.a = clampSign(v.a); v.b = clampSign(v.b); });
  });

  /* 右端项含参数时的两条提醒（只对 2.6.2 有意义）：
     ① 原始右端项为负的约束在标准化时被整行取负过，λ 的方向已换算，但要让学生知道；
     ② 若某条约束的右端项在算出的 λ 范围内会变号，那么「整行取负」这个规范化动作
        本身会随 λ 切换，本模块只按 λ = 0 的形式处理 —— 这种情况必须明说，不能假装没发生。 */
  if (kind === 'b') {
    var LO = segs[0].lo, HI = segs[segs.length - 1].hi;
    var notes = [];
    for (var i3 = 0; i3 < model.m; i3++) {
      var bb = Number(baseProblem.constraints[i3].rhs), ee = eUser[i3];
      if (Math.abs(ee) < 1e-12) continue;
      if (bb < -EPS) {
        notes.push('约束 ' + (i3 + 1) + ' 的原始右端项是负的（' + fmtNum(bb)
          + '），标准化时被整行取负过，λ 的系数已按同一方向换算。');
      }
      var cross = -bb / ee;                       // b_i(λ) 变号的位置
      if (cross > LO + 1e-7 && cross < HI - 1e-7) {
        notes.push('约束 ' + (i3 + 1) + ' 的右端项在 λ ≈ ' + fmtNum(cross)
          + ' 处变号，而它正好落在下面算出的 λ 范围内 —— 标准化时的「整行取负」'
          + '在该点前后会切换，本模块只按 λ = 0 的形式处理，越界部分请手工复核。');
      }
    }
    if (notes.length) warn = '注意：' + notes.join('；');
  }

  return {
    ok: true, kind: kind, parameter: true,
    nDecision: model.n, mConstraints: model.m, N: model.N,
    vars: model.vars, direction: baseProblem.direction, swapSign: sign,
    varNames: (kind === 'c' ? dUser : eUser),
    segments: segs,
    warn: warn,
    upEnded: up.ended || null, downEnded: down.ended || null,
    broken: up.broken || down.broken || null
  };
}

/* =========================================================================
   7. 工具
   ========================================================================= */
function sensClone(p) {
  /* 结构的定义只留在 model.js 一处 */
  return createLPProblem(p.direction, p.c.map(Number), p.constraints.map(function (k) {
    return createConstraint(k.coef.map(Number), k.rel, Number(k.rhs));
  }));
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
    acc = pAdd(acc, pMul(model.cObj[T.basis[i]], T.rows[i][j]));
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
  else if (scenario.type === 'a') r = sensChangeA(baseProblem, scenario);
  else if (scenario.type === 'b') r = sensChangeB(baseProblem, scenario);
  else if (scenario.type === 'add-con') r = sensAddConstraint(baseProblem, scenario);
  else if (scenario.type === 'add-var') r = sensAddVar(baseProblem, scenario);
  else return { ok: false, message: '未知的分析类型。' };
  if (r && r.ok) r.base = { solution: base.solution, objective: base.objective,
                            basisNames: sensBasisNames(base), dual: base.dual };
  return r;
}

module.exports = {
  sensAnalyze: sensAnalyze,
  sensParam: sensParam,
  sensBuildModel: sensBuildModel,
  sensTableau: sensTableau,
  sensIterate: sensIterate,
  sensReadOut: sensReadOut,
  fmtAff: fmtAff
};
