/* =========================================================================
   单元测试 · 数据模型层（core/model.js）
   -------------------------------------------------------------------------
   模型层只做两件事：给字段一个唯一的定义处、给字段顺序一个唯一的出处
   （结果对象会被 JSON.stringify 后逐字节对拍，顺序变了哈希就变了）。
   因此这里的断言集中在**结构契约**上，而不是数值。
   ========================================================================= */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const model = require('../../src/core/model.js');

test('createConstraint / createVariable / createRatio：字段与顺序固定', () => {
  assert.deepStrictEqual(model.createConstraint([1, 2], '<=', 3), { coef: [1, 2], rel: '<=', rhs: 3 });
  assert.deepStrictEqual(model.createVariable('x1', 'x'), { name: 'x1', kind: 'x' });
  assert.deepStrictEqual(model.createRatio(2, 1.5, true), { row: 2, theta: 1.5, ok: true });
  assert.deepStrictEqual(model.createRatio(0, null, false), { row: 0, theta: null, ok: false });
  /* 键的顺序也要稳定 */
  assert.deepStrictEqual(Object.keys(model.createRatio(0, 1, true)), ['row', 'theta', 'ok']);
});

test('createSolveResult：字段顺序就是对外契约', () => {
  const r = model.createSolveResult({
    status: 'optimal', direction: 'max', swapped: false,
    vars: [], nDecision: 0, mConstraints: 0, steps: [], basis: [],
    solution: [], objective: 0, dual: null, sensitivity: null,
    artificialInBasis: false, altOptimal: []
  });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(Object.keys(r), [
    'ok', 'status', 'direction', 'swapped', 'vars', 'nDecision', 'mConstraints',
    'steps', 'basis', 'solution', 'objective', 'dual', 'sensitivity',
    'artificialInBasis', 'altOptimal'
  ]);
});

test('createStandardForm：15 个字段齐全', () => {
  const sf = model.createStandardForm({
    direction: 'max', swapped: false, c0: [1], n: 1, m: 1, N: 2,
    vars: [], basis: [1], cObj: [], rows: [[0, 0, 0]], A0: [[0, 0]],
    obj: [], flipSign: [1], consRhs: [1], userRhs: [1]
  });
  assert.deepStrictEqual(Object.keys(sf), [
    'direction', 'swapped', 'c0', 'n', 'm', 'N', 'vars', 'basis', 'cObj',
    'rows', 'A0', 'obj', 'flipSign', 'consRhs', 'userRhs'
  ]);
});

test('createSnapshot：默认字段齐全，extra 覆盖已有键、新键按传入顺序追加', () => {
  const form = {
    m: 2, N: 3, basis: [1, 2],
    rows: [[0, 1, 0, 4], [1, 0, 1, 5]],
    obj: [{ a: 1, b: 0 }, { a: 0, b: 0 }, { a: 0, b: -1 }, { a: -3, b: 0 }]
  };
  const s = model.createSnapshot(form, { iter: 2, entering: 0, leaving: 1, pivot: 1, ratios: null, degenerate: true, note: '退化' });
  assert.strictEqual(s.iter, 2);
  assert.deepStrictEqual(s.basis, [1, 2]);
  assert.strictEqual(s.entering, 0);
  assert.strictEqual(s.leaving, 1);
  assert.strictEqual(s.pivot, 1);
  assert.strictEqual(s.ratios, null);
  assert.strictEqual(s.degenerate, true);
  assert.strictEqual(s.note, '退化');
  assert.deepStrictEqual(Object.keys(s), ['iter', 'rows', 'obj', 'basis', 'entering', 'leaving', 'pivot', 'ratios', 'degenerate', 'note']);
});

test('createSnapshot：深拷贝 —— 快照生成后再迭代，已记录的表不变', () => {
  const form = {
    m: 1, N: 2, basis: [1],
    rows: [[1, 1, 4]],
    obj: [{ a: 1, b: 0 }, { a: 0, b: 0 }, { a: -4, b: 0 }]
  };
  const s = model.createSnapshot(form, {});
  form.rows[0][0] = 999;               // 模拟后续枢轴变换
  form.rows[0][2] = 888;
  form.obj[0].a = 777;
  form.basis[0] = 0;
  assert.deepStrictEqual(s.rows, [[1, 1, 4]]);
  assert.deepStrictEqual(s.obj[0], { a: 1, b: 0 });
  assert.deepStrictEqual(s.basis, [1]);
  /* 快照里的 pair 也是新对象，不是引用 */
  assert.notStrictEqual(s.obj[0], form.obj[0]);
});

test('createSensitivityReport：c / b / degenerate 三件套', () => {
  const r = model.createSensitivityReport([{ j: 0 }], [{ i: 0 }], true);
  assert.deepStrictEqual(r, { c: [{ j: 0 }], b: [{ i: 0 }], degenerate: true });
  assert.deepStrictEqual(Object.keys(r), ['c', 'b', 'degenerate']);
});

test('createLPProblem：原样承载用户输入，不做任何加工', () => {
  const cons = [model.createConstraint([1, 2], '<=', 8)];
  const p = model.createLPProblem('max', [2, 3], cons);
  assert.deepStrictEqual(p, { direction: 'max', c: [2, 3], constraints: cons });
});
