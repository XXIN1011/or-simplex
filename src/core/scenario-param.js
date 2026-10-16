/* 参数线性规划：最优基区间与端点行走。 */
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

var simplexSolve = _core.simplexSolve;
var selectEnteringDantzig = _core.selectEnteringDantzig;   // 入基规则（σ_j > 0 中最大者）
var ratioTest = _core.ratioTest;                           // 最小比值规则
var pivot = _core.pivot;                                   // 枢轴变换（就地改 rows / obj / basis）
var toStandardForm = _parse.toStandardForm;                 // 校验 + 规范化 + 建初始表

var EPS = _util.EPS, pAdd = _util.pAdd, pSub = _util.pSub, pMul = _util.pMul,
    pIsPos = _util.pIsPos, matInverse = _util.matInverse, matVec = _util.matVec,
    clampSign = _util.clampSign;
var fmtNum = _fmt.fmtNum, fmtPair = _fmt.fmtPair, fmtAff = _fmt.fmtAff;

var shared = require('./scenario-tableau.js');
var sensBuildModel = shared.sensBuildModel;
var sensTableau = shared.sensTableau;
var snapTiny = shared.snapTiny;
var dualRatioList = shared.dualRatioList;
var dualEnter = shared.dualEnter;
var sensBasisNames = shared.sensBasisNames;
var sensMapBasis = shared.sensMapBasis;
var sensFail = shared.sensFail;
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

module.exports = {
  sensParam: sensParam
};
