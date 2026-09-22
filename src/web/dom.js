/* =========================================================================
   共用小工具：取元素 / HTML 文本转义 / 下标数字
   -------------------------------------------------------------------------
   以前这三点在界面模块里各抄了一份：esc() 出现在 ui / sens-ui / ip-ui /
   assign-ui / input-panel 五个文件（逐字节相同），$(id) 出现四次，subs() 三
   次。改一处（例如以后要连单引号一起转义）得改五个地方，漏一个就是不一致。

   ★ 语言纪律：本文件会被原样打包进单文件页面，必须保持 ES5（var / 不用箭头
     函数 / 不用模板串），否则老 WebView 上会直接语法错误。
   ★ 这里只放「把数据摆到 DOM 上」的零散工具，不放业务逻辑，也不碰 core。
   ========================================================================= */
'use strict';

/**
 * $(id) —— 取元素。界面里到处都在用，短名字是为了让模板拼接读起来干净。
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function $(id) { return document.getElementById(id); }

/**
 * esc(s) —— 拼 HTML 字符串时给数据做转义。
 * 只要是要塞进 innerHTML 的动态文本都过这一道，避免用户输入里的 < > & "
 * 把标签撕开（本项目输入以数字为主，但提示文案里也会带变量名与用户填的表达式）。
 * @param {*} s
 * @returns {string}
 */
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/**
 * subs(k) —— 把名称里的数字换成 Unicode 下标（x2 -> x₂）。
 * 界面上直接用 'x2' 会被读成「x 乘 2」或看不出是下标，故统一转成下标字符。
 * （core/scenario.js 里有一个同语义的 sub()，但分层规定 core 不许 require web，
 *   所以那份保持独立；两边都只做同一张表的一次映射。）
 * @param {string|number} k
 * @returns {string}
 */
function subs(k) {
  return String(k).replace(/[0-9]/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[+d]; });
}

module.exports = { $: $, esc: esc, subs: subs };
