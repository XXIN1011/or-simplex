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
  for (const raw of ['1/2', '1,5', 'abc', '-', '.', '1e', '2x', '1.2.3', '0x10', 'Infinity', '1e999', null, undefined, true, {}, [], Infinity, NaN]) {
    assert.ok(Number.isNaN(parseNumber(raw, true)), String(raw));
  }
});
