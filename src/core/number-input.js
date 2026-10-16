'use strict';

/* 完整解析十进制、科学计数法及单个分数；只规范化数学符号，不执行算术表达式。
   UI 的空格按 0，库入口的空值则应当报错。非法值用 NaN 交给校验层拦截。 */
var DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function decimal(s) {
  if (!DECIMAL.test(s)) return NaN;
  var n = Number(s);
  return isFinite(n) ? n : NaN;
}
function parseNumber(value, blankAsZero) {
  if (typeof value === 'number') return isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  var s = value.trim().replace(/\u2212/g, '-').replace(/[\u2044\u2215]/g, '/');
  if (!s) return blankAsZero ? 0 : NaN;
  var parts = s.split('/');
  if (parts.length === 1) return decimal(s);
  if (parts.length !== 2) return NaN;
  var numerator = decimal(parts[0].trim());
  var denominator = decimal(parts[1].trim());
  if (!isFinite(numerator) || !isFinite(denominator) || denominator === 0) return NaN;
  var ratio = numerator / denominator;
  return isFinite(ratio) ? ratio : NaN;
}

module.exports = { parseNumber: parseNumber };
