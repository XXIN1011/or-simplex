/* =========================================================================
   单元测试 · 结果格式化模块（core/format.js）
   -------------------------------------------------------------------------
   格式化不是「好看就行」，它是正确性的一部分：
     · 带 M 的检验数必须把 M 项写在前面（7M - 4），否则会被读成负数；
     · 容差内的毛刺必须显示成 0，而不是 3.0000000000000004e-16；
     · 区间只有四种语义，界面和 CLI 不能各判一套。
   ========================================================================= */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const F = require('../../src/core/format.js');

test('asFraction：分母小于 200 的有理数显示成分数，试不出来返回 null', () => {
  assert.strictEqual(F.asFraction(0.5), '1/2');
  assert.strictEqual(F.asFraction(1.8), '9/5');
  assert.strictEqual(F.asFraction(3), '3');
  assert.strictEqual(F.asFraction(-2.5), '-5/2');
  assert.strictEqual(F.asFraction(Math.PI), null);       // π 无法写成分数
  assert.strictEqual(F.asFraction(1e-12), '0');          // 容差内是 0
});

test('fmtNum：整数 / 分数 / 小数 / 非法值', () => {
  assert.strictEqual(F.fmtNum(0), '0');
  assert.strictEqual(F.fmtNum(-0.9999999999999998 + 1), '0');   // 浮点毛刺显示成 0
  assert.strictEqual(F.fmtNum(2 / 5), '2/5');
  assert.strictEqual(F.fmtNum(14), '14');
  assert.strictEqual(F.fmtNum(-3.25), '-13/4');
  assert.strictEqual(F.fmtNum(Math.PI), '3.14159');      // 6 位有效数字
  assert.strictEqual(F.fmtNum(null), '—');
  assert.strictEqual(F.fmtNum(NaN), '—');
});

test('fmtPair：M 项永远写在常数项前面', () => {
  assert.strictEqual(F.fmtPair({ a: -4, b: 7 }), '7M - 4');
  assert.strictEqual(F.fmtPair({ a: 3, b: 2 }), '2M + 3');
  assert.strictEqual(F.fmtPair({ a: -3, b: -1 }), '-M - 3');
  assert.strictEqual(F.fmtPair({ a: 0, b: 1 }), 'M');
  assert.strictEqual(F.fmtPair({ a: 0, b: 0 }), '0');
  assert.strictEqual(F.fmtPair({ a: 5, b: 0 }), '5');    // 不带 M 就退化成普通数字
});

test('rangeParts：四种区间语义', () => {
  assert.strictEqual(F.rangeParts(-Infinity, Infinity).kind, 'free');
  assert.strictEqual(F.rangeParts(2, Infinity).kind, 'ge');
  assert.strictEqual(F.rangeParts(-Infinity, 4).kind, 'le');
  assert.strictEqual(F.rangeParts(3, 3).kind, 'eq');
  assert.strictEqual(F.rangeParts(1.5, 5).kind, 'between');
});

test('rangeText：写成教材里的不等式', () => {
  assert.strictEqual(F.rangeText(-Infinity, Infinity, 'c1'), '可任意取值');
  assert.strictEqual(F.rangeText(1.5, 5, 'c1'), '3/2 ≤ c1 ≤ 5');
  assert.strictEqual(F.rangeText(1.5, Infinity, 'c1'), 'c1 ≥ 3/2');
  assert.strictEqual(F.rangeText(-Infinity, 4, 'b2'), 'b2 ≤ 4');
  assert.strictEqual(F.rangeText(2, 2, 'b1'), 'b1 = 2');
});

test('fmtAff：参数 λ 的表达式（含 U+2212 减号与系数 1 省略）', () => {
  assert.strictEqual(F.fmtAff({ a: 13, b: 2 }), '13 + 2λ');
  assert.strictEqual(F.fmtAff({ a: 14, b: 0 }), '14');
  assert.strictEqual(F.fmtAff({ a: 0, b: 1 }), 'λ');
  assert.strictEqual(F.fmtAff({ a: 0, b: -0.5 }), '−1/2λ');
  assert.strictEqual(F.fmtAff({ a: 2, b: -0.5 }), '2 − 1/2λ');
});
