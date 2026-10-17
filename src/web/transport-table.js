/* 运输表的统一呈现；所有量值来自求解快照，选中/瓶颈/回路仅作视觉标记。
   版式按教材口径：费用贴格左上角的角标，运量居中，基变量在外套一圈方框，
   闭回路的正负号写在运量前，连线从费用角标下方的节点穿过。 */
'use strict';
var esc = require('./dom.js').esc;
var fmtNum = require('../core/format.js').fmtNum;
function num(v) { return v !== 0 && Math.abs(v) < 1e-7 ? esc(String(v)) : fmtNum(v); }
function rowName(m, i) { return i < m.m ? '产地' + (i + 1) : '虚拟产地'; }
function colName(m, j) { return j < m.n ? '销地' + (j + 1) : '虚拟销地'; }
function cellName(c) { return '(' + (c.i + 1) + ', ' + (c.j + 1) + ')'; }
function same(a, i, j) { return a && a.i === i && a.j === j; }
function table(m, values, basis, loop, caption, costs, options) {
  var o = options || {}, supply = o.supply || m.supply, demand = o.demand || m.demand;
  var at = {}, changed = {};
  (loop || []).forEach(function (c, k) { at[c.i + '-' + c.j] = { sign: c.sign > 0 ? '+' : '−' }; });
  (o.updated || []).forEach(function (c) { changed[c.i + '-' + c.j] = 1; });
  var h = '<p class="tp-caption">' + esc(caption) + '</p>'
    + '<div class="scroll"><div class="tp-stage"><table class="tb transport-table' + (costs ? ' tp-plain' : '')
    + '" aria-label="' + esc(caption) + '"><thead><tr>'
    + '<th scope="col" class="tp-corner"><span class="tp-corner-x">销地</span><span class="tp-corner-y">产地</span></th>', i, j;
  for (j = 0; j < m.cols; j++) h += '<th scope="col" class="' + (j >= m.n ? 'tp-virtual ' : '')
    + ((o.cutCols || []).indexOf(j) >= 0 ? 'tp-cut-label' : '') + '">' + colName(m, j)
    + (j >= m.n ? '<small class="tp-sub">剩余</small>' : '')
    + ((o.cutCols || []).indexOf(j) >= 0 ? '<small class="tp-sub">可达销地</small>' : '') + '</th>';
  h += '<th scope="col">' + (o.supply ? '剩余供应' : '供应量') + '</th></tr></thead><tbody>';
  for (i = 0; i < m.rows; i++) {
    var cut = (o.cutRows || []).indexOf(i) >= 0;
    h += '<tr' + (i >= m.m ? ' class="tp-virtual"' : '') + '><th scope="row" class="' + (cut ? 'tp-cut-label' : '') + '">' + rowName(m, i)
      + (i >= m.m ? '<small class="tp-sub">缺货</small>' : '')
      + (cut ? '<small class="tp-sub">瓶颈产地</small>' : '') + '</th>';
    for (j = 0; j < m.cols; j++) {
      var key = i + '-' + j, hit = at[key], selected = same(o.selected, i, j), active = same(o.active, i, j), tie = false;
      (o.ties || []).forEach(function (c) { if (same(c, i, j)) tie = true; });
      var cls = 'tp-cell';
      if (!m.allowed[i][j]) cls += ' tp-blocked';
      if (j >= m.n || i >= m.m) cls += ' tp-virtual';
      if (hit) cls += ' tp-cycle ' + (hit.sign === '+' ? 'tp-plus-cell' : 'tp-minus-cell');
      if (basis && basis[i][j]) cls += ' tp-has-base';
      /* 演示时非回路格退到背景里，回路本身才清楚。 */
      if (o.dim && !hit) cls += ' tp-dim';
      /* θ 比较帧只淡淡标出负号格：它们才是决定步长的候选。 */
      if (o.theta && hit && hit.sign === '−') cls += ' tp-theta';
      if (selected) cls += ' tp-selected';
      if (active) cls += ' tp-active';
      if (changed[key]) cls += ' tp-updated';
      if (tie && !selected) cls += ' tp-tie';
      h += '<td data-tp-cell="' + key + '" class="' + cls + '">';
      if (!m.allowed[i][j]) { h += '禁运</td>'; continue; }
      /* 左上角费用角标：只有运量表才写，纯费用/检验数表里中间那个数就是主体。 */
      if (!costs) h += '<b class="tp-cost">' + num(m.cost[i][j]) + '</b>';
      if (hit) h += '<i class="tp-anchor"></i>';
      if (hit) h += '<span class="tp-sgn">' + hit.sign + '</span>';
      h += '<span class="mono tp-value">' + num(values[i][j]) + '</span>';
      if (basis && basis[i][j]) h += '<span class="tp-basis tp-sr">基</span>';
      var tags = [];
      if (selected) tags.push(esc(o.selectedLabel || '本次选择'));
      else if (tie) tags.push('并列候选');
      if (same(o.leaving, i, j)) tags.push('离基格');
      if (basis && basis[i][j] && values[i][j] === 0) tags.push('零值基');
      if (active && !selected && !same(o.leaving, i, j)) tags.push('当前格');
      if (tags.length) h += '<small class="tp-tag">' + tags.join(' · ') + '</small>';
      h += '</td>';
    }
    h += '<td data-tp-supply="' + i + '" class="mono ' + (o.selected && o.selected.i === i ? 'tp-margin-active' : '') + '">' + num(supply[i]) + '</td></tr>';
  }
  h += '</tbody><tfoot><tr><th scope="row">' + (o.demand ? '剩余需求' : '需求量') + '</th>';
  for (j = 0; j < m.cols; j++) h += '<td data-tp-demand="' + j + '" class="mono ' + (o.selected && o.selected.j === j ? 'tp-margin-active' : '') + '">' + num(demand[j]) + '</td>';
  return h + '<td>' + (o.supply ? '逐步更新' : num(m.total)) + '</td></tr></tfoot></table></div></div>';
}
module.exports = { table: table, num: num, rowName: rowName, colName: colName, cellName: cellName };
