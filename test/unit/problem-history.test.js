'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHistory } = require('../../src/web/problem-history.js');
const { createStore, validLinear, validAssignment } = require('../../src/web/draft.js');
const valid = p => validLinear(p, 6, 8);
const problem = (c = '3/2') => ({ direction: 'max', c: [c], constraints: [{ coef: ['1'], rel: '<=', rhs: '4' }] });
function fixture() {
  const data = new Map();
  const storage = { getItem: k => data.has(k) ? data.get(k) : null,
    setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  return { data, storage, access: () => storage };
}

test('历史记录按时间倒序保留20道题，重复求解更新时间并移到最前', () => {
  const f = fixture(); let time = 100;
  const history = createHistory('simplex', valid, f.access, () => time++);
  for (let i = 0; i < 25; i++) assert.equal(history.add(problem(String(i))), true);
  const items = history.load().data;
  assert.equal(items.length, 20);
  assert.equal(items[0].data.c[0], '24');
  assert.equal(items[19].data.c[0], '5');
  history.add(problem('7'));
  assert.equal(history.load().data.length, 20);
  assert.equal(history.load().data[0].data.c[0], '7');
  assert.equal(history.load().data[0].savedAt, 125);
});

test('历史快照保留原始分数、整数类型和灵敏度场景，不随继续编辑变化', () => {
  const f = fixture(), history = createHistory('sens', valid, f.access);
  const p = problem(); p.vtypes = ['bin'];
  p.scenario = { kind: 'param', paramKind: 'b', values: ['−1/2'] };
  assert.equal(history.add(p), true);
  p.c[0] = '9'; p.constraints[0].rhs = '999'; p.scenario.values[0] = '5';
  const stored = history.load().data[0].data;
  assert.equal(stored.c[0], '3/2');
  assert.equal(stored.constraints[0].rhs, '4');
  assert.deepEqual(stored.vtypes, ['bin']);
  assert.deepEqual(stored.scenario.values, ['−1/2']);
});

test('历史、当前题目、不同模块与主题分别存储，删除和清空互不影响', () => {
  const f = fixture(), history = createHistory('simplex', valid, f.access);
  const other = createHistory('assign', validAssignment, f.access);
  const draft = createStore('simplex', valid, f.access);
  draft.save(problem()); f.data.set('or-theme', 'dark');
  other.add({ direction: 'min', rows: 1, cols: 2, cells: [['×', '1/2']] });
  history.add(problem()); history.add(problem('5'));
  assert.equal(history.remove(problem()), true);
  assert.equal(history.load().data.length, 1);
  assert.equal(history.load().data[0].data.c[0], '5');
  assert.equal(history.remove(problem('5')), true);
  assert.equal(history.load().status, 'empty');
  history.add(problem()); history.clear();
  assert.equal(other.load().data[0].data.cells[0][0], '×');
  assert.equal(draft.load().data.c[0], '3/2');
  assert.equal(f.data.get('or-theme'), 'dark');
});

test('损坏、旧版本、超限与非法历史安全忽略，下一次有效求解可重新记录', () => {
  const f = fixture(), history = createHistory('simplex', valid, f.access);
  const record = data => JSON.stringify({ version: 1, data });
  for (const raw of ['{broken', 'null', JSON.stringify({ version: 2, data: [] }),
    record({}), record(Array(21).fill({ savedAt: 1, data: problem() })),
    record([{ savedAt: -1, data: problem() }]), record([{ savedAt: 'today', data: problem() }]),
    record([{ savedAt: 8640000000000001, data: problem() }]),
    record([{ savedAt: 1, data: { c: [] } }]), 'x'.repeat(1048577)]) {
    f.data.set('or-simplex-history:simplex', raw);
    assert.equal(history.load().status, 'invalid');
    assert.equal(history.add(problem()), true);
    assert.equal(history.load().data.length, 1);
  }
  assert.equal(history.add({ c: [] }), false);
  assert.equal(history.load().data.length, 1);
});

test('访问被拒、配额不足或记录过大时不会抛异常，也不会覆盖已有历史', () => {
  const denied = createHistory('simplex', valid, () => { throw new Error('denied'); });
  assert.equal(denied.load().status, 'unavailable');
  assert.equal(denied.add(problem()), false);
  assert.equal(denied.remove(problem()), false);
  assert.equal(denied.clear(), false);
  const f = fixture(), history = createHistory('simplex', valid, f.access);
  history.add(problem());
  const before = f.data.get('or-simplex-history:simplex');
  assert.equal(history.add(problem('x'.repeat(1048577))), false);
  assert.equal(f.data.get('or-simplex-history:simplex'), before);
  f.storage.setItem = () => { throw new Error('quota'); };
  assert.equal(history.add(problem('7')), false);
  assert.equal(f.data.get('or-simplex-history:simplex'), before);
});

test('多实例修改时重新读取历史，逐条删除不会误删其他实例新加的题目', () => {
  const f = fixture(), a = createHistory('simplex', valid, f.access), b = createHistory('simplex', valid, f.access);
  a.add(problem('1')); b.add(problem('2')); a.add(problem('3'));
  assert.deepEqual(a.load().data.map(i => i.data.c[0]), ['3', '2', '1']);
  b.remove(problem('2'));
  assert.deepEqual(a.load().data.map(i => i.data.c[0]), ['3', '1']);
});
