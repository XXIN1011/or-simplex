/* =========================================================================
   结果格式化模块 —— 把数字/状态渲染成人看得懂的文字
   -------------------------------------------------------------------------
   本模块只做「值 → 字符串」，不产出 HTML、不碰 DOM、不做 IO：

     asFraction   有理数优先显示成分数（教材口径：1/2 而不是 0.5）
     fmtNum       单个数字的统一格式（含容差归零、去除多余的 0）
     fmtPair      带 M 的检验数：**M 项写在前面**，例如 7M - 4
     rangeParts   区间语义（无界 / 单边 / 一个点 / 闭区间）—— 界面与 CLI 共用一份判断
     rangeText    区间的纯文本写法，例如 3/2 ≤ c1 ≤ 5

   为什么 M 项必须写在前面：M 是形式上的无穷大，7M − 4 显然是正数；
   写成 −4 + 7M 会被初学者读成负数，进而怀疑程序算错了。

   ★ 等价性：asFraction / fmtNum / fmtPair 与重构前 core/simplex-core.js 逐字符相同，
     显示结果一字未变（有 deep-snapshot 的 txt 哈希对拍兜底）。
   ========================================================================= */
'use strict';

var EPS = require('./util.js').EPS;

/**
 * asFraction —— 尝试把小数写成漂亮的分数。
 * 分母从 1 试到 200，分子足够接近整数就算命中。
 * @param {number} v
 * @returns {string|null} 形如 '3'、'2/5'；试不出来返回 null（交给 fmtNum 走小数/科学计数）
 */
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

/**
 * fmtNum —— 数字的统一显示格式。
 * @param {number} v
 * @returns {string} 容差内的 0 显示成 '0'；能写成分数就写分数；否则 6 位有效数字并去掉尾随 0；
 *                   非法值（null/undefined/NaN）显示成 '—'
 */
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

/**
 * fmtPair —— 带 M 的检验数格式化：M 项在前、常数项在后。
 * @param {{a:number,b:number}} p 表示 a + b·M
 * @returns {string} '7M - 4'、'2M + 3'、'-M - 3'、'0'、纯数字（b = 0 时）
 */
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

/**
 * rangeParts —— 把「允许变化范围」判成一种语义，供界面与 CLI 各自渲染。
 * @param {number} lo 下界（可为 -Infinity）
 * @param {number} hi 上界（可为 Infinity）
 * @returns {{kind:string, lo:number, hi:number}} kind ∈ free | le | ge | eq | between
 */
function rangeParts(lo, hi) {
  var noLo = (lo === -Infinity), noHi = (hi === Infinity);
  if (noLo && noHi) return { kind: 'free', lo: lo, hi: hi };
  if (noLo) return { kind: 'le', lo: lo, hi: hi };
  if (noHi) return { kind: 'ge', lo: lo, hi: hi };
  if (Math.abs(hi - lo) < 1e-9) return { kind: 'eq', lo: lo, hi: hi };
  return { kind: 'between', lo: lo, hi: hi };
}

/**
 * rangeText —— 把区间写成教材里的不等式（纯文本版）。
 * @param {number} lo 下界
 * @param {number} hi 上界
 * @param {string} name 变量名，例如 'c1'、'b2'
 * @returns {string} '可任意取值' / 'c1 ≤ 4' / 'c1 ≥ 3/2' / 'c1 = 2' / '3/2 ≤ c1 ≤ 5'
 */
function rangeText(lo, hi, name) {
  var p = rangeParts(lo, hi);
  if (p.kind === 'free') return '可任意取值';
  if (p.kind === 'le') return name + ' ≤ ' + fmtNum(p.hi);
  if (p.kind === 'ge') return name + ' ≥ ' + fmtNum(p.lo);
  if (p.kind === 'eq') return name + ' = ' + fmtNum(p.lo);
  return fmtNum(p.lo) + ' ≤ ' + name + ' ≤ ' + fmtNum(p.hi);
}

/* 零容差判断：把「毛刺」当 0。与全局 EPS 同为 1e-9（原来散在 sens-core 的 co0/LAM_EPS）。 */
var _nearZero = require('./util.js').nearZero;

/**
 * fmtAff —— 仿射表达式 a + b·λ 的显示（参数线性规划用）。
 * 逐字符复刻原 core/sens-core.js 的实现（含 U+2212 减号、系数 1 省略的写法），
 * 因为界面上显示的 λ 表达式是题库/回归断言的一部分。
 * @param {{a:number,b:number}} p 表示 a + b·λ
 * @returns {string} 例如 '13 + 2λ'、'14'、'−1/2λ'、'2 − 1/2λ'
 */
function fmtAff(p) {
  var a = _nearZero(p.a) ? 0 : p.a, b = _nearZero(p.b) ? 0 : p.b;
  if (b === 0) return fmtNum(a);
  var bs = (Math.abs(Math.abs(b) - 1) < EPS ? '' : fmtNum(Math.abs(b))) + 'λ';
  if (a === 0) return (b < 0 ? '−' : '') + bs;
  return fmtNum(a) + (b > 0 ? ' + ' : ' − ') + bs;
}

/* ---------------- 完整可读报告（CLI / 日志用；界面走的是 HTML 渲染） ---------------- */

/* 把 Σ c_j·name_j 渲染成可读表达式：系数 1 省略、系数 0 跳过（与界面同一套规则） */
function linExpr(coeffs, names) {
  var out = '';
  for (var j = 0; j < coeffs.length; j++) {
    var c = coeffs[j];
    if (Math.abs(c) < 1e-12) continue;
    var a = Math.abs(c);
    var cs = (Math.abs(a - 1) < 1e-12) ? '' : fmtNum(a);
    var term = cs + names[j];
    if (!out) out = (c < 0 ? '-' : '') + term;
    else out += (c < 0 ? ' - ' : ' + ') + term;
  }
  return out || '0';
}

/* 关系符显示成数学符号（内部存的是 <= / >= / =） */
function relSym(rel) {
  return rel === '<=' ? '≤' : (rel === '>=' ? '≥' : '=');
}

/* 把一张单纯形表渲染成等宽文本（列宽按内容自适应，M 项很宽也不会挤在一起） */
function tableText(res, step) {
  var names = res.vars.map(function (v) { return v.name; });
  var N = names.length;
  function pad(s, n) { s = String(s); return s.length >= n ? s : (new Array(n - s.length + 1).join(' ') + s); }

  /* 列宽：先按表头（变量名）算，再让每一列的实际内容（含带 M 的 σ 项）撑开 */
  var w = [], cells = [], orowCells = [];
  for (var j = 0; j < N; j++) {
    w.push(Math.max(7, names[j].length + 2));
    cells.push([]);
    orowCells.push(fmtPair(step.obj[j]));
  }
  for (var i = 0; i < res.mConstraints; i++) {
    for (var j2 = 0; j2 < N; j2++) cells[j2].push(fmtNum(step.rows[i][j2]));
  }
  for (var j3 = 0; j3 < N; j3++) {
    for (var k = 0; k < cells[j3].length; k++) w[j3] = Math.max(w[j3], cells[j3][k].length + 2);
    w[j3] = Math.max(w[j3], orowCells[j3].length + 2);
  }
  var bCells = [fmtPair(step.obj[N])];
  for (var i2 = 0; i2 < res.mConstraints; i2++) bCells.push(fmtNum(step.rows[i2][N]));
  var bW = Math.max(8, Math.max.apply(null, bCells.map(function (s) { return s.length + 2; })));

  var head = pad('基', 5) + ' |';
  for (var j4 = 0; j4 < N; j4++) head += pad(names[j4], w[j4]);
  head += ' |' + pad('b', bW);
  var lines = [head];

  for (var i3 = 0; i3 < res.mConstraints; i3++) {
    var line = pad(names[step.basis[i3]], 5) + ' |';
    for (var j5 = 0; j5 < N; j5++) line += pad(fmtNum(step.rows[i3][j5]), w[j5]);
    line += ' |' + pad(fmtNum(step.rows[i3][N]), bW);
    lines.push(line);
  }

  var orow = pad('σ', 5) + ' |';
  for (var j6 = 0; j6 < N; j6++) orow += pad(orowCells[j6], w[j6]);
  orow += ' |' + pad(fmtPair(step.obj[N]), bW);
  lines.push(orow);
  return lines.join('\n');
}

/**
 * report —— 把一次求解结果渲染成**纯文本完整报告**（标准型 → 逐张迭代表 → 结论 → 对偶 → 灵敏度）。
 * 供 CLI 与日志使用；界面用的是 HTML 渲染器（src/web/），两者渲染规则一致。
 * @param {object} res simplexSolve 的返回值
 * @param {object} problem 原始问题（渲染「原问题」那几行要用）
 * @param {object} [opts] { tables: boolean 是否打印每张迭代表，默认 true }
 * @returns {string} 多行文本
 */
function report(res, problem, opts) {
  opts = opts || {};
  var withTables = (opts.tables === undefined) ? true : opts.tables;
  var out = [];
  var xNames = res.ok ? res.vars.slice(0, res.nDecision).map(function (v) { return v.name; }) : [];

  if (!res.ok) {
    return '输入有误：' + res.message;
  }

  /* ① 原问题 */
  out.push('原问题：');
  out.push('  ' + res.direction + ' z = ' + linExpr(problem.c, xNames));
  problem.constraints.forEach(function (k, i) {
    out.push('  ' + (i === 0 ? 's.t. ' : '     ') + linExpr(k.coef, xNames) + ' '
      + relSym(k.rel) + ' ' + fmtNum(k.rhs));
  });
  out.push('  ' + xNames.join(', ') + ' ≥ 0');

  /* ② 标准型：目标是「原始目标 + 松弛/人工变量」，约束直接取第一张快照的行
     （第一张表就是求解器实际使用的标准型，不要另写一套推导 —— 两套实现迟早会分叉） */
  var init = res.steps[0];
  var allNames = res.vars.map(function (v) { return v.name; });
  out.push('');
  out.push('标准型：');
  /* 目标函数按「决策变量 → 松弛/剩余 → 人工变量」分组书写；
     零系数要写出来（这是「松弛变量不影响目标函数」的可见证据），系数 1 省略。 */
  var order = ['x', 's', 'a'], zStr = '';
  order.forEach(function (kind) {
    res.vars.forEach(function (v, j) {
      if (v.kind !== kind) return;
      if (kind === 'a') {                                    /* 人工变量：−M */
        zStr += (zStr ? ' - ' : '-') + 'M' + v.name;
        return;
      }
      var c = (kind === 'x') ? (res.swapped ? -problem.c[j] : problem.c[j]) : 0;
      if (Math.abs(c) < 1e-12) { zStr += (zStr ? ' + ' : '') + '0' + v.name; return; }
      var a = Math.abs(c);
      var cs = (Math.abs(a - 1) < 1e-12) ? '' : fmtNum(a);
      zStr += (zStr ? (c < 0 ? ' - ' : ' + ') : (c < 0 ? '-' : '')) + cs + v.name;
    });
  });
  out.push('  max z' + (res.swapped ? "'" : '') + ' = ' + (zStr || '0'));
  for (var i = 0; i < res.mConstraints; i++) {
    out.push('  ' + (i === 0 ? 's.t. ' : '     ') + linExpr(init.rows[i].slice(0, res.vars.length), allNames)
      + ' = ' + fmtNum(init.rows[i][res.vars.length]));
  }
  out.push('  ' + allNames.join(', ') + ' ≥ 0');

  /* ③ 迭代过程 */
  if (withTables) {
    res.steps.forEach(function (step, idx) {
      out.push('');
      out.push('第 ' + idx + ' 张表' + (idx === 0 ? '（初始表）' : '（第 ' + idx + ' 次迭代后）') + '：');
      out.push(tableText(res, step));
      if (step.note) out.push('  ' + step.note);
      else if (step.entering !== null) {
        var rs = (step.ratios || []).map(function (r) {
          return r.ok ? 'θ' + (r.row + 1) + '=' + fmtNum(r.theta) : 'θ' + (r.row + 1) + '=—';
        }).join('  ');
        out.push('  入基 ' + res.vars[step.entering].name
          + '，出基 ' + (step.leaving === null ? '—' : res.vars[step.basis[step.leaving]].name)
          + (step.pivot === null ? '' : '，枢轴 ' + fmtNum(step.pivot))
          + '；比值检验 ' + rs
          + (step.degenerate ? '（退化：θ = 0，本步不改善目标值）' : ''));
      }
    });
  }

  /* ④ 结论 */
  out.push('');
  out.push('结论：' + STATUS_TEXT[res.status]);
  if (res.status === 'optimal') {
    out.push('  最优解 x = (' + res.solution.map(fmtNum).join(', ') + ')，z = ' + fmtNum(res.objective));
    if (res.altOptimal.length) {
      out.push('  多重最优解：' + res.altOptimal.map(function (i2) { return res.vars[i2].name; }).join('、')
        + ' 的检验数为 0。');
    }
  }

  /* ⑤ 对偶解 */
  if (res.dual && res.dual.length) {
    out.push('');
    out.push('对偶解（影子价格）：' + res.dual.map(function (v, i3) { return 'y' + (i3 + 1) + ' = ' + fmtNum(v); }).join('　'));
  }

  /* ⑥ 灵敏度 */
  if (res.sensitivity) {
    var s = res.sensitivity;
    if (s.c.length) {
      out.push('');
      out.push('灵敏度分析 · 目标函数系数 c：');
      s.c.forEach(function (e) {
        out.push('  ' + rangeText(e.lo, e.hi, 'c' + (e.j + 1))
          + '（当前 ' + fmtNum(e.current) + (e.basic ? '，基变量' : '，非基变量') + '）');
      });
    }
    if (s.b.length) {
      out.push('灵敏度分析 · 右端项 b：');
      s.b.forEach(function (e) {
        out.push('  ' + rangeText(e.lo, e.hi, 'b' + (e.i + 1))
          + '（当前 ' + fmtNum(e.current) + '，y = ' + fmtNum(e.shadow) + '）');
      });
    }
    if (s.degenerate) {
      out.push('  注意：最优基里含取值为 0 的人工变量（退化），区间不唯一。');
    }
  }

  return out.join('\n');
}

/* status -> 一句话结论（与界面上的结论卡同义，措辞面向终端） */
var STATUS_TEXT = {};
STATUS_TEXT['optimal'] = '最优解（所有检验数 σⱼ ≤ 0）';
STATUS_TEXT['unbounded'] = '无界解（入基列没有正系数，目标值可无限增大）';
STATUS_TEXT['infeasible'] = '无可行解（约束互相矛盾）';
STATUS_TEXT['iteration-limit'] = '未在限定步数内收敛（可能存在退化循环）';

module.exports = {
  asFraction: asFraction,
  fmtNum: fmtNum,
  fmtPair: fmtPair,
  fmtAff: fmtAff,
  rangeParts: rangeParts,
  rangeText: rangeText,
  linExpr: linExpr,
  relSym: relSym,
  tableText: tableText,
  report: report
};
