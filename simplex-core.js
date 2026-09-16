/* =========================================================================
   大M法单纯形法 —— 教学版核心算法（可展示每一步迭代）
   ---------------------------------------------------------------------
   数值表示：pair = {a, b} 表示  a + b·M ，M 是形式上的"无穷大"。
   这样人工变量的检验数可以按教材写法显示成 "3 - 2M" 这类形式，
   而且比较大小是良定义的：先比 M 的系数，再比常数。
   约束行始终是纯数字（M 只进入检验数行），所以只有 obj 用 pair。
   ========================================================================= */
'use strict';

var EPS = 1e-9;

/* ---------- pair (a + bM) 运算 ---------- */
function pAdd(x, y) { return { a: x.a + y.a, b: x.b + y.b }; }
function pSub(x, y) { return { a: x.a - y.a, b: x.b - y.b }; }
function pMul(x, s) { return { a: x.a * s, b: x.b * s }; }   // s 为普通数字
function pCmp(x, y) {                                        // M -> +∞ 的字典序比较
  if (Math.abs(x.b - y.b) > EPS) return x.b > y.b ? 1 : -1;
  if (Math.abs(x.a - y.a) > EPS) return x.a > y.a ? 1 : -1;
  return 0;
}
function pIsPos(x) { return x.b > EPS || (Math.abs(x.b) <= EPS && x.a > EPS); }
function pIsZero(x) { return Math.abs(x.a) <= EPS && Math.abs(x.b) <= EPS; }

/* ---------- 数字 / 分式显示 ---------- */
function asFraction(v) {
  if (Math.abs(v) < 1e-9) return '0';
  for (var d = 1; d <= 200; d++) {
    var num = v * d;
    if (Math.abs(num - Math.round(num)) < 1e-7) {
      var N = Math.round(num);
      return d === 1 ? String(N) : N + '/' + d;
    }
  }
  return null;
}
function fmtNum(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (Math.abs(v) < 1e-9) return '0';
  var f = asFraction(v);
  if (f !== null) return f;
  var s = v.toPrecision(6);
  if (s.indexOf('e') === -1 && s.indexOf('.') !== -1) {
    s = s.replace(/0+$/, '').replace(/\.$/, '');
  }
  return s;
}
/* 含 M 时显示为「M 项 + 常数项」，例如 7M - 4、2M + 3、-M - 3。
   把 M 项放在前面，是为了让"这个检验数究竟是正是负"一眼可辨 —— M 是形式上的
   无穷大，7M - 4 显然是正数，而写成 -4 + 7M 容易被初学者误读成负数。 */
function fmtPair(p) {
  var a = Math.abs(p.a) < 1e-7 ? 0 : p.a;
  var b = Math.abs(p.b) < 1e-7 ? 0 : p.b;
  if (b === 0) return fmtNum(a);
  var mPart;
  if (Math.abs(b - 1) < 1e-9) mPart = 'M';
  else if (Math.abs(b + 1) < 1e-9) mPart = '-M';
  else mPart = fmtNum(b) + 'M';
  if (a === 0) return mPart;
  return mPart + (a > 0 ? ' + ' : ' - ') + fmtNum(Math.abs(a));
}

/* ---------- 小规模矩阵求逆（高斯-约当 + 部分选主元）；奇异返回 null ---------- */
function matInverse(M) {
  var m = M.length, i, j, k;
  var A = [];
  for (i = 0; i < m; i++) {
    var row = M[i].slice();
    for (k = 0; k < m; k++) row.push(i === k ? 1 : 0);
    A.push(row);
  }
  for (i = 0; i < m; i++) {
    var p = i;
    for (k = i + 1; k < m; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    }
    if (Math.abs(A[p][i]) < 1e-12) return null;
    if (p !== i) { var t = A[i]; A[i] = A[p]; A[p] = t; }
    var piv = A[i][i];
    for (j = 0; j < 2 * m; j++) A[i][j] /= piv;
    for (k = 0; k < m; k++) {
      if (k === i) continue;
      var f = A[k][i];
      if (f === 0) continue;
      for (j = 0; j < 2 * m; j++) A[k][j] -= f * A[i][j];
    }
  }
  var inv = [];
  for (i = 0; i < m; i++) inv.push(A[i].slice(m));
  return inv;
}

/* =========================================================================
   灵敏度分析：求「保持当前最优基不变」时，各系数允许的变化范围。
   -------------------------------------------------------------------------
   ① 目标函数系数 cⱼ：改基变量的 c 会让**所有**非基列的检验数一起平移，所以两端
      都可能有限；改非基变量的 c 只影响它自己的检验数，因此只有一侧有限——越过
      它那个变量就会入基。
   ② 右端项 bᵢ：由 x_B = B⁻¹b 推得，只要 x_B 保持非负，基就仍然最优可行；这段
      区间里影子价格 yᵢ 一直有效，z 也随 bᵢ 线性变化。

   推导全部在「max 化 + 标准化之后的问题」上做，最后换算回用户输入的原始 c 和 b：
     · min 问题的内部 c 是取过负的（swapSign = -1）
     · 右端项为负的约束被整行取负过（flipSign = ±1）
   这两处不换算回去，区间方向或符号就会反。
   ========================================================================= */
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

  return { c: cList, b: bList, degenerate: artRows.length > 0 };
}

/* =========================================================================
   主函数
   problem = {
     direction: 'max' | 'min',
     c: [c1, c2, ...],                                  // 目标函数系数
     constraints: [{ coef: [a1, a2, ...], rel: '<='|'>='|'=', rhs: number }]
   }
   返回 {
     ok, status, vars, steps, solution, objective, swapped, message, altOptimal
   }
   status: 'optimal' | 'unbounded' | 'infeasible' | 'iteration-limit'
   ========================================================================= */
function simplexSolve(problem) {
  var direction = problem.direction === 'min' ? 'min' : 'max';
  var swapped = direction === 'min';            // min z  ->  max w = -z
  var c0 = problem.c.map(Number);
  var n = c0.length;
  var m = problem.constraints.length;

  /* 允许 0 个变量或 0 个约束：
     - 0 个约束 = 无约束问题：存在正检验数则无界，否则最优解取 0；
     - 0 个变量 = 目标函数不含变量，目标值恒为 0。
     两种情况都能给出确定结论，因此不再硬性拦截。 */
  var invalid = [];
  for (var q = 0; q < m; q++) {
    var kk = problem.constraints[q];
    if (kk.coef.length !== n) invalid.push('第 ' + (q + 1) + ' 个约束的系数个数与变量数不一致');
    if (!isFinite(Number(kk.rhs))) invalid.push('第 ' + (q + 1) + ' 个约束的右端项不是有效数字');
  }
  for (var q2 = 0; q2 < n; q2++) {
    if (!isFinite(c0[q2])) invalid.push('目标函数第 ' + (q2 + 1) + ' 个系数不是有效数字');
  }
  if (invalid.length) return { ok: false, message: invalid.join('；') };

  /* ---- 1. 规范化：右端项一律化成非负（整行取负并翻转关系符） ----
     顺便记下哪些约束被取负过：内部 b = flipSign · 用户 b。后面算影子价格和
     b 的允许区间都要乘回去，否则「-x1 ≤ -2」这类约束的方向会反。 */
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
    for (var j = 0; j < n; j++) {
      if (Math.abs(cons[i].coef[j]) < EPS) cons[i].coef[j] = 0;
    }
    if (Math.abs(cons[i].rhs) < EPS) cons[i].rhs = 0;
  }

  /* ---- 2. 建变量表：决策变量 x1..xn，松弛/剩余 s_i，人工 a_i ---- */
  var vars = [];
  for (var jx = 0; jx < n; jx++) vars.push({ name: 'x' + (jx + 1), kind: 'x' });
  var sCol = [], aCol = [], basis = [];
  for (var i2 = 0; i2 < m; i2++) {
    var k2 = cons[i2];
    if (k2.rel === '<=') {
      sCol[i2] = vars.length; vars.push({ name: 's' + (i2 + 1), kind: 's' });
      basis[i2] = sCol[i2];
    } else if (k2.rel === '>=') {
      sCol[i2] = vars.length; vars.push({ name: 's' + (i2 + 1), kind: 's' });
      aCol[i2] = vars.length; vars.push({ name: 'a' + (i2 + 1), kind: 'a' });
      basis[i2] = aCol[i2];
    } else {
      aCol[i2] = vars.length; vars.push({ name: 'a' + (i2 + 1), kind: 'a' });
      basis[i2] = aCol[i2];
    }
  }
  var N = vars.length;

  /* ---- 3. 目标函数系数（统一按 max 处理；人工变量罚 -M） ---- */
  var cObj = [];
  for (var jc = 0; jc < N; jc++) cObj.push({ a: 0, b: 0 });
  for (var jd = 0; jd < n; jd++) cObj[jd] = { a: swapped ? -c0[jd] : c0[jd], b: 0 };
  for (var ia = 0; ia < m; ia++) {
    if (aCol[ia] !== undefined) cObj[aCol[ia]] = { a: 0, b: -1 };   // -M
  }

  /* ---- 4. 初始单纯形表 ---- */
  var rows = [];
  var A0 = [];      // 标准化后的约束系数矩阵（不含右端项），事后用于求对偶解
  for (var ir = 0; ir < m; ir++) {
    var r = new Array(N + 1).fill(0);
    for (var jr = 0; jr < n; jr++) r[jr] = cons[ir].coef[jr];
    if (sCol[ir] !== undefined) r[sCol[ir]] = (cons[ir].rel === '>=' ? -1 : 1);
    if (aCol[ir] !== undefined) r[aCol[ir]] = 1;
    r[N] = cons[ir].rhs;
    rows.push(r);
    A0.push(r.slice(0, N));
  }

  /* ---- 5. 检验数行：σ_j = c_j - z_j ，末位存 -z ---- */
  var obj = [];
  for (var jo = 0; jo < N; jo++) obj.push({ a: cObj[jo].a, b: cObj[jo].b });
  obj.push({ a: 0, b: 0 });
  for (var ib = 0; ib < m; ib++) {
    var cB = cObj[basis[ib]];
    for (var jb = 0; jb <= N; jb++) obj[jb] = pSub(obj[jb], pMul(cB, rows[ib][jb]));
  }

  function snapshot(extra) {
    var s = {
      iter: 0, rows: [], obj: [], basis: basis.slice(),
      entering: null, leaving: null, pivot: null, ratios: null,
      degenerate: false, note: ''
    };
    for (var x in extra) s[x] = extra[x];
    for (var i3 = 0; i3 < m; i3++) s.rows.push(rows[i3].slice());
    for (var j3 = 0; j3 <= N; j3++) s.obj.push({ a: obj[j3].a, b: obj[j3].b });
    return s;
  }

  var steps = [];
  var status = 'optimal';
  var iter = 0;

  while (true) {
    /* 6.1 找入基变量：σ_j > 0 中最大者（Dantzig 规则） */
    var e = -1, best = null;
    for (var je = 0; je < N; je++) {
      if (pIsPos(obj[je]) && (best === null || pCmp(obj[je], best) > 0)) {
        best = obj[je]; e = je;
      }
    }

    if (e === -1) {   /* 全部 σ_j ≤ 0 → 最优 */
      steps.push(snapshot({
        iter: iter,
        entering: null, leaving: null, pivot: null, ratios: null,
        note: '所有检验数 σⱼ ≤ 0，没有可改进的方向，当前基可行解就是最优解。'
      }));
      break;
    }

    /* 6.2 比值检验（最小比值规则） */
    var ratios = [], r = -1, minRatio = Infinity;
    for (var it = 0; it < m; it++) {
      if (rows[it][e] > EPS) {
        var th = rows[it][N] / rows[it][e];
        ratios.push({ row: it, theta: th, ok: true });
        if (th < minRatio - EPS) { minRatio = th; r = it; }
      } else {
        ratios.push({ row: it, theta: null, ok: false });
      }
    }

    if (r === -1) {   /* 入基列没有正系数 → 要么原问题无界，要么原问题无可行解 */
      /* 关键：大M法是在"含人工变量的扩展问题"上迭代的。若此刻基中仍残留取正值的
         人工变量，说明原约束根本不能同时满足，沿这条射线走只会让人工变量越来越大
         （依然违背原约束），因此正确结论是【无可行解】，而不是无界。 */
      var artPos = -1;
      for (var ia3 = 0; ia3 < m; ia3++) {
        if (vars[basis[ia3]].kind === 'a' && rows[ia3][N] > 1e-7) { artPos = ia3; break; }
      }
      if (artPos >= 0) {
        steps.push(snapshot({
          iter: iter,
          entering: e, leaving: null, pivot: null, ratios: ratios,
          note: '入基变量 ' + vars[e].name + ' 所在列没有正的系数，比值 θ 无法计算；' +
                '但此时人工变量 ' + vars[basis[artPos]].name + ' 仍取正值（= ' + fmtNum(rows[artPos][N]) + '），' +
                '说明原问题的约束无法同时满足 → 问题为**无可行解**。'
        }));
        status = 'infeasible';
        break;
      }
      steps.push(snapshot({
        iter: iter,
        entering: e, leaving: null, pivot: null, ratios: ratios,
        note: '入基变量 ' + vars[e].name + ' 所在列中没有任何正的系数，比值 θ 无法计算 → ' +
              '该变量可以无限增大而始终满足约束，目标函数值无上界，问题为**无界解**。'
      }));
      status = 'unbounded';
      break;
    }

    /* 6.3 记录当前表 + 本步判定 */
    /* θ = 0 表示被顶出的基变量本来就是 0，这一步迭代不会改善目标值，称为「退化」 */
    var degenerate = (r >= 0 && minRatio < 1e-7);
    steps.push(snapshot({
      iter: iter,
      entering: e, leaving: r, pivot: rows[r][e], ratios: ratios,
      degenerate: degenerate, note: ''
    }));

    /* 6.4 枢轴变换（高斯消元，把入基列化为单位向量） */
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

    iter++;
    if (iter > 200) { status = 'iteration-limit'; break; }
  }

  /* ---- 7. 解与结论 ---- */
  var solution = new Array(n).fill(0);
  for (var iv = 0; iv < m; iv++) {
    if (basis[iv] < n) solution[basis[iv]] = rows[iv][N];
  }
  for (var iz = 0; iz < n; iz++) if (Math.abs(solution[iz]) < 1e-9) solution[iz] = 0;

  var artificialInBasis = false;
  for (var iba = 0; iba < m; iba++) {
    if (vars[basis[iba]].kind === 'a' && rows[iba][N] > 1e-7) artificialInBasis = true;
  }

  var altOptimal = [];
  if (status === 'optimal' && !artificialInBasis) {
    for (var jalt = 0; jalt < N; jalt++) {
      if (vars[jalt].kind === 'a') continue;
      if (basis.indexOf(jalt) !== -1) continue;
      if (pIsZero(obj[jalt])) altOptimal.push(jalt);
    }
  }

  var zStar = null;
  if (status === 'optimal' && !artificialInBasis) {
    zStar = swapped ? obj[N].a : -obj[N].a;
    if (Math.abs(zStar) < 1e-9) zStar = 0;
  }

  var finalStatus = status;
  if (status === 'optimal' && artificialInBasis) finalStatus = 'infeasible';

  /* ---- 8. 对偶解（影子价格）+ 灵敏度分析 ----
     B 取最终基在「标准化约束矩阵 A0」中对应的列。用原始目标系数 c0（而不是
     min 转换后的 -c0）来计算，这样 y_i 对 max / min 都直接等于「最优值对右端项的偏导」。

     最后乘 flipSign：前面把右端项为负的约束整行取负过（b_int = −b_user），
     所以按内部 b 算出的偏导要换回用户输入的 b，否则那条约束的影子价格符号会反。 */
  var dual = null, sensitivity = null, Binv = null;
  if (finalStatus === 'optimal' && m > 0) {
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
          consRhs: cons.map(function (k) { return k.rhs; }),
          userRhs: problem.constraints.map(function (k) { return Number(k.rhs); })
        });
      }
    }
  }

  return {
    ok: true,
    status: finalStatus,
    direction: direction,
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
  };
}

/* Node 下导出（浏览器里 module 不存在，自动跳过）。
   sens-core.js 也要用这些，所以一并导出，避免两套实现。 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simplexSolve: simplexSolve,
    fmtNum: fmtNum,
    fmtPair: fmtPair,
    asFraction: asFraction,
    EPS: EPS,
    pAdd: pAdd, pSub: pSub, pMul: pMul, pCmp: pCmp, pIsPos: pIsPos, pIsZero: pIsZero,
    matInverse: matInverse
  };
}
