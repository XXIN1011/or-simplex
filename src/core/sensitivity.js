/* =========================================================================
   灵敏度分析模块 —— 「保持当前最优基不变」时各系数允许的变化范围
   -------------------------------------------------------------------------
   这一段是从原 core/simplex-core.js 整体搬过来的（数学逐行未改），
   单独成模块的理由：它不是「求解」的一部分，而是求解**之后**对最优基的解读，
   调用方（界面 / CLI / 报告）可以只用它、也可以完全不用它。

   ① 目标函数系数 cⱼ：改基变量的 c 会让**所有**非基列的检验数一起平移，所以两端
      都可能有限；改非基变量的 c 只影响它自己的检验数，因此只有一侧有限——越过
      它那个变量就会入基。
   ② 右端项 bᵢ：由 x_B = B⁻¹b 推得，只要 x_B 保持非负，基就仍然最优可行；这段
      区间里影子价格 yᵢ 一直有效，z 也随 bᵢ 线性变化。

   推导全部在「max 化 + 标准化之后的问题」上做，最后换算回用户输入的原始 c 和 b：
     · min 问题的内部 c 是取过负的（swapSign = -1）
     · 右端项为负的约束被整行取负过（flipSign = ±1）
   这两处不换算回去，区间方向或符号就会反。

   ★ 两个容易踩的坑（都在下面代码里有注释）：
     · 带 M 项的检验数（基里残留人工变量时会出现）对任何有限改动都不会变号，
       构不成约束 —— 必须把它们排除在区间计算之外；
     · 基里取值为 0 的人工变量要求**严格等于 0**，而不只是「≥ 0」，
       否则算出来的区间里有些点根本不是原问题的可行解（区间给宽了）。
   ========================================================================= */
'use strict';

var EPS = require('./util.js').EPS;
var model = require('./model.js');

/**
 * sensitivityAnalysis —— 计算 c 与 b 的允许变化范围。
 * 调用时机：只有结论为 optimal、且 B 可逆时才有意义（由 core/simplex.js 负责判断）。
 * @param {object} env 求解结束时的环境快照
 * @param {number} env.m 约束个数
 * @param {number} env.n 决策变量个数
 * @param {number} env.N 变量总数
 * @param {object[]} env.vars 变量表（用 kind 区分 x / s / a）
 * @param {number[]} env.basis 最终基（变量列下标）
 * @param {number[][]} env.rows 最终单纯形表
 * @param {object[]} env.obj 最终检验数行（pair）
 * @param {number[]} env.c0 用户原始目标系数
 * @param {number[]} env.solution 最优解
 * @param {boolean} env.swapped min 问题是否被取负（true 表示内部 c = −用户 c）
 * @param {number[]} env.flipSign 各约束是否被整行取负（±1）
 * @param {number[][]} env.Binv 最终基矩阵的逆
 * @param {number[]|null} env.dual 影子价格
 * @param {number[]} env.consRhs 内部右端项
 * @param {number[]} env.userRhs 用户输入的右端项
 * @returns {{c:object[], b:object[], degenerate:boolean}} 逐变量的 c 区间、逐约束的 b 区间，
 *          以及「最优基里是否残留取值为 0 的人工变量」（退化 ⇒ 区间不唯一）的标志
 */
function sensitivityAnalysis(env) {
  var m = env.m, n = env.n, N = env.N;
  var vars = env.vars, basis = env.basis, rows = env.rows, obj = env.obj;
  var c0 = env.c0, solution = env.solution;
  var swapSign = env.swapped ? -1 : 1;     // 内部 c = swapSign · 用户 c
  var flipSign = env.flipSign;             // 内部 b = flipSign · 用户 b
  var Binv = env.Binv, dual = env.dual;

  function cl(v) { return Math.abs(v) < 1e-9 ? 0 : v; }

  /* 把「内部标准化空间的区间」换算回用户量纲：user = f · internal，f 为 ±1。
     f < 0 时端点要取负并交换，用 min/max 一并处理，±Infinity 也能正确保留。 */
  function toUser(f, IL, IU) {
    var p = f > 0 ? IL : -IU;
    var q = f > 0 ? IU : -IL;
    return { lo: Math.min(p, q), hi: Math.max(p, q) };
  }

  /* 最优性要求所有非基列 σⱼ ≤ 0。带 M 项的列（b 系数 ≠ 0）与人工变量列，对任何
     有限改动都不会变号，构不成约束；其余非基列才是真正会「卡住」区间的那些。 */
  var free = [];
  for (var j = 0; j < N; j++) {
    if (vars[j].kind === 'a') continue;
    if (basis.indexOf(j) !== -1) continue;
    if (Math.abs(obj[j].b) > EPS) continue;
    free.push(j);
  }

  /* ---- ① 目标函数系数 c 的允许范围 ---- */
  var cList = [];
  for (var k = 0; k < n; k++) {
    var pos = basis.indexOf(k);
    var curInt = swapSign * c0[k];
    var loD = -Infinity, hiD = Infinity;      // 内部 c_k 允许的增量 Δ

    if (pos === -1) {
      /* 非基变量：σ_k' = σ_k + Δ ≤ 0 → Δ ≤ −σ_k，下侧无界。
         但若 σ_k 带 M 项（基里残留人工变量时会这样），它的符号由 M 的系数决定，
         有限改动翻不动，因此这个 c 其实两侧都能任意变。 */
      if (Math.abs(obj[k].b) > EPS) { loD = -Infinity; hiD = Infinity; }
      else { hiD = -cl(obj[k].a); }
    } else {
      /* 基变量：σ_j' = σ_j − Δ·(B⁻¹Pⱼ)_p ≤ 0，逐列给出 Δ 的下界或上界 */
      for (var q = 0; q < free.length; q++) {
        var jj = free[q];
        var t = rows[pos][jj];
        if (t > EPS) {
          var lb = cl(obj[jj].a) / t;
          if (lb > loD) loD = lb;
        } else if (t < -EPS) {
          var ub = cl(obj[jj].a) / t;
          if (ub < hiD) hiD = ub;
        }
      }
    }

    var IL = (loD === -Infinity) ? -Infinity : cl(curInt + loD);
    var IU = (hiD === Infinity) ? Infinity : cl(curInt + hiD);
    var r = toUser(swapSign, IL, IU);

    cList.push({
      j: k, name: vars[k].name, basic: pos !== -1,
      current: c0[k], lo: r.lo, hi: r.hi,
      /* 区间内基不变 ⇒ x 不变，而 z = Σcⱼxⱼ，所以基变量的 c 每 +1，z* 就变化 x_k；
         非基变量取 0，改它的 c 在这段区间里不影响最优值。 */
      slope: pos === -1 ? 0 : solution[k]
    });
  }

  /* ---- ② 右端项 b 的允许范围 ---- */
  /* 基里若还残留人工变量，它必须**恰好等于 0**，而不只是「≥ 0」：
     人工变量取正值时那些等式就不代表原约束了，对应的"可行解"是虚假的。
     这会把它牵涉到的那些 b 区间压成一个点（退化情形，区间不唯一）。 */
  var artRows = [];
  for (var pa = 0; pa < m; pa++) {
    if (vars[basis[pa]].kind === 'a') artRows.push(pa);
  }

  var bList = [];
  for (var i = 0; i < m; i++) {
    var bInt = env.consRhs[i];
    var loD2 = -Infinity, hiD2 = Infinity;
    /* x_B' = x_B + Δ·(B⁻¹ 的第 i 列)，逐行要求非负 */
    for (var p = 0; p < m; p++) {
      var xB = rows[p][N];
      var t2 = Binv[p][i];
      if (t2 > EPS) {
        var lb2 = -xB / t2;
        if (lb2 > loD2) loD2 = lb2;
      } else if (t2 < -EPS) {
        var ub2 = -xB / t2;
        if (ub2 < hiD2) hiD2 = ub2;
      }
    }
    /* 残留人工变量：要求它保持为 0 */
    for (var ai = 0; ai < artRows.length; ai++) {
      var t3 = Binv[artRows[ai]][i];
      if (t3 > EPS || t3 < -EPS) {
        var zero = -rows[artRows[ai]][N] / t3;
        if (zero > loD2) loD2 = zero;
        if (zero < hiD2) hiD2 = zero;
      }
    }
    var IL2 = (loD2 === -Infinity) ? -Infinity : cl(bInt + loD2);
    var IU2 = (hiD2 === Infinity) ? Infinity : cl(bInt + hiD2);
    var r2 = toUser(flipSign[i], IL2, IU2);

    bList.push({
      i: i, current: env.userRhs[i], lo: r2.lo, hi: r2.hi,
      /* 区间内基不变 ⇒ z* = y·b，所以 z 对 bᵢ 的斜率恒等于影子价格 yᵢ */
      shadow: dual ? dual[i] : null,
      pinned: artRows.length > 0 && Math.abs(r2.hi - r2.lo) < 1e-9
    });
  }

  return model.createSensitivityReport(cList, bList, artRows.length > 0);
}

module.exports = {
  sensitivityAnalysis: sensitivityAnalysis
};
