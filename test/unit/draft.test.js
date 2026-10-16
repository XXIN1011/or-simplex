'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStore, validLinear, validAssignment } = require('../../src/web/draft.js');
const linear = () => ({ direction: 'min', c: ['1e', '−2'], constraints: [{ coef: ['', '1/2'], rel: '>=', rhs: '3' }] });
function fixture() {
  const data = new Map();
  const storage = { getItem: k => data.has(k) ? data.get(k) : null,
    setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  return { data, storage: () => storage };
}
const valid = p => validLinear(p, 6, 8);

test('草稿保留未完成和非法的原始数字，求解校验仍在原输入流程进行', () => {
  const f = fixture(), store = createStore('simplex', valid, f.storage);
  assert.equal(store.load().status, 'empty');
  assert.equal(store.save(linear()), true);
  assert.deepEqual(store.load(), { status: 'restored', data: linear() });
});
test('各模块只覆盖自己的当前题目，清空不影响其他题目和主题', () => {
  const f = fixture();
  f.data.set('or-theme', 'dark');
  const a = createStore('simplex', valid, f.storage), b = createStore('sens', valid, f.storage);
  a.save(linear()); b.save(linear());
  a.save({ direction: 'max', c: [], constraints: [] });
  assert.equal(f.data.size, 3);
  assert.equal(a.clear(), true);
  assert.equal(a.load().status, 'empty');
  assert.equal(b.load().status, 'restored');
  assert.equal(f.data.get('or-theme'), 'dark');
});
test('损坏、未知版本和结构不匹配的草稿不会进入界面', () => {
  const f = fixture(), store = createStore('simplex', valid, f.storage);
  for (const raw of ['{broken', 'null', '[]', JSON.stringify({ version: 2, data: linear() }),
    JSON.stringify({ version: 1, data: { c: [] } }), 'x'.repeat(1048577)]) {
    f.data.set('or-simplex-draft:simplex', raw);
    assert.equal(store.load().status, 'invalid');
  }
});
test('拒绝存储访问或存储配额不足时不抛异常，也不假报保存成功', () => {
  const denied = () => { throw new Error('denied'); };
  const store = createStore('simplex', valid, denied);
  assert.equal(store.load().status, 'unavailable');
  assert.equal(store.save(linear()), false);
  assert.equal(store.clear(), false);
  const quota = createStore('simplex', valid, () => ({ setItem() { throw new Error('quota'); } }));
  assert.equal(quota.save(linear()), false);
});
test('线性题目恢复前检查维度、关系符与整数变量类型', () => {
  assert.equal(valid(linear()), true);
  assert.equal(valid({ direction: 'max', c: [], constraints: [] }), true);
  for (const change of [p => p.c.push('3'), p => p.constraints[0].rel = '!=', p => p.constraints[0].rhs = null,
    p => p.c[0] = {}, p => p.vtypes = ['bin'], p => p.vtypes = ['bin', 'bad'], p => p.c = Array(7).fill(0)]) {
    const p = linear(); change(p); assert.equal(valid(p), false);
  }
  const p = linear(); p.vtypes = ['cont', 'bin']; assert.equal(valid(p), true);
});
test('指派草稿保留禁止指派标记和零维度，拒绝不完整矩阵', () => {
  assert.equal(validAssignment({ direction: 'max', rows: 1, cols: 2, cells: [['×', '1e']] }), true);
  assert.equal(validAssignment({ direction: 'min', rows: 0, cols: 3, cells: [] }), true);
  assert.equal(validAssignment({ direction: 'min', rows: 2, cols: 0, cells: [[], []] }), true);
  for (const p of [null, { direction: 'min', rows: 1, cols: 2, cells: [['1']] },
    { direction: 'min', rows: -1, cols: 0, cells: [] }, { direction: 'min', rows: 0, cols: 9, cells: [] }]) {
    assert.equal(validAssignment(p), false);
  }
});
