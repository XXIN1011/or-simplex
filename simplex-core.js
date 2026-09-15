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

  /* ---- 1. 规范化：右端项一律化成非负（整行取负并翻转关系符） ---- */
  var cons = problem.constraints.map(function (k) {
    return { coef: k.coef.map(Number), rel: k.rel, rhs: Number(k.rhs) };
  });
  for (var i = 0; i < m; i++) {
    if (cons[i].rhs < -EPS) {
      cons[i].coef = cons[i].coef.map(function (v) { return -v; });
      cons[i].rhs = -cons[i].rhs;
      cons[i].rel = cons[i].rel === '<=' ? '>=' : (cons[i].rel === '>=' ? '<=' : '=');
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
  for (var ir = 0; ir < m; ir++) {
    var r = new Array(N + 1).fill(0);
    for (var jr = 0; jr < n; jr++) r[jr] = cons[ir].coef[jr];
    if (sCol[ir] !== undefined) r[sCol[ir]] = (cons[ir].rel === '>=' ? -1 : 1);
    if (aCol[ir] !== undefined) r[aCol[ir]] = 1;
    r[N] = cons[ir].rhs;
    rows.push(r);
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
      entering: null, leaving: null, pivot: null, ratios: null, note: ''
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
    steps.push(snapshot({
      iter: iter,
      entering: e, leaving: r, pivot: rows[r][e], ratios: ratios, note: ''
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
    artificialInBasis: artificialInBasis,
    altOptimal: altOptimal
  };
}

/* Node 下导出（浏览器里 module 不存在，自动跳过） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simplexSolve: simplexSolve,
    fmtNum: fmtNum,
    fmtPair: fmtPair,
    asFraction: asFraction
  };
}
