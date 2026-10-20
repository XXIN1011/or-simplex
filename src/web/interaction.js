/* 只管理反馈与焦点，不解析错误文案或推断数学状态。 */
'use strict';
var esc = require('./dom.js').esc;
var STALE = '输入已修改，请重新求解。';
function message(root, text, kind) {
  var html = text ? '<div class="banner' + (kind ? ' ' + kind : '') + '">' + esc(text) + '</div>' : '';
  if (root.innerHTML !== html) root.innerHTML = html;
}
function invalid(root) {
  var field = root.querySelector('[aria-invalid="true"]');
  if (field) field.focus();
}
/* 重绘删除了焦点节点，或规模上限禁用了当前按钮时，退回同一组的可用入口。 */
function recoverFocus(previous, fallback) {
  if (previous && (!document.documentElement.contains(previous) || previous.disabled) && fallback) fallback.focus();
}
module.exports = { STALE: STALE, message: message, invalid: invalid, recoverFocus: recoverFocus };
