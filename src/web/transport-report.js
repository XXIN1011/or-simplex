/* 只渲染运输算法快照；数值、守恒与最优性结论来自 core。 */
'use strict';
var esc = require('./dom.js').esc;
var view = require('./transport-table.js');
var num = view.num, rowName = view.rowName, colName = view.colName, cellName = view.cellName, table = view.table;
var study = require('./study-view.js');
var layout = require('./result-layout.js');
var player = require('./transport-player.js');
function balanceNote(m) {
  var h = '总供应 ' + num(m.originalSupplyTotal) + '，总需求 ' + num(m.originalDemandTotal) + '。';
  if (m.balanceAdjustment) h += '已按求和误差校正需求 ' + num(m.balanceAdjustment) + '（原输入保留）。';
  if (!m.virtual) return h + '供需平衡。';
  h += m.virtual.type === 'surplus' ? '补虚拟销地，需求 ' : '补虚拟产地，供应 ';
  h += num(m.virtual.amount) + '；虚拟运量表示' + (m.virtual.type === 'surplus' ? '各产地剩余供应' : '各销地缺货') + '，不代表实际运输。';
  return h + '默认零费用，不计损失也不产生收益；可在输入区逐产地 / 逐销地设置处理费或罚金'
    + (m.direction === 'max' ? '，最大收益时扣除' : '') + '。';
}
function vector(a) { return a.map(num).join('，'); }
function stepContent(m, s, index) {
  var title, h = '', values = s.allocation, loop = null, options = null;
  if (s.type === 'allocation') {
    title = '最小元素分配 ' + cellName(s.cell);
    options = { selected: s.cell, ties: s.ties, supply: s.remainingSupply, demand: s.remainingDemand, cornerLabel: '—' };
    h += '<p>可运格中工作费用最小：' + cellName(s.cell) + '，费用 ' + num(s.cost)
      + (s.ties.length > 1 ? '；并列候选 ' + s.ties.map(cellName).join('、') + '，取下标最小者' : '') + '。</p>'
      + '<p>分配上限 ' + num(s.proposedQuantity) + '。'
      + (s.guarded ? '可行性检查发现按上限分配会堵住后续路线，剩余网络将有 ' + num(s.feasibilityDeficit)
        + ' 单位无法匹配；瓶颈产地：' + s.blockedCutRows.map(function (i) { return rowName(m, i); }).join('、')
        + '。' : '')
      + '实际分配 <b>' + num(s.quantity) + '</b>' + (s.quantity === 0 ? '（跳过，不设为基变量）' : '')
      + '。剩余供应 [' + vector(s.remainingSupply) + ']；剩余需求 [' + vector(s.remainingDemand) + ']。</p>';
  } else if (s.type === 'initial') {
    title = '初始可行方案（尚未检验最优）';
    h += '<p>按行列下标补入不形成回路的零值基变量：'
      + (s.zeroBasics.length ? s.zeroBasics.map(cellName).join('、') : '无需补入')
      + '。可运图 ' + m.components + ' 个连通分量，基格构成 m+n−k = ' + m.basisSize + ' 条边的森林；零值基运量为 0。</p>';
  } else if (s.type === 'potentials') {
    title = s.entering ? '位势法：选择入基格' : '位势法：最优性检验';
    h += '<p>每个连通分量取一个零位势结点，按基格解 uᵢ + vⱼ = c′ᵢⱼ；行位势写在表最右列，列位势写在表底行。</p>'
      + '<p>检验数 Δᵢⱼ = c′ᵢⱼ − uᵢ − vⱼ，负值可改进；舍入容差上界 ' + num(m.costTolerance) + '。</p>'
      + table(m, s.reduced, null, null, '位势与检验数 Δ（基格 Δ = 0）', true,
        { rowMargins: s.u, colMargins: s.v, rowLabel: '行位势 u', colLabel: '列位势 v', cornerLabel: '—',
          rowMarginAttr: 'data-tp-u', colMarginAttr: 'data-tp-v', rowMarginClass: 'tp-u', colMarginClass: 'tp-v' })
      + '<p>' + (s.entering ? '取下标最小的负检验数格 ' + cellName(s.entering) + ' 入基。' : '可运非基检验数均 ≥ −容差，当前方案最优；禁运格不参与检验。') + '</p>';
  } else {
    title = '闭回路调整 · 第 ' + s.iteration + ' 轮';
    values = s.beforeAllocation; loop = s.cycle;
    h += '<p>θ = 负号格最小运量 = <b>' + num(s.theta) + '</b>；正负格同步加减，同量时下标最小的 '
      + cellName(s.leaving) + ' 离基。' + (s.theta === 0 ? '退化换基：运量不变，只换基。' : '') + '</p>'
      + '<p>原目标 ' + num(s.objectiveBefore) + ' → ' + num(s.objectiveAfter)
      + '（θΔ = ' + num(s.workingDelta) + '，变化 ' + num(s.delta) + '）。</p>';
  }
  h += s.type === 'pivot' ? player.render(m, s, index)
    : table(m, values, s.basis, loop, title, false, options);
  if (!s.invariant.valid) h += '<p class="sens-note">校验失败：' + esc(s.invariant.errors.join('、')) + '</p>';
  else if (s.type === 'initial' || s.type === 'potentials') h += '<p class="sens-note">原目标值 ' + num(s.objective) + '</p>';
  return { title: title, html: '<article class="card"><h3>' + (index + 1) + '. ' + esc(title) + '</h3>' + h + '</article>' };
}
function render(res) {
  var m = res.model, optimal = res.status === 'optimal';
  if (res.status === 'infeasible') {
    var f = res.feasibility;
    return '<div class="card"><div class="verdict no"><div class="vtitle">禁运限制下无可行方案</div></div>'
      + '<p>' + esc(res.message) + '</p><p>最大可匹配 ' + num(m.total - f.deficit)
      + '，仍有 ' + num(f.deficit) + ' 单位无法匹配；不会用虚拟线路绕过禁运。</p>'
      + '<p>瓶颈产地集合：' + f.cutRows.map(function (i) { return rowName(m, i); }).join('、')
      + '；可达销地：' + (f.cutCols.length ? f.cutCols.map(function (j) { return colName(m, j); }).join('、') : '无')
      + '。这些产地供应 ' + num(f.cutSupply) + '，可达需求仅 ' + num(f.cutDemand) + '。请检查禁运标记或调整供需。</p>'
      + '<p>' + balanceNote(m) + '</p>' + table(m, m.cost, null, null, '平衡后运输表与禁运瓶颈', true,
        { cutRows: f.cutRows, cutCols: f.cutCols }) + '</div>';
  }
  var h = '<div class="card"><div class="verdict ' + (optimal ? 'opt' : 'no') + '"><div class="vtitle">'
    + (optimal ? m.direction === 'max' ? '最优净收益' : '最小总费用' : res.feasible ? '当前可行方案（未确认最优）' : '数值校验未通过（未确认最优）') + '</div>'
    + '<div class="sol">z = <span class="zv">' + num(res.objective) + '</span></div></div>';
  if (!optimal) h += '<p>' + esc(res.message) + '</p>';
  h += '<p>真实线路' + (m.direction === 'max' ? '总收益' : '总费用') + ' ' + num(res.realObjective) + '；剩余处理费 / 缺货罚金 ' + num(res.penalty) + '。</p>';
  if (m.direction === 'max') h += '<p>c′ = −原收益，工作目标 ' + num(res.workingObjective) + '，还原 z = −工作目标 = ' + num(res.objective) + '。</p>';
  if (res.surplus) h += '<p class="tp-balance">剩余供应：' + res.surplus.map(function (v, i) { return '产地' + (i + 1) + '：' + num(v); }).join('；') + '。</p>';
  if (res.shortage) h += '<p class="tp-balance">缺货量：' + res.shortage.map(function (v, j) { return '销地' + (j + 1) + '：' + num(v); }).join('；') + '。</p>';
  h += table(m, res.allocation, res.basis, null, optimal ? '最终最优运输方案' : '当前运输方案', false)
    + '<p class="sens-note">左上角原费用，中间运量；方框为基变量（含零值基）。</p>';
  if (optimal && res.multipleOptimal) h += '<p>存在多重最优（θ = ' + num(res.alternative.theta) + '），下方可查看另一方案。</p>';
  if (res.alternative) h += '<details><summary>查看另一个最优方案</summary>' + table(m, res.alternative.allocation, null, res.alternative.cycle, '另一最优运输方案（原目标 ' + num(res.alternative.objective) + '）', false) + '</details>';
  h += '</div>' + layout.navigation([['transport-derivation', '查看完整推导 / 单步学习']]);
  h += '<details class="result-work" open><summary>计算过程：初始可行方案 → 位势法最优方案</summary><section data-section="transport-derivation">'
    + '<div class="card"><h2 class="sec">模型平衡与转换</h2><p>' + balanceNote(m) + '</p>'
    + table(m, m.cost, null, null, '平衡后原费用 / 收益矩阵（含虚拟行列）', true)
    + (m.direction === 'max' ? table(m, m.working, null, null, '进入最小化算法的工作费用 c′ = −原收益', true) : '')
    + '<p>禁运格不参与分配、补基、检验和回路。有禁运时先做辅助最大流可行性检查，再按最小元素分配、位势法优化。</p></div>'
    + study.group(res.steps.map(function (s, i) { return stepContent(m, s, i); }), '运输问题逐步推导') + '</section></details>';
  return h;
}
module.exports = { render: render, table: table, balanceNote: balanceNote, num: num };
