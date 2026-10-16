'use strict';

/* 完整解析十进制/科学计数法；只规范化数学负号，不删除未知字符。
   UI 的空格按 0，库入口的空值则应当报错。非法值用 NaN 交给校验层拦截。 */
function parseNumber(value, blankAsZero) {
  if (typeof value === 'number') return isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  var s = value.trim().replace(/\u2212/g, '-');
  if (!s) return blankAsZero ? 0 : NaN;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return NaN;
  var n = Number(s);
  return isFinite(n) ? n : NaN;
}

module.exports = { parseNumber: parseNumber };
