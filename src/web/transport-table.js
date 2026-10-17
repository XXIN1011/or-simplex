/* 运输表的统一呈现；所有量值来自求解快照，选中/瓶颈/回路仅作视觉标记。 */
'use strict';
var esc = require('./dom.js').esc;
var fmtNum = require('../core/format.js').fmtNum;
function num(v) { return v !== 0 && Math.abs(v) < 1e-7 ? esc(String(v)) : fmtNum(v); }
function rowName(m, i) { return i < m.m ? '产地' + (i + 1) : '虚拟产地（缺货）'; }
function colName(m, j) { return j < m.n ? '销地' + (j + 1) : '虚拟销地（剩余）'; }
function cellName(c) { return '(' + (c.i + 1) + ', ' + (c.j + 1) + ')'; }
function same(a, i, j) { return a && a.i === i && a.j === j; }
function table(m, values, basis, loop, caption, costs, options) {
  var o = options || {}, supply = o.supply || m.supply, demand = o.demand || m.demand;
  var h = '<div class="scroll"><div class="tp-stage"><table class="tb transport-table"><caption>' + esc(caption) + '</caption><thead><tr><th scope="col">产地 / 销地</th>', i, j;
  for (j = 0; j < m.cols; j++) h += '<th scope="col" class="' + (j >= m.n ? 'tp-virtual ' : '')
    + ((o.cutCols || []).indexOf(j) >= 0 ? 'tp-cut-label' : '') + '">' + colName(m, j)
    + ((o.cutCols || []).indexOf(j) >= 0 ? '<small class="tp-cost">可达销地</small>' : '') + '</th>';
  h += '<th scope="col">' + (o.supply ? '剩余供应' : '供应量') + '</th></tr></thead><tbody>';
  for (i = 0; i < m.rows; i++) {
    var cut = (o.cutRows || []).indexOf(i) >= 0;
    h += '<tr' + (i >= m.m ? ' class="tp-virtual"' : '') + '><th scope="row" class="' + (cut ? 'tp-cut-label' : '') + '">' + rowName(m, i)
      + (cut ? '<small class="tp-cost">瓶颈产地</small>' : '') + '</th>';
    for (j = 0; j < m.cols; j++) {
      var selected = same(o.selected, i, j), active = same(o.active, i, j), tie = false, mark = '', at = -1;
      (o.ties || []).forEach(function (c) { if (same(c, i, j)) tie = true; });
      (loop || []).forEach(function (c, k) { if (same(c, i, j)) { mark = c.sign > 0 ? '+' : '−'; at = k; } });
      h += '<td data-tp-cell="' + i + '-' + j + '" class="' + (!m.allowed[i][j] ? 'tp-blocked ' : '')
        + (j >= m.n || i >= m.m ? 'tp-virtual ' : '') + (mark ? 'tp-cycle ' : '')
        + (selected ? 'tp-selected ' : '') + (active ? 'tp-active ' : '') + (tie && !selected ? 'tp-tie' : '') + '">';
      if (!m.allowed[i][j]) { h += '禁运<small class="tp-cost">x = 0，不参与计算</small></td>'; continue; }
      h += (mark ? '<b class="tp-sign">' + mark + ' <small>回路' + (at + 1) + '</small></b>' : '')
        + '<span class="mono tp-value">' + (costs ? '' : 'x = ') + num(values[i][j]) + '</span>'
        + (selected ? '<small class="tp-cost">' + esc(o.selectedLabel || '本次选择') + '</small>' : tie ? '<small class="tp-cost">并列候选</small>' : '')
        + (active ? '<small class="tp-cost">当前格</small>' : '')
        + (same(o.leaving, i, j) ? '<small class="tp-cost">离基格</small>' : '')
        + (basis && basis[i][j] ? '<span class="tp-basis">' + (values[i][j] === 0 ? '零值基' : '基') + '</span>' : '')
        + (!costs ? '<small class="tp-cost">原' + (m.direction === 'max' ? '收益' : '费用') + ' ' + num(m.cost[i][j]) + '</small>' : '') + '</td>';
    }
    h += '<td data-tp-supply="' + i + '" class="mono ' + (o.selected && o.selected.i === i ? 'tp-margin-active' : '') + '">' + num(supply[i]) + '</td></tr>';
  }
  h += '</tbody><tfoot><tr><th scope="row">' + (o.demand ? '剩余需求' : '需求量') + '</th>';
  for (j = 0; j < m.cols; j++) h += '<td data-tp-demand="' + j + '" class="mono ' + (o.selected && o.selected.j === j ? 'tp-margin-active' : '') + '">' + num(demand[j]) + '</td>';
  return h + '<td>' + (o.supply ? '逐步更新' : num(m.total)) + '</td></tr></tfoot></table></div></div>';
}
module.exports = { table: table, num: num, rowName: rowName, colName: colName, cellName: cellName };
