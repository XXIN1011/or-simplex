'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ipSolve } = require('../../src/core/integer.js');

test('松弛无界不能直接判整数无界：x1=0.5 的整数问题实际上不可行', () => {
  const r = ipSolve({direction:'max', c:[0,1], constraints:[{coef:[1,0], rel:'=', rhs:0.5}], vtypes:['int','int']});
  assert.equal(r.relax.status, 'unbounded');
  assert.equal(r.status, 'undetermined');
  assert.equal(r.noOptimum, true);
  assert.match(r.message, /结论未确定/);
  assert.ok(r.methods.every(m => !m.applicable && m.reason === r.message));
});

test('松弛不可行才可以确定整数不可行', () => {
  const r = ipSolve({direction:'max', c:[1], constraints:[{coef:[1],rel:'<=',rhs:-1}],vtypes:['int']});
  assert.equal(r.relax.status, 'infeasible');
  assert.equal(r.status, 'infeasible');
  assert.match(r.message, /原整数规划也无可行解/);
});

test('整数规划入口拒绝非法输入而不是误报松弛无界', () => {
  for (const p of [null, {}, {direction:'max',c:[1],constraints:[{coef:['oops'],rel:'<=',rhs:1}]}]) {
    assert.equal(ipSolve(p).ok, false);
  }
});

test('整数各方法使用与松弛表相同的规范化数值，且不修改调用方输入', () => {
  const p = {direction:'max',c:['−1'],constraints:[{coef:['1'],rel:'<=',rhs:'2e0'}],vtypes:['bin']};
  const before = JSON.stringify(p);
  const actual = ipSolve(p);
  const expected = ipSolve({direction:'max',c:[-1],constraints:[{coef:[1],rel:'<=',rhs:2}],vtypes:['bin']});
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(p), before);
});

test('循环退化题触及松弛迭代上限，应当未确定而非无界', () => {
  const r = ipSolve({direction:'max', c:[10,-57,-9,-24], constraints:[
    {coef:[0.5,-5.5,-2.5,9],rel:'<=',rhs:0},
    {coef:[0.5,-1.5,-0.5,1],rel:'<=',rhs:0},
    {coef:[1,0,0,0],rel:'<=',rhs:1}
  ],vtypes:['int','int','int','int']});
  assert.equal(r.relax.status, 'iteration-limit');
  assert.equal(r.status, 'undetermined');
  assert.match(r.message, /迭代上限/);
  assert.doesNotMatch(r.message, /无界/);
});

test('CLI 不把松弛无界说成整数无解', () => {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const p = {direction:'max',c:[0,1],constraints:[{coef:[1,0],rel:'=',rhs:0.5}],vtypes:['int','int']};
  const r = spawnSync(process.execPath,[path.join(__dirname,'../../src/cli.js'),JSON.stringify(p),'--integer'],{encoding:'utf8'});
  assert.equal(r.status, 1);
  assert.match(r.stdout, /整数问题结论未确定/);
  assert.doesNotMatch(r.stdout, /整数规划同样无解/);
});
