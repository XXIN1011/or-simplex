/* =========================================================================
   核心求解模块 —— 单纯形迭代内核（只依赖标准型数据，不碰输入、不碰界面）
   -------------------------------------------------------------------------
   本模块只做一件事：**在标准型上迭代到最优，并把中间过程记成快照**。
   输入输出全是数据：入参是 core/parse.js 产出的 StandardForm，
   出参是 core/model.js 的 SolveResult。没有 console、没有 DOM、没有文件。

   迭代内核（与重构前逐行一致，数学逻辑一字未改）：
     6.1 选入基   σ_j > 0 中最大者（Dantzig 规则）
     6.2 比值检验 最小比值 θ = b_i / a_ie，仅对 a_ie > 0 的行参与
     6.3 记快照   含 θ = 0 的「退化」标注
     6.4 枢轴变换 高斯消元把入基列化为单位向量，同步更新 σ 行
     6.5 终止     ① 全部 σ ≤ 0 → 最优
                  ② 入基列无正系数 → 无界；**但基中若仍有取正的人工变量，
                     结论是无可行解**（大 M 法是在含人工变量的扩展问题上迭代的，
                     扩展问题无界不等于原问题无界）
                  ③ 迭代超过 maxIter → 迭代超限（退化可能引起循环）

   扩展点（开闭原则）：迭代内核被拆成 4 个可替换的纯函数 ——
     selectEntering(form)   入基规则（默认 Dantzig；换成 Bland 规则即可防循环）
     ratioTest(form, e)     比值检验（对偶单纯形会把这里换成「按行」的规则）
     pivot(form, r, e)      枢轴变换（所有变体共用同一份实现）
     solveStandardForm(form, opts)  主循环，接受 opts.selectEntering / opts.maxIter
   因此后续加对偶单纯形、两阶段法时，**不必修改本文件里任何一行数值代码**，
   新算法在自己的模块里组合这四个函数即可（见 core/scenario.js、core/integer.js 的用法）。

   ★ 兼容性承诺：simplexSolve(problem) 的返回值与重构前逐字节一致
     （含 ok / status / 每一步的 rows 与 obj / 中文说明文案），
     由 test/algorithm/deep-snapshot.js 对 2000 道随机题的全部迭代做哈希对拍。
   ========================================================================= */
'use strict';

var U = require('./util.js');
var model = require('./model.js');
var parse = require('./parse.js');
var errors = require('./errors.js');
var sensitivityAnalysis = require('./sensitivity.js').sensitivityAnalysis;
var fmtNum = require('./format.js').fmtNum;

var EPS = U.EPS, pSub = U.pSub, pMul = U.pMul, pCmp = U.pCmp,
    pIsPos = U.pIsPos, pIsZero = U.pIsZero, matInverse = U.matInverse;

/* 迭代上限：退化（θ = 0 的枢轴）理论上可能循环，宁可报「未收敛」也不要死循环 */
var DEFAULT_MAX_ITER = 200;

/* 人工变量「还留在基里且取正值」的判定阈值 —— 与重构前一致 */
var ART_EPS = 1e-7;

/* ---------------- 迭代内核的 4 个可替换部件 ---------------- */

/**
 * selectEnteringDantzig —— 默认入基规则：σ_j > 0 中最大者。
 * @param {object} form 标准型
 * @returns {number} 入基列下标；全部 σ ≤ 0 时返回 −1（表示已达到最优）
 */
function selectEnteringDantzig(form) {
  var N = form.N, obj = form.obj;
  var e = -1, best = null;
  for (var je = 0; je < N; je++) {
    if (pIsPos(obj[je]) && (best === null || pCmp(obj[je], best) > 0)) {
      best = obj[je]; e = je;
    }
  }
  return e;
}

/**
 * ratioTest —— 最小比值规则：θ_i = b_i / a_ie（仅 a_ie > 0 的行参与）。
 * @param {object} form 标准型
 * @param {number} e 入基列下标
 * @returns {{ratios:object[], r:number, minRatio:number}} ratios 逐行记账（供界面展示算式），
 *          r 出基行号（−1 表示该列没有正系数），minRatio 最小比值（可能是 Infinity）
 */
function ratioTest(form, e) {
  var m = form.m, N = form.N, rows = form.rows;
  var ratios = [], r = -1, minRatio = Infinity;
  for (var it = 0; it < m; it++) {
    if (rows[it][e] > EPS) {
      var th = rows[it][N] / rows[it][e];
      ratios.push(model.createRatio(it, th, true));
      if (th < minRatio - EPS) { minRatio = th; r = it; }
    } else {
      ratios.push(model.createRatio(it, null, false));
    }
  }
  return { ratios: ratios, r: r, minRatio: minRatio };
}

/**
 * pivot —— 枢轴变换：把入基列化为单位向量（该行归一、其余行消元），并同步更新 σ 行。
 * @param {object} form 标准型（行与 σ 就地修改）
 * @param {number} r 枢轴行
 * @param {number} e 枢轴列
 * @returns {number} 枢轴元素的原值（界面要把它显示出来）
 */
function pivot(form, r, e) {
  var m = form.m, N = form.N, rows = form.rows, obj = form.obj, basis = form.basis;
  var p = rows[r][e];
  for (var jp = 0; jp <= N; jp++) rows[r][jp] /= p;
  for (var ip = 0; ip < m; ip++) {
    if (ip === r) continue;
    var f = rows[ip][e];
    if (f === 0) continue;
    for (var jf = 0; jf <= N; jf++) rows[ip][jf] -= f * rows[r][jf];
  }
  var fo = obj[e];
  for (var jg = 0; jg <= N; jg++) obj[jg] = pSub(obj[jg], pMul(fo, rows[r][jg]));
  basis[r] = e;
  return p;
}

/* ---------------- 主循环 ---------------- */

/**
 * solveStandardForm —— 在标准型上迭代求解（扩展算法也走这个入口）。
 * @param {object} form core/parse.js 产出的标准型（会被就地迭代，调用方需先克隆）
 * @param {object} [opts]
 * @param {number} [opts.maxIter=200] 迭代上限
 * @param {Function} [opts.selectEntering] 自定义入基规则 (form) => 列下标 | −1
 * @returns {object} SolveResult（core/model.js 定义）
 */
function solveStandardForm(form, opts) {
  opts = opts || {};
  var maxIter = (opts.maxIter === undefined) ? DEFAULT_MAX_ITER : opts.maxIter;
  var selectEntering = opts.selectEntering || selectEnteringDantzig;

  var m = form.m, N = form.N, n = form.n;
  var vars = form.vars, rows = form.rows, obj = form.obj, basis = form.basis;
  var steps = [];
  var status = errors.STATUS.OPTIMAL;
  var iter = 0;

  while (true) {
    /* 6.1 找入基变量 */
    var e = selectEntering(form);

    if (e === -1) {   /* 全部 σ_j ≤ 0 → 最优 */
      steps.push(model.createSnapshot(form, {
        iter: iter,
        entering: null, leaving: null, pivot: null, ratios: null,
        note: '所有检验数 σⱼ ≤ 0，没有可改进的方向，当前基可行解就是最优解。'
      }));
      break;
    }

    /* 6.2 比值检验（最小比值规则） */
    var rt = ratioTest(form, e);
    var ratios = rt.ratios, r = rt.r, minRatio = rt.minRatio;

    if (r === -1) {   /* 入基列没有正系数 → 要么原问题无界，要么原问题无可行解 */
      /* 关键：大M法是在"含人工变量的扩展问题"上迭代的。若此刻基中仍残留取正值的
         人工变量，说明原约束根本不能同时满足，沿这条射线走只会让人工变量越来越大
         （依然违背原约束），因此正确结论是【无可行解】，而不是无界。 */
      var artPos = -1;
      for (var ia3 = 0; ia3 < m; ia3++) {
        if (vars[basis[ia3]].kind === 'a' && rows[ia3][N] > ART_EPS) { artPos = ia3; break; }
      }
      if (artPos >= 0) {
        steps.push(model.createSnapshot(form, {
          iter: iter,
          entering: e, leaving: null, pivot: null, ratios: ratios,
          note: '入基变量 ' + vars[e].name + ' 所在列没有正的系数，比值 θ 无法计算；' +
                '但此时人工变量 ' + vars[basis[artPos]].name + ' 仍取正值（= ' + fmtNum(rows[artPos][N]) + '），' +
                '说明原问题的约束无法同时满足 → 问题为**无可行解**。'
        }));
        status = errors.STATUS.INFEASIBLE;
        break;
      }
      steps.push(model.createSnapshot(form, {
        iter: iter,
        entering: e, leaving: null, pivot: null, ratios: ratios,
        note: '入基变量 ' + vars[e].name + ' 所在列中没有任何正的系数，比值 θ 无法计算 → ' +
              '该变量可以无限增大而始终满足约束，目标函数值无上界，问题为**无界解**。'
      }));
      status = errors.STATUS.UNBOUNDED;
      break;
    }

    /* 6.3 记录当前表 + 本步判定 */
    /* θ = 0 表示被顶出的基变量本来就是 0，这一步迭代不会改善目标值，称为「退化」 */
    var degenerate = (r >= 0 && minRatio < 1e-7);
    steps.push(model.createSnapshot(form, {
      iter: iter,
      entering: e, leaving: r, pivot: rows[r][e], ratios: ratios,
      degenerate: degenerate, note: ''
    }));

    /* 6.4 枢轴变换 */
    pivot(form, r, e);

    iter++;
    if (iter > maxIter) { status = errors.STATUS.ITERATION_LIMIT; break; }
  }

  return readOut(form, steps, status);
}

/* ---------------- 读解与结论 ---------------- */

/**
 * readOut —— 从终止时的基读出解、结论、对偶解与灵敏度区间。
 * = 原 simplexSolve 的第 7、8 步（逐行照搬）。
 * @param {object} form 终止时的标准型
 * @param {object[]} steps 迭代快照
 * @param {string} status 结束时的 status（可能是 optimal / unbounded / infeasible / iteration-limit）
 * @returns {object} SolveResult
 */
function readOut(form, steps, status) {
  var m = form.m, n = form.n, N = form.N;
  var vars = form.vars, rows = form.rows, obj = form.obj, basis = form.basis;
  var c0 = form.c0, swapped = form.swapped, A0 = form.A0, flipSign = form.flipSign;

  /* ---- 7. 解与结论 ---- */
  var solution = new Array(n).fill(0);
  for (var iv = 0; iv < m; iv++) {
    if (basis[iv] < n) solution[basis[iv]] = rows[iv][N];
  }
  for (var iz = 0; iz < n; iz++) if (Math.abs(solution[iz]) < 1e-9) solution[iz] = 0;

  var artificialInBasis = false;
  for (var iba = 0; iba < m; iba++) {
    if (vars[basis[iba]].kind === 'a' && rows[iba][N] > ART_EPS) artificialInBasis = true;
  }

  var altOptimal = [];
  if (status === errors.STATUS.OPTIMAL && !artificialInBasis) {
    for (var jalt = 0; jalt < N; jalt++) {
      if (vars[jalt].kind === 'a') continue;
      if (basis.indexOf(jalt) !== -1) continue;
      if (pIsZero(obj[jalt])) altOptimal.push(jalt);
    }
  }

  var zStar = null;
  if (status === errors.STATUS.OPTIMAL && !artificialInBasis) {
    zStar = swapped ? obj[N].a : -obj[N].a;
    if (Math.abs(zStar) < 1e-9) zStar = 0;
  }

  var finalStatus = status;
  if (status === errors.STATUS.OPTIMAL && artificialInBasis) finalStatus = errors.STATUS.INFEASIBLE;

  /* ---- 8. 对偶解（影子价格）+ 灵敏度分析 ----
     B 取最终基在「标准化约束矩阵 A0」中对应的列。用原始目标系数 c0（而不是
     min 转换后的 -c0）来计算，这样 y_i 对 max / min 都直接等于「最优值对右端项的偏导」。

     最后乘 flipSign：前面把右端项为负的约束整行取负过（b_int = −b_user），
     所以按内部 b 算出的偏导要换回用户输入的 b，否则那条约束的影子价格符号会反。 */
  var dual = null, sensitivity = null, Binv = null;
  if (finalStatus === errors.STATUS.OPTIMAL && m > 0) {
    var B = [];
    for (var ib5 = 0; ib5 < m; ib5++) {
      var brow = [];
      for (var kb = 0; kb < m; kb++) brow.push(A0[ib5][basis[kb]]);
      B.push(brow);
    }
    Binv = matInverse(B);
    if (Binv) {
      var cB = basis.map(function (col) { return col < n ? c0[col] : 0; });
      dual = [];
      for (var jd5 = 0; jd5 < m; jd5++) {
        var acc = 0;
        for (var id5 = 0; id5 < m; id5++) acc += cB[id5] * Binv[id5][jd5];
        acc *= flipSign[jd5];
        dual.push(Math.abs(acc) < 1e-9 ? 0 : acc);
      }

      /* ---- 9. 灵敏度分析：c / b 的允许变化范围 ---- */
      if (n > 0) {
        sensitivity = sensitivityAnalysis({
          m: m, n: n, N: N, vars: vars, basis: basis,
          rows: rows, obj: obj, c0: c0, solution: solution,
          swapped: swapped, flipSign: flipSign, Binv: Binv, dual: dual,
          consRhs: form.consRhs, userRhs: form.userRhs
        });
      }
    }
  }

  return model.createSolveResult({
    status: finalStatus,
    direction: form.direction,
    swapped: swapped,
    vars: vars,
    nDecision: n,
    mConstraints: m,
    steps: steps,
    basis: basis,
    solution: solution,
    objective: zStar,
    dual: dual,
    sensitivity: sensitivity,
    artificialInBasis: artificialInBasis,
    altOptimal: altOptimal
  });
}

/**
 * simplexSolve —— 对外主入口（原 core/simplex-core.js 的同名函数，行为一字不变）。
 * @param {object} problem { direction:'max'|'min', c:number[], constraints:[{coef,rel,rhs}] }
 * @returns {object} 输入非法 → { ok:false, message }；
 *                   否则 → SolveResult（status ∈ optimal | infeasible | unbounded | iteration-limit）
 */
function simplexSolve(problem) {
  var parsed = parse.parseProblem(problem);
  if (!parsed.ok) return parsed;
  return solveStandardForm(parsed.form);
}

module.exports = {
  simplexSolve: simplexSolve,
  solveStandardForm: solveStandardForm,
  selectEnteringDantzig: selectEnteringDantzig,
  ratioTest: ratioTest,
  pivot: pivot,
  readOut: readOut,
  DEFAULT_MAX_ITER: DEFAULT_MAX_ITER
};
