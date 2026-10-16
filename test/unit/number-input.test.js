'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseNumber } = require('../../src/core/number-input.js');

test('数字完整解析：小数、科学计数法、数学负号与空白规则', () => {
  for (const [raw, expected] of [['1e3', 1000], ['-2.5e-2', -0.025], ['−2', -2], ['+.5', 0.5], [' 2. ', 2]]) {
    assert.equal(parseNumber(raw), expected);
  }
  assert.equal(parseNumber(' ', true), 0);
  assert.ok(Number.isNaN(parseNumber(' ')));
  assert.equal(parseNumber(0), 0);
});

test('数字完整解析：非法或未完成输入不能截断、删字符或变成零', () => {
  for (const raw of ['1,5', 'abc', '-', '.', '1e', '2x', '1.2.3', '0x10', 'Infinity', '1e999', null, undefined, true, {}, [], Infinity, NaN]) {
    assert.ok(Number.isNaN(parseNumber(raw, true)), String(raw));
  }
});

test('分数输入：支持正负分数、空格、小数及科学计数形式，保留已有数字规则', () => {
  for (const [raw, expected] of [['1/2', 0.5], ['−3/4', -0.75], ['1/-2', -0.5], ['-1/-2', 0.5],
    [' +3 / 6 ', 0.5], ['.5/2', 0.25], ['1e2/2e1', 5], ['1⁄4', 0.25], ['1∕4', 0.25], ['0/3', 0]]) {
    assert.equal(parseNumber(raw), expected, raw);
    assert.equal(parseNumber(raw, true), expected, raw);
  }
});

test('分数输入：分母为零、不完整分数、多重除号与表达式均拒绝求解', () => {
  for (const raw of ['1/0', '0/0', '1/-0', '1/0.0', '1/1e-999', '1e308/1e-308', '1e999/2',
    '/2', '1/', '/', '1//2', '1/2/3', '1 / -', '1 / 2x', '1+2/3', '1 1/2', '(1/2)', '1/Infinity']) {
    assert.ok(Number.isNaN(parseNumber(raw, true)), raw);
  }
});
