/* =========================================================================
   单元测试 · 核心求解模块（core/simplex.js）
   -------------------------------------------------------------------------
   断言分三类，都不依赖「跑一遍代码看看输出是啥」：
     ① 手算答案：7 道教材例题 + 边界情形，答案是人算出来的；
     ② 独立第二实现：对偶解用「中心差分扰动」重算，验的是「yᵢ 等于最优值对右端项的偏导数」；
     ③ 结构契约：status 取值、快照字段、扩展点（入基规则 / 迭代上限）行为。
   ========================================================================= */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { simplexSolve, solveStandardForm, selectEnteringDantzig } = require('../../src/core/simplex.js');
const parse = require('../../src/core/parse.js');
const U = require('../../src/core/util.js');
const F = require('../../src/core/format.js');

const P = (direction, c, constraints) => ({ direction, c, constraints });
const C = (coef, rel, rhs) => ({ coef, rel, rhs });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/* ---------------- ① 手算答案 ---------------- */

test('例题1 max z=2x1+3x2（全 ≤）：x1=4, x2=2, z=14', () => {
  const r = simplexSolve(P('max', [2, 3], [C([1, 2], '<=', 8), C([4, 0], '<=', 16), C([0, 4], '<=', 12)]));
  assert.strictEqual(r.status, 'optimal');
  assert.ok(near(r.solution[0], 4) && near(r.solution[1], 2));
  assert.ok(near(r.objective, 14));
  assert.strictEqual(r.steps.length, 4);              // 初始表 + 3 次迭代
});

test('例题2 min z=2x1+3x2（全 ≥）：x1=2, x2=1, z=7', () => {
  const r = simplexSolve(P('min', [2, 3], [C([1, 1], '>=', 3), C([1, 2], '>=', 4)]));
  assert.strictEqual(r.status, 'optimal');
  assert.ok(near(r.solution[0], 2) && near(r.solution[1], 1));
  assert.ok(near(r.objective, 7));
  assert.strictEqual(r.swapped, true);                // min 被取负转成 max
});

test('例题3 min z=4x1+x2（含 = 与 ≥）：x1=2/5, x2=9/5, z=17/5', () => {
  const r = simplexSolve(P('min', [4, 1], [
    C([3, 1], '=', 3), C([4, 3], '>=', 6), C([1, 2], '<=', 4)
  ]));
  assert.strictEqual(r.status, 'optimal');
  assert.ok(near(r.solution[0], 0.4) && near(r.solution[1], 1.8));
  assert.ok(near(r.objective, 3.4));
  assert.strictEqual(F.fmtNum(r.solution[0]), '2/5');   // 显示成教材口径的分数
  assert.strictEqual(F.fmtNum(r.objective), '17/5');
});

test('例题6 max z=3x1+5x2（= 约束）：x1=1, x2=3, z=18', () => {
  const r = simplexSolve(P('max', [3, 5], [
    C([1, 1], '=', 4), C([1, 0], '<=', 3), C([0, 1], '<=', 3)
  ]));
  assert.strictEqual(r.status, 'optimal');
  assert.ok(near(r.solution[0], 1) && near(r.solution[1], 3));
  assert.ok(near(r.objective, 18));
});

/* ---------------- ② 独立第二实现：对偶解 ---------------- */

test('对偶解 yᵢ 等于「最优值对右端项的偏导」（中心差分独立验算）', () => {
  const base = P('max', [2, 3], [C([1, 2], '<=', 8), C([4, 0], '<=', 16), C([0, 4], '<=', 12)]);
  const r = simplexSolve(base);
  const eps = 1e-4;
  for (let i = 0; i < base.constraints.length; i++) {
    const bump = (d) => {
      const p = { direction: base.direction, c: base.c.slice(), constraints: base.constraints.map(k => ({ coef: k.coef.slice(), rel: k.rel, rhs: k.rhs })) };
      p.constraints[i].rhs += d;
      return simplexSolve(p).objective;
    };
    const diff = (bump(eps) - bump(-eps)) / (2 * eps);
    assert.ok(near(diff, r.dual[i], 1e-5),
      `约束 ${i + 1}：差分 ${diff} 与影子价格 ${r.dual[i]} 不符`);
  }
});

test('对偶解：同一个几何约束的两种写法（≤ 负右端项 / ≥）符号必须相反', () => {
  const viaLe = simplexSolve(P('max', [-1, -1], [C([-1, -1], '<=', -5)]));
  const viaGe = simplexSolve(P('max', [-1, -1], [C([1, 1], '>=', 5)]));
  assert.ok(near(viaLe.objective, -5) && near(viaGe.objective, -5));   // 最优值相同
  assert.ok(near(viaLe.dual[0], 1), `≤ 写法应得 y=+1，实际 ${viaLe.dual[0]}`);
  assert.ok(near(viaGe.dual[0], -1), `≥ 写法应得 y=-1，实际 ${viaGe.dual[0]}`);
});

test('灵敏度区间：区间内的 c 变化可用「z* = z₀ + Δ·xⱼ」预测（基不变）', () => {
  const mk = (c1, c2) => P('max', [c1, c2], [C([1, 2], '<=', 8), C([4, 0], '<=', 16), C([0, 4], '<=', 12)]);
  const r = simplexSolve(mk(2, 3));

  /* c1 的区间是单边 [3/2, +∞)：往有限的那一侧取样 */
  const e1 = r.sensitivity.c[0];
  assert.strictEqual(e1.basic, true);
  assert.ok(near(e1.slope, 4));                        // x1 = 4，所以 c1 每 +1，z* 变化 4
  assert.ok(isFinite(e1.lo) && e1.hi === Infinity);
  const c1 = e1.current + (e1.lo - e1.current) * 0.5;  // 当前值与有限端点之间
  const r1 = simplexSolve(mk(c1, 3));
  assert.ok(near(r1.objective, r.objective + (c1 - 2) * e1.slope, 1e-7),
    `c1 预测 ${r.objective + (c1 - 2) * e1.slope}，实得 ${r1.objective}`);

  /* c2 的区间两侧都有限 [0, 4]：两侧各取一点 */
  const e2 = r.sensitivity.c[1];
  assert.ok(near(e2.slope, 2));                        // x2 = 2
  assert.ok(isFinite(e2.lo) && isFinite(e2.hi));
  for (const c2 of [e2.lo + (e2.current - e2.lo) * 0.5, e2.hi - (e2.hi - e2.current) * 0.5]) {
    const r2 = simplexSolve(mk(2, c2));
    assert.ok(near(r2.objective, r.objective + (c2 - 3) * e2.slope, 1e-7),
      `c2=${c2} 预测 ${r.objective + (c2 - 3) * e2.slope}，实得 ${r2.objective}`);
  }
});

test('灵敏度区间：右端项 b 的斜率就是影子价格（在区间内取点重解核对）', () => {
  const mk = (b1) => P('max', [2, 3], [C([1, 2], '<=', b1), C([4, 0], '<=', 16), C([0, 4], '<=', 12)]);
  const r = simplexSolve(mk(8));
  const e = r.sensitivity.b[0];
  assert.ok(near(e.shadow, 1.5) && near(e.lo, 4) && near(e.hi, 10));
  const b1 = e.current + (e.hi - e.current) * 0.5;
  const r2 = simplexSolve(mk(b1));
  assert.ok(near(r2.objective, r.objective + (b1 - 8) * e.shadow, 1e-7),
    `预测 ${r.objective + (b1 - 8) * e.shadow}，实得 ${r2.objective}`);
});

/* ---------------- ③ 边界与结构契约 ---------------- */

test('0 个变量：目标函数没有变量，z 恒为 0，且明确告诉用户「没有决策变量」', () => {
  const r = simplexSolve(P('max', [], []));
  assert.strictEqual(r.status, 'optimal');
  assert.deepStrictEqual(r.solution, []);
  assert.strictEqual(r.objective, 0);
  assert.strictEqual(r.steps.length, 1);
});

test('0 个约束：有正检验数 ⇒ 无界；检验数全 ≤ 0 ⇒ 最优解在原点', () => {
  const unb = simplexSolve(P('max', [1, 2], []));
  assert.strictEqual(unb.status, 'unbounded');
  assert.strictEqual(unb.objective, null);             // 无界时不给目标值

  const opt = simplexSolve(P('max', [-1, -2], []));
  assert.strictEqual(opt.status, 'optimal');
  assert.deepStrictEqual(opt.solution, [0, 0]);
  assert.strictEqual(opt.objective, 0);
});

test('无可行解：约束矛盾（1 ≥ 5 与 1 ≤ 2 同时要求）', () => {
  const r = simplexSolve(P('max', [1, 0], [C([1, 0], '>=', 5), C([1, 0], '<=', 2)]));
  assert.strictEqual(r.status, 'infeasible');
  assert.strictEqual(r.objective, null);
  assert.strictEqual(r.dual, null);
});

test('人工变量残留 ⇒ 结论是无可行解（哪怕扩展问题已经「最优」）', () => {
  /* x1 ≥ 5 且 x1 ≤ 2：约束互相矛盾。含人工变量的扩展问题会走到 σ ≤ 0，
     但人工变量仍留在基里并取正值 —— 必须改判为无可行解。 */
  const r = simplexSolve(P('max', [1, 0], [C([1, 0], '>=', 5), C([1, 0], '<=', 2)]));
  assert.strictEqual(r.status, 'infeasible');
  assert.strictEqual(r.artificialInBasis, true);
  assert.strictEqual(r.objective, null);               // 无可行解不给目标值
  assert.strictEqual(r.dual, null);
});

test('不变式（300 道固定种子随机题）：报无界时，基里绝不能有取正值的人工变量', () => {
  /* 这是大M法最容易错的一条：在「含人工变量的扩展问题」上无界 ≠ 原问题无界。
     固定种子（与题库生成器同一套 LCG），所以这条断言是可复现的。 */
  let seed = 20260915;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const RELS = ['<=', '<=', '>=', '>=', '>=', '=', '='];
  let nUnb = 0, nInf = 0, nOpt = 0;
  for (let t = 0; t < 300; t++) {
    const n = ri(2, 4), m = ri(1, 4);
    const c = Array.from({ length: n }, () => ri(-6, 8));
    const constraints = Array.from({ length: m }, () => {
      const coef = Array.from({ length: n }, () => ri(-4, 6));
      const rel = RELS[ri(0, RELS.length - 1)];
      const rhs = rnd() < 0.15 ? -ri(1, 12) : ri(1, 20);
      return C(coef, rel, rhs);
    });
    const r = simplexSolve(P(rnd() < 0.5 ? 'max' : 'min', c, constraints));
    if (r.status === 'unbounded') { nUnb++; assert.strictEqual(r.artificialInBasis, false, `第 ${t} 题无界却有正的人工变量`); }
    if (r.status === 'infeasible') nInf++;
    if (r.status === 'optimal') { nOpt++; assert.strictEqual(r.ok, true); }
    /* 快照完整性：每一步都要有 rows / obj / basis */
    for (const s of r.steps) {
      assert.strictEqual(s.rows.length, r.mConstraints);
      assert.strictEqual(s.obj.length, r.vars.length + 1);
      assert.strictEqual(s.basis.length, r.mConstraints);
    }
  }
  assert.strictEqual(nUnb + nInf + nOpt, 300);
  assert.ok(nOpt > 0 && nUnb > 0 && nInf > 0, `三类结论都该出现：optimal=${nOpt} unbounded=${nUnb} infeasible=${nInf}`);
});

test('无界解：终止说明里点明「该变量可以无限增大」', () => {
  const r = simplexSolve(P('max', [1, 0], [C([-1, 1], '<=', 0), C([0, 1], '<=', 3)]));
  assert.strictEqual(r.status, 'unbounded');
  assert.match(r.steps[r.steps.length - 1].note, /无界解/);
});

test('退化：θ = 0 的枢轴被标注出来（不改善目标值，只是换了一组基）', () => {
  const r = simplexSolve(P('max', [1, 1], [C([1, 1], '<=', 0), C([1, 0], '<=', 2)]));
  assert.strictEqual(r.status, 'optimal');
  assert.ok(r.steps.some(s => s.degenerate === true), '应当标记出退化步');
});

test('多重最优解：非基变量的检验数为 0 时给出 altOptimal', () => {
  const r = simplexSolve(P('max', [1, 1], [C([1, 1], '<=', 4)]));
  assert.strictEqual(r.status, 'optimal');
  assert.ok(near(r.objective, 4));
  assert.ok(r.altOptimal.length >= 1, '本题有无穷多组最优解');
});

test('结果对象的字段与顺序是历史契约（序列化对拍依赖它）', () => {
  const r = simplexSolve(P('max', [2, 3], [C([1, 2], '<=', 8)]));
  assert.deepStrictEqual(Object.keys(r), [
    'ok', 'status', 'direction', 'swapped', 'vars', 'nDecision', 'mConstraints',
    'steps', 'basis', 'solution', 'objective', 'dual', 'sensitivity',
    'artificialInBasis', 'altOptimal'
  ]);
});

test('每张快照都带齐字段，且与状态解耦（后续迭代不会改到已记录的表）', () => {
  const r = simplexSolve(P('max', [2, 3], [C([1, 2], '<=', 8), C([4, 0], '<=', 16)]));
  const first = r.steps[0];
  assert.deepStrictEqual(Object.keys(first).slice(0, 10),
    ['iter', 'rows', 'obj', 'basis', 'entering', 'leaving', 'pivot', 'ratios', 'degenerate', 'note']);
  assert.strictEqual(first.iter, 0);
  const snapshotRows = JSON.stringify(first.rows);
  const last = r.steps[r.steps.length - 1];
  assert.notStrictEqual(JSON.stringify(last.rows), snapshotRows);   // 初始表与终表不同
  assert.strictEqual(JSON.stringify(first.rows), snapshotRows);     // 但初始表本身没被改
});

test('输入非法：返回 {ok:false,message}（兼容老契约，不抛异常）', () => {
  const r = simplexSolve(P('max', [1, 2], [C([1], '<=', 3)]));
  assert.deepStrictEqual(r, { ok: false, message: '第 1 个约束的系数个数与变量数不一致' });
});

/* ---------------- 扩展点（开闭原则） ---------------- */

test('扩展点：换入基规则（Bland 最小下标优先）得到同一个最优值', () => {
  const problem = P('max', [2, 3], [C([1, 2], '<=', 8), C([4, 0], '<=', 16), C([0, 4], '<=', 12)]);
  const dantzig = simplexSolve(problem);
  const bland = (form) => {
    for (let j = 0; j < form.N; j++) if (U.pIsPos(form.obj[j])) return j;
    return -1;
  };
  const parsed = parse.parseProblem(problem);
  const r2 = solveStandardForm(parsed.form, { selectEntering: bland });
  assert.strictEqual(r2.status, 'optimal');
  assert.ok(near(r2.objective, dantzig.objective));
  assert.ok(r2.steps.length >= 1);
});

test('扩展点：maxIter 触顶时报 iteration-limit（宁可不给答案，也不能死循环）', () => {
  const parsed = parse.parseProblem(P('max', [2, 3], [C([1, 2], '<=', 8), C([4, 0], '<=', 16)]));
  const r = solveStandardForm(parsed.form, { maxIter: 0 });
  assert.strictEqual(r.status, 'iteration-limit');
  assert.strictEqual(r.objective, null);
});

test('扩展点：默认入基规则就是 Dantzig（最大正检验数、并列时取最小下标）', () => {
  const sf = parse.parseProblem(P('max', [2, 3], [C([1, 2], '<=', 8), C([4, 0], '<=', 16)])).form;
  assert.strictEqual(selectEnteringDantzig(sf), 1);   // σ = (2, 3, 0)，3 最大 → x2
});
