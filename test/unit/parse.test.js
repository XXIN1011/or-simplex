/* =========================================================================
   单元测试 · 输入解析模块（core/parse.js）
   -------------------------------------------------------------------------
   解析层负责三件事：校验（能不能算）、规范化（右端项非负）、建标准型（变量表 + 初始表）。
   测试只断言**可以手工验证的性质**：
     · 校验文案与顺序（界面直接显示，改一个字都是回归）
     · 右端项为负的约束被整行取负并翻转关系符，flipSign 记账正确
     · 变量表与初始基（≤ → s；≥ → s 与 a；= → a）
     · 初始 σ 行 = c_j − c_B·(B⁻¹P_j)，在测试里**独立重算**一遍核对
   ========================================================================= */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const parse = require('../../src/core/parse.js');
const U = require('../../src/core/util.js');

const P = (direction, c, constraints) => ({ direction, c, constraints });
const C = (coef, rel, rhs) => ({ coef, rel, rhs });

test('validate：0 变量 / 0 约束是合法输入（要有确定结论，不是报错）', () => {
  assert.strictEqual(parse.validate(P('max', [], [])).ok, true);
  assert.strictEqual(parse.validate(P('max', [1, 2], [])).ok, true);
});

test('validate：系数个数不一致 / 右端项非数字 / 目标系数非数字 的文案与顺序', () => {
  const r = parse.validate(P('max', [1, 2], [C([1], '<=', 3)]));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.message, '第 1 个约束的系数个数与变量数不一致');

  const r2 = parse.validate(P('max', [1, 'x'], [C([1, 2], '<=', 'abc')]));
  assert.strictEqual(r2.ok, false);
  /* 先逐条报约束，再报目标函数系数 —— 顺序即校验顺序 */
  assert.strictEqual(r2.message, '第 1 个约束的右端项不是有效数字；目标函数第 2 个系数不是有效数字');
});

test('validate：direction 只认 min，其余一律当 max；min 记 swapped', () => {
  assert.strictEqual(parse.validate(P('max', [1], [])).swapped, false);
  const v = parse.validate(P('min', [1], []));
  assert.strictEqual(v.swapped, true);
  assert.strictEqual(v.direction, 'min');
  assert.strictEqual(parse.validate(P('随便写', [1], [])).direction, 'max');
});

test('规范化：右端项为负 → 整行取负 + 关系符翻转 + flipSign = −1', () => {
  const r = parse.toStandardForm(P('max', [1, 1], [C([-1, 2], '<=', -4)]));
  assert.strictEqual(r.ok, true);
  const sf = r.form;
  assert.deepStrictEqual(sf.flipSign, [-1]);
  assert.deepStrictEqual(sf.consRhs, [4]);              // 内部 b = 4
  assert.deepStrictEqual(sf.userRhs, [-4]);             // 用户 b 仍是 −4
  /* 关系符由 ≤ 翻成 ≥：所以这一行补的是「剩余变量 + 人工变量」，基是人工变量 */
  assert.strictEqual(sf.vars[2].name, 's1');
  assert.strictEqual(sf.vars[3].name, 'a1');
  assert.strictEqual(sf.basis[0], 3);
});

test('规范化：= 约束不变号；≥ 约束补剩余变量与人工变量', () => {
  const sf = parse.toStandardForm(P('max', [1, 1], [
    C([1, 1], '=', 3), C([1, 0], '>=', 2), C([0, 1], '<=', 5)
  ])).form;
  assert.deepStrictEqual(sf.flipSign, [1, 1, 1]);
  /* 变量表顺序：x1 x2 | = 行的人工 | ≥ 行的剩余+人工 | ≤ 行的松弛。
     s/a 的编号跟着**约束序号**走：第 1 条是 = 约束，只有人工 a1，没有 s1。 */
  assert.deepStrictEqual(sf.vars.map(v => v.name), ['x1', 'x2', 'a1', 's2', 'a2', 's3']);
  assert.deepStrictEqual(sf.vars.map(v => v.kind), ['x', 'x', 'a', 's', 'a', 's']);
  assert.deepStrictEqual(sf.basis, [2, 4, 5]);          // a1 / a2 / s3
});

test('标准型：初始基的列必须构成单位阵（这是「初始基可行」的前提）', () => {
  const sf = parse.toStandardForm(P('max', [1, 2, 3], [
    C([1, 1, 0], '<=', 4), C([0, 1, 1], '>=', 5), C([1, 0, 1], '=', 6)
  ])).form;
  for (let i = 0; i < sf.m; i++) {
    for (let k = 0; k < sf.m; k++) {
      const expect = (i === k) ? 1 : 0;
      assert.strictEqual(sf.A0[i][sf.basis[k]], expect,
        `A0[${i}][basis[${k}]] 应为 ${expect}`);
    }
  }
});

test('标准型：σ 行 = c_j − c_B·P_j（在测试里独立重算核对）', () => {
  const sf = parse.toStandardForm(P('min', [4, 1], [
    C([3, 1], '=', 3), C([4, 3], '>=', 6), C([1, 2], '<=', 4)
  ])).form;
  /* 独立重算：σ_j = c_j − Σ_i c_B[i]·A0[i][j]；末列是 −z = −Σ c_B[i]·b_i */
  for (let j = 0; j <= sf.N; j++) {
    let expect = (j < sf.N) ? (sf.cObj[j].b !== 0 ? { a: sf.cObj[j].a, b: sf.cObj[j].b } : sf.cObj[j]) : { a: 0, b: 0 };
    for (let i = 0; i < sf.m; i++) {
      const cB = sf.cObj[sf.basis[i]];
      const cell = (j < sf.N) ? sf.A0[i][j] : sf.rows[i][sf.N];
      expect = U.pSub(expect, U.pMul(cB, cell));
    }
    assert.ok(Math.abs(sf.obj[j].a - expect.a) < 1e-12 && Math.abs(sf.obj[j].b - expect.b) < 1e-12,
      `σ[${j}] 不符：得到 ${JSON.stringify(sf.obj[j])}，重算 ${JSON.stringify(expect)}`);
  }
});

test('标准型：人工变量在目标函数里带 −M（pair 形式），松弛变量系数为 0', () => {
  const sf = parse.toStandardForm(P('max', [1, 1], [C([1, 1], '>=', 3)])).form;
  assert.deepStrictEqual(sf.cObj[0], { a: 1, b: 0 });   // x1
  assert.deepStrictEqual(sf.cObj[2], { a: 0, b: 0 });   // s1（系数 0）
  assert.deepStrictEqual(sf.cObj[3], { a: 0, b: -1 });  // a1（−M）
});

test('标准型：min 问题内部按 max 处理（c 取负），但原始 c0 原样保留', () => {
  const sf = parse.toStandardForm(P('min', [2, 3], [C([1, 1], '<=', 3)])).form;
  assert.strictEqual(sf.swapped, true);
  assert.deepStrictEqual(sf.c0, [2, 3]);                 // 算影子价格必须用原系数
  assert.deepStrictEqual(sf.cObj[0], { a: -2, b: 0 });   // 内部按 max 化
  assert.deepStrictEqual(sf.cObj[1], { a: -3, b: 0 });
});

test('规范化：容差内的系数与右端项被压成精确 0（避免 −0 与 1e−17 混进表里）', () => {
  const sf = parse.toStandardForm(P('max', [1, 0], [C([1e-12, 1e-12], '<=', 1e-12)])).form;
  assert.deepStrictEqual(sf.A0[0].slice(0, 2), [0, 0]);
  assert.strictEqual(sf.rows[0][sf.N], 0);
});
