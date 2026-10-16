/* =========================================================================
   场景式灵敏度分析
   -------------------------------------------------------------------------
   灵敏度分析在**原来的最优表**上做局部修改
   再继续迭代，支持以下变化：

     ① 目标函数系数变化 c（分别判断基变量与非基变量）
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
   两者同时越界时两种局部迭代法都不适用（需要重新求解，见 sensChangeA）。
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
      求解器，而是「内核四件套 + 对偶分支 + 过程说明」的组装，只剩两件内核没有的
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
         挑中一个人工变量入基 —— 这会使中间解不再是原问题的可行解。 */
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

module.exports = {
  sensBuildModel: sensBuildModel,
  sensTableau: sensTableau,
  snapTiny: snapTiny,
  sensObjRow: sensObjRow,
  sensIterate: sensIterate,
  dualRatioList: dualRatioList,
  dualEnter: dualEnter,
  sensReadOut: sensReadOut,
  sensClone: sensClone,
  sensBasisNames: sensBasisNames,
  sensMapBasis: sensMapBasis,
  sensZj: sensZj,
  sensZjOf: sensZjOf,
  nm: nm,
  sub: sub,
  vecStr: vecStr,
  fmtDualRatio: fmtDualRatio,
  matrixStr: matrixStr,
  sensFail: sensFail
};
