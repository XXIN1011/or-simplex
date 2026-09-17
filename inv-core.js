/* =========================================================================
   库存论核心算法（教材第 9 章 9.2 ~ 9.6）
   -------------------------------------------------------------------------
   对应徐玖平《运筹学（第四版）》第 9 章「库存论」：
     9.2 基本模型           -> invEOQ      基本经济订货批量（EOQ）
     9.3 缺货模型           -> invShortage 允许缺货的经济订货批量
     9.4 供货有限模型       -> invEPQ      陆续到货 / 经济生产批量（EPQ）
     9.5* 批量折扣模型      -> invDiscount 多价格区间 EOQ
     9.6* 约束条件模型      -> invMulti    多产品资源约束（拉格朗日乘数法）
   -------------------------------------------------------------------------
   与 Python 版（python/inventory.py）是两套独立实现，靠随机题库对拍互验
   （见 inv-test.js）。

   约定：
   · 只做数学，不拼 HTML —— 拼界面是 inv-ui.js 的事。返回值里的字段名
     与 Python 版保持一致，方便对拍。
   · 参数非法时返回 { ok:false, message:'...' }，界面直接显示这句话。
   · 能算但需要提醒的（例如单位口径可疑）放在 warns 数组里，不算错误。
   ========================================================================= */
'use strict';

/* ========================= 通用小工具 ========================= */

/* 显示用数字：固定小数位后去掉尾随 0；大数加千分位 */
function invNum(v, nd) {
  if (v === null || v === undefined || typeof v === 'string') return '—';
  if (isNaN(v) || !isFinite(v)) return '—';
  if (nd === undefined) nd = 4;
  if (Math.abs(v) < 1e-12) return '0';
  var s = v.toFixed(nd);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (/^-?0$/.test(s)) return '0';   /* 一个极小的负数会格式化成 -0，显示成「-0」很难看 */
  var neg = s.charAt(0) === '-';
  if (neg) s = s.slice(1);
  var parts = s.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  s = (neg ? '-' : '') + parts.join('.');
  return s;
}

/* 百分比显示 */
function invPct(x, nd) {
  if (x === null || x === undefined || isNaN(x)) return '—';
  return (x * 100).toFixed(nd === undefined ? 2 : nd) + '%';
}

/* 参数校验：返回 null 表示通过，否则返回中文提示 */
function invPos(name, v, unit) {
  var u = unit ? '（' + unit + '）' : '';
  if (v === '' || v === null || v === undefined) return name + ' 不能为空。';
  var x = Number(v);
  if (isNaN(x)) return name + ' 必须是数值，当前是「' + v + '」。';
  if (!isFinite(x)) return name + ' 必须是有限数值。';
  if (x <= 0) return name + ' 必须为正数' + u + '，当前是 ' + x + '。';
  return null;
}
function invNonNeg(name, v, unit) {
  var u = unit ? '（' + unit + '）' : '';
  if (v === '' || v === null || v === undefined) return null;   /* 可选参数，留空按 0 处理 */
  var x = Number(v);
  if (isNaN(x)) return name + ' 必须是数值，当前是「' + v + '」。';
  if (!isFinite(x)) return name + ' 必须是有限数值。';
  if (x < 0) return name + ' 不能为负数' + u + '，当前是 ' + x + '。';
  return null;
}
/* 收集错误：把第一个非 null 的结果返回 */
function invFirstErr() {
  for (var i = 0; i < arguments.length; i++) if (arguments[i]) return arguments[i];
  return null;
}

/* ======================================================================
   9.2 基本经济订货批量模型（EOQ）
   ----------------------------------------------------------------------
   假设：需求连续均匀 · 瞬时到货 · 不允许缺货 · 单价与订货费固定
   目标函数：C(Q) = (D/Q)·c3 + (Q/2)·c1
   令 dC/dQ = -D·c3/Q² + c1/2 = 0  =>  Q* = sqrt(2·D·c3/c1)
   ====================================================================== */
function invEOQ(p) {
  var err = invFirstErr(
    invPos('年总需求量 D', p.D, '件/年'),
    invPos('单位存贮费 c1', p.c1, '元/件·年'),
    invPos('每次订货费 c3', p.c3, '元/次'),
    invNonNeg('采购单价 K', p.K, '元/件')
  );
  if (err) return { ok: false, message: err };

  var D = Number(p.D), c1 = Number(p.c1), c3 = Number(p.c3);
  var K = (p.K === '' || p.K === null || p.K === undefined) ? null : Number(p.K);

  var Q = Math.sqrt(2 * D * c3 / c1);
  var T = Q / D;
  var C = Math.sqrt(2 * D * c1 * c3);
  var costOrder = D / Q * c3;
  var costHold = Q / 2 * c1;
  var costPurchase = (K === null) ? null : D * K;

  return {
    ok: true, model: 'eoq',
    D: D, c1: c1, c3: c3, K: K,
    Q: Q, T: T, C: C,
    orderTimes: D / Q,
    maxInv: Q,                    /* 瞬时到货：刚入库时库存最高 */
    avgInv: Q / 2,                /* 三角形库存的平均高度 */
    costOrder: costOrder,
    costHold: costHold,
    costPurchase: costPurchase,
    costTotal: (costPurchase === null) ? null : C + costPurchase,
    warns: []
  };
}

/* ======================================================================
   9.4 供货有限模型（陆续到货 / 经济生产批量 EPQ）
   ----------------------------------------------------------------------
   假设：需求连续均匀 · 陆续匀速到货（生产率 p > 需求率 d）· 不允许缺货
   生产期 t_p = Q/p，此间库存以 (p-d) 上升，期末达最高存贮量
       S = (p-d)·t_p = (1 - d/p)·Q
   周期 T = Q/d，平均存贮量 = S/2，故
       C(Q) = (D/Q)·c3 + (1 - d/p)·Q·c1/2
   =>  Q* = sqrt( 2·D·c3 / ((1 - d/p)·c1) )
   ★ 单位口径：D 与 d 必须同一时间口径，自洽条件 D = d × n（n 为每年时间单位数）
   ====================================================================== */
function invEPQ(p) {
  var err = invFirstErr(
    invPos('年总需求量 D', p.D, '件/年'),
    invPos('单位时间需求率 d', p.d, '件/单位时间'),
    invPos('单位时间生产率 p', p.p, '件/单位时间'),
    invPos('单位存贮费 c1', p.c1, '元/件·年'),
    invPos('每次订货费 c3', p.c3, '元/次'),
    invNonNeg('单位生产成本 K', p.K, '元/件'),
    invNonNeg('每年时间单位数 n', p.n, '个/年')
  );
  if (err) return { ok: false, message: err };

  var D = Number(p.D), d = Number(p.d), pp = Number(p.p);
  var c1 = Number(p.c1), c3 = Number(p.c3);
  var K = (p.K === '' || p.K === null || p.K === undefined) ? null : Number(p.K);
  var nGiven = (p.n === '' || p.n === null || p.n === undefined) ? null : Number(p.n);

  if (pp <= d) {
    return { ok: false, message: '生产率 p 必须大于需求率 d，否则库存永远补不上'
      + '（当前 p = ' + pp + '，d = ' + d + '）。若 p ≤ d，说明连自身消耗都供不上，'
      + '应改用「基本经济订货批量」模型（外部采购）。' };
  }

  var warns = [];
  var n = D / d;                       /* 推算出的「每年时间单位数」 */
  if (nGiven !== null) {
    var expect = d * nGiven;
    if (Math.abs(D - expect) > 1e-6 * Math.max(D, expect)) {
      return { ok: false, message: '时间单位不一致：D = ' + D + ' 件/年、d = ' + d
        + ' 件/单位时间、每年 ' + nGiven + ' 个时间单位，三者应满足 D = d × n = '
        + invNum(expect) + '，当前 D 与它相差 '
        + invNum(Math.abs(D - expect) / expect * 100, 3) + '%。'
        + '请统一口径：要么把 d 换算成与 D 同口径，要么修正「每年时间单位数」。' };
    }
    n = nGiven;
  }
  if (n < 1 - 1e-12) {
    return { ok: false, message: '时间单位不一致：由 D/d 推算出每年只有 ' + invNum(n)
      + ' 个时间单位（< 1），意味着「单位时间需求率」大于「全年需求量」，'
      + '这不可能成立。最常见的原因是 D（年需求）与 d（日需求率）的时间口径串了：'
      + '此时 D/d 应等于年工作日数（约 250）或自然日数（365）。' };
  }
  if (nGiven === null && n > 400) {
    warns.push('由 D/d 推算出每年的时间单位数为 ' + invNum(n, 3)
      + '，明显偏大（常见应为年工作日数 ≈250 或自然日数 365、按月则为 12）。'
      + '请核对 D 与 d 是否同一时间口径 —— 口径串了 Q* 会差 sqrt(n) 倍。');
  }

  var rho = d / pp;
  var om = 1 - rho;
  var Q = Math.sqrt(2 * D * c3 / (om * c1));
  var S = om * Q;
  var T = Q / d;
  var tProd = Q / pp;
  var C = Math.sqrt(2 * D * c1 * c3 * om);
  var costOrder = D / Q * c3;
  var costHold = S / 2 * c1;
  var costPurchase = (K === null) ? null : D * K;

  return {
    ok: true, model: 'epq',
    D: D, d: d, p: pp, c1: c1, c3: c3, K: K,
    rho: rho, oneMinusRho: om, n: n, nGiven: nGiven,
    Q: Q, S: S, T: T, tProduce: tProd, tConsume: T - tProd, C: C,
    produceTimes: D / Q,
    maxInv: S, avgInv: S / 2,
    costOrder: costOrder, costHold: costHold,
    costPurchase: costPurchase,
    costTotal: (costPurchase === null) ? null : C + costPurchase,
    eoqIfInfinite: Math.sqrt(2 * D * c3 / c1),   /* p→∞ 的退化值，用于对照 */
    warns: warns
  };
}

/* ======================================================================
   9.3 缺货模型（允许缺货的经济订货批量）
   ----------------------------------------------------------------------
   假设：需求连续均匀 · 瞬时到货 · 允许缺货且到货后补足 · 单位缺货损失费 c2
   两个决策变量 Q（订货量）与 S（最高存贮量），B = Q - S 为最大缺货量：
       C(Q,S) = c3·D/Q + c1·S²/(2Q) + c2·B²/(2Q)
   ① 先对 S 求偏导： c1·S/Q - c2·(Q-S)/Q = 0
        => S* = c2/(c1+c2)·Q ， B* = c1/(c1+c2)·Q
   ② 代回后对 Q 求导 => Q* = sqrt( 2·D·c3·(c1+c2)/(c1·c2) )
   ====================================================================== */
function invShortage(p) {
  var err = invFirstErr(
    invPos('年总需求量 D', p.D, '件/年'),
    invPos('单位存贮费 c1', p.c1, '元/件·年'),
    invPos('单位缺货损失费 c2', p.c2, '元/件·年'),
    invPos('每次订货费 c3', p.c3, '元/次'),
    invNonNeg('采购单价 K', p.K, '元/件')
  );
  if (err) return { ok: false, message: err };

  var D = Number(p.D), c1 = Number(p.c1), c2 = Number(p.c2), c3 = Number(p.c3);
  var K = (p.K === '' || p.K === null || p.K === undefined) ? null : Number(p.K);

  var Q = Math.sqrt(2 * D * c3 * (c1 + c2) / (c1 * c2));
  var S = c2 / (c1 + c2) * Q;
  var B = c1 / (c1 + c2) * Q;
  var T = Q / D;
  var C = Math.sqrt(2 * D * c1 * c2 * c3 / (c1 + c2));
  var costOrder = D / Q * c3;
  var costHold = S * S / (2 * Q) * c1;
  var costShort = B * B / (2 * Q) * c2;

  /* 与「不允许缺货」（模型 9.2）对照：允许缺货只会省钱，上限就是 EOQ 的费用 */
  var eoqQ = Math.sqrt(2 * D * c3 / c1);
  var eoqC = Math.sqrt(2 * D * c1 * c3);
  var costPurchase = (K === null) ? null : D * K;

  return {
    ok: true, model: 'short',
    D: D, c1: c1, c2: c2, c3: c3, K: K,
    Q: Q, S: S, B: B, T: T,
    tStock: S / D, tShort: B / D,
    shortageRatio: B / Q,
    C: C,
    avgInv: S * S / (2 * Q),
    avgShort: B * B / (2 * Q),
    maxInv: S, maxShort: B,
    costOrder: costOrder, costHold: costHold, costShort: costShort,
    costPurchase: costPurchase,
    costTotal: (costPurchase === null) ? null : C + costPurchase,
    eoqQ: eoqQ, eoqC: eoqC,
    saving: eoqC - C,
    qRatio: Q / eoqQ,
    warns: []
  };
}

/* ======================================================================
   9.5* 批量折扣模型（多价格区间 EOQ）
   ----------------------------------------------------------------------
   第 i 档（单价 K_i、存贮费 c1_i）的单位时间总费用：
       C_i(Q) = (1/2)·Q·c1_i + (D/Q)·c3 + D·K_i
   ★ 采购费 D·K_i 在本档内是常数（不影响 Q_i*），但它随档位跳变 ——
     所以【比较各档时必须计入】，否则会得出错误结论。
   逐档 Q_i* = sqrt(2·D·c3/c1_i)，再做可行性校验，最后比总费用取全局最优。
   ====================================================================== */
function invDiscount(p) {
  var err = invFirstErr(
    invPos('年总需求量 D', p.D, '件/年'),
    invPos('每次订货费 c3', p.c3, '元/次')
  );
  if (err) return { ok: false, message: err };

  var D = Number(p.D), c3 = Number(p.c3);
  var useRate = (p.mode === 'rate');
  if (useRate) {
    err = invPos('存贮费率 i', p.rate, '如 0.2 表示 20%');
    if (err) return { ok: false, message: err };
  } else {
    err = invPos('单位存贮费 c1', p.c1, '元/件·年');
    if (err) return { ok: false, message: err };
  }
  var rate = useRate ? Number(p.rate) : null;
  var c1Abs = useRate ? null : Number(p.c1);

  var tiers = p.tiers || [];
  if (tiers.length < 1) return { ok: false, message: '至少要有一档价格。' };

  var parsed = [], i, lo, K;
  for (i = 0; i < tiers.length; i++) {
    err = invFirstErr(
      invNonNeg('第 ' + (i + 1) + ' 档分界点下限', tiers[i].lo, '件'),
      invPos('第 ' + (i + 1) + ' 档单价', tiers[i].K, '元/件')
    );
    if (err) return { ok: false, message: err };
    lo = Number(tiers[i].lo); K = Number(tiers[i].K);
    if (i === 0 && Math.abs(lo) > 1e-12) {
      return { ok: false, message: '第一档的分界点下限必须是 0（表示从 0 开始），当前是 ' + lo + '。' };
    }
    if (i > 0 && lo <= parsed[i - 1].lo) {
      return { ok: false, message: '价格分档的下限必须严格递增，但第 ' + (i + 1)
        + ' 档下限 ' + lo + ' 不大于上一档 ' + parsed[i - 1].lo + '。' };
    }
    if (i > 0 && K > parsed[i - 1].K + 1e-12) {
      return { ok: false, message: '批量折扣要求单价随批量【不升】：第 ' + (i + 1)
        + ' 档单价 ' + K + ' 高于上一档 ' + parsed[i - 1].K + '，这与折扣模型的前提矛盾。' };
    }
    parsed.push({ lo: lo, K: K });
  }

  var rows = [];
  for (i = 0; i < parsed.length; i++) {
    lo = parsed[i].lo; K = parsed[i].K;
    var hi = (i + 1 < parsed.length) ? parsed[i + 1].lo : null;
    var c1i = useRate ? rate * K : c1Abs;
    var eoq = Math.sqrt(2 * D * c3 / c1i);
    var status, cand;
    if (lo <= eoq && (hi === null || eoq < hi)) {
      status = '可行'; cand = eoq;
    } else if (eoq < lo) {
      status = '不可行：Q* < 下限，取本档左端点'; cand = lo;
    } else {
      status = '不可行：Q* 超出本档上限（本档内费用递减，最低点在右端点，属下一档）';
      cand = null;
    }
    rows.push({
      index: i + 1, lo: lo, hi: hi, K: K, c1: c1i, eoq: eoq,
      status: status, candidate: cand,
      costHold: null, costOrder: null, costPurchase: D * K, costTotal: null
    });
  }
  for (i = 0; i < rows.length; i++) {
    if (rows[i].candidate !== null) {
      var q = rows[i].candidate;
      rows[i].costHold = 0.5 * q * rows[i].c1;
      rows[i].costOrder = D / q * c3;
      rows[i].costTotal = rows[i].costHold + rows[i].costOrder + rows[i].costPurchase;
    }
  }

  var best = null;
  for (i = 0; i < rows.length; i++) {
    if (rows[i].candidate === null) continue;
    if (best === null || rows[i].costTotal < best.costTotal) best = rows[i];
  }
  if (best === null) {
    return { ok: false, message: '所有档位都未产生候选批量，请检查价格分档是否合理。' };
  }

  var c1First = useRate ? rate * parsed[0].K : c1Abs;
  return {
    ok: true, model: 'disc',
    D: D, c3: c3, mode: useRate ? 'rate' : 'abs',
    rate: rate, c1: c1Abs, c1First: c1First,
    tiers: rows,
    Q: best.candidate, K: best.K, bestBracket: best.index,
    costHold: best.costHold, costOrder: best.costOrder,
    costPurchase: best.costPurchase, costTotal: best.costTotal,
    T: best.candidate / D, orderTimes: D / best.candidate,
    maxInv: best.candidate, avgInv: best.candidate / 2,
    eoqNoDiscount: Math.sqrt(2 * D * c3 / c1First),
    atBoundary: Math.abs(best.candidate - best.eoq) > 1e-9,
    warns: []
  };
}

/* ======================================================================
   9.6* 约束条件模型（多产品 · 拉格朗日乘数法）
   ----------------------------------------------------------------------
   min  Σ ( a_i/Q_i + b_i·Q_i )     a_i = c3_i·D_i ,  b_i = c1_i/2
   s.t. Σ g_i·Q_i ≤ R               g_i 为单位批量占用的资源量
        （资金约束 g_i = K_i ；库容约束 g_i = v_i）
   构造 L = Σ(a_i/Q_i + b_i·Q_i) + λ(Σg_i·Q_i − R)，令 ∂L/∂Q_i = 0：
        Q_i(λ) = sqrt( a_i/(b_i + λ·g_i) ) = sqrt( 2·c3_i·D_i/(c1_i + 2λ·g_i) )
   互补松弛：先试 λ = 0；若约束自然满足则 λ* = 0，否则二分法求根使约束取等号。
   λ* 的经济含义：该项资源上限每放宽 1 个单位，总费用可下降 λ* 元（影子价格）。
   ====================================================================== */
function invMulti(p) {
  var err = invPos('资源上限', p.limit, p.constraint === 'volume' ? 'm³' : '元');
  if (err) return { ok: false, message: err };
  if (p.constraint !== 'capital' && p.constraint !== 'volume') {
    return { ok: false, message: '约束类型只能是「总资金」或「总库容」。' };
  }

  var items = p.items || [];
  if (items.length < 1) return { ok: false, message: '至少要有一个产品。' };
  if (items.length > 6) return { ok: false, message: '产品数最多 6 个（再多手机上表格会难读）。' };

  var gKey = (p.constraint === 'capital') ? 'K' : 'v';
  var gUnit = (p.constraint === 'capital') ? '元/件' : 'm³/件';
  var gName = (p.constraint === 'capital') ? '单位采购单价' : '单位物品占用库容';
  var i, it, nm;

  var parsed = [];
  for (i = 0; i < items.length; i++) {
    it = items[i];
    nm = (it.name && String(it.name).replace(/\s/g, '')) || ('产品' + (i + 1));
    err = invFirstErr(
      invPos(nm + ' 的年需求量', it.D, '件/年'),
      invPos(nm + ' 的单位存贮费', it.c1, '元/件·年'),
      invPos(nm + ' 的每次订货费', it.c3, '元/次'),
      invPos(nm + ' 的' + gName, it[gKey], gUnit),
      invNonNeg(nm + ' 的最小起订量', it.min, '件')
    );
    if (err) return { ok: false, message: err };
    var D = Number(it.D), c1 = Number(it.c1), c3 = Number(it.c3);
    var g = Number(it[gKey]);
    var gEff = p.averageBasis ? g / 2 : g;   /* 按平均存贮量计时资源系数减半 */
    parsed.push({
      name: nm, D: D, c1: c1, c3: c3, g: g, gEff: gEff,
      min: (it.min === '' || it.min === null || it.min === undefined) ? 0 : Number(it.min),
      a: c3 * D, b: c1 / 2, eoq: Math.sqrt(c3 * D / (c1 / 2))
    });
  }

  var limit = Number(p.limit);
  var minUse = 0;
  for (i = 0; i < parsed.length; i++) minUse += parsed[i].gEff * parsed[i].min;
  if (minUse > limit * (1 + 1e-12)) {
    return { ok: false, message: '约束不可行：各产品按最小起订量订货时，资源占用 '
      + invNum(minUse) + ' 已超过上限 ' + invNum(limit) + '（超出 '
      + invNum(minUse - limit) + '，约 ' + invPct((minUse - limit) / limit)
      + '）。请放宽上限、降低起订量，或删减产品数。' };
  }

  function qOf(lam) {
    var out = [];
    for (var k = 0; k < parsed.length; k++) {
      var den = parsed[k].b + lam * parsed[k].gEff;
      var q = (den > 0) ? Math.sqrt(parsed[k].a / den) : Infinity;
      out.push(Math.max(q, parsed[k].min));
    }
    return out;
  }
  function useOf(qs) {
    var s = 0;
    for (var k = 0; k < parsed.length; k++) s += parsed[k].gEff * qs[k];
    return s;
  }

  var trace = [], lam, qs, use;
  var q0 = qOf(0), use0 = useOf(q0);
  trace.push({ iter: 0, lam: 0, use: use0 });

  var lamStar, qStar, binding;
  if (use0 <= limit * (1 + 1e-12)) {
    lamStar = 0; qStar = q0; binding = false;
  } else {
    var loL = 0, hiL = 1;
    for (i = 0; i < 200; i++) {
      if (useOf(qOf(hiL)) <= limit) break;
      hiL *= 2;
    }
    lamStar = hiL;
    for (i = 0; i < 200; i++) {
      var mid = 0.5 * (loL + hiL);
      qs = qOf(mid); use = useOf(qs);
      trace.push({ iter: i + 1, lam: mid, use: use });
      lamStar = mid;
      if (Math.abs(use - limit) <= 1e-12 * Math.max(1, limit)) break;
      if (use > limit) loL = mid; else hiL = mid;
      if (hiL - loL <= 1e-15 * Math.max(1, hiL)) break;
    }
    qStar = qOf(lamStar);
    binding = true;
  }

  var rows = [], total = 0, totalUncon = 0;
  for (i = 0; i < parsed.length; i++) {
    var qq = qStar[i], pi = parsed[i];
    var hold = 0.5 * qq * pi.c1;
    var ord = pi.D / qq * pi.c3;
    rows.push({
      name: pi.name, D: pi.D, c1: pi.c1, c3: pi.c3,
      g: pi.g, gEff: pi.gEff, minOrder: pi.min, eoq: pi.eoq, Q: qq,
      resourceUsed: pi.gEff * qq,
      costHold: hold, costOrder: ord, costTotal: hold + ord,
      shrink: (pi.eoq - qq) / pi.eoq
    });
    total += hold + ord;
    totalUncon += 0.5 * pi.eoq * pi.c1 + pi.D / pi.eoq * pi.c3;
  }
  var usedSum = 0;
  for (i = 0; i < rows.length; i++) usedSum += rows[i].resourceUsed;

  return {
    ok: true, model: 'multi',
    constraint: p.constraint, averageBasis: !!p.averageBasis,
    limit: limit, gUnit: gUnit,
    items: rows,
    lambda: lamStar, binding: binding,
    resourceUsed: usedSum,
    slack: limit - usedSum,
    total: total, totalUncon: totalUncon,
    extra: total - totalUncon,
    trace: trace,
    minUse: minUse,
    warns: []
  };
}

/* 供 inv-test.js（Node）复用：浏览器里这些是全局函数，Node 里需要显式导出 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    invNum: invNum, invPct: invPct,
    invEOQ: invEOQ, invEPQ: invEPQ, invShortage: invShortage,
    invDiscount: invDiscount, invMulti: invMulti
  };
}
