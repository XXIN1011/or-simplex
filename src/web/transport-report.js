/* 只渲染运输算法快照；数值、守恒与最优性结论来自 core。 */
'use strict';
var esc = require('./dom.js').esc;
var view = require('./transport-table.js');
var num = view.num, rowName = view.rowName, colName = view.colName, cellName = view.cellName, table = view.table;
var study = require('./study-view.js');
var layout = require('./result-layout.js');
var player = require('./transport-player.js');
function balanceNote(m) {
  var h = '供应 ' + num(m.originalSupplyTotal) + ' · 需求 ' + num(m.originalDemandTotal) + '。';
  if (m.balanceAdjustment) h += '舍入校正 ' + num(m.balanceAdjustment) + '，原输入保留。';
  if (!m.virtual) return h + '供需平衡。';
  h += m.virtual.type === 'surplus' ? '补虚拟销地 ' : '补虚拟产地 ';
  h += num(m.virtual.amount) + '，表示' + (m.virtual.type === 'surplus' ? '剩余供应' : '缺货') + '，不作实运。';
  return h + '默认零费用；可另设处理费或罚金。';
}
function stepContent(m, s, index) {
  var title, h = '', values = s.allocation, loop = null, options = {};
  var maximizing = m.direction === 'max';
  var objectiveLabel = maximizing ? '最小化工作目标' : '原目标';
  if (s.type === 'allocation') {
    title = '最小元素分配 ' + cellName(s.cell);
    options = { selected: s.cell, ties: s.ties, supply: s.remainingSupply, demand: s.remainingDemand, cornerLabel: '—' };
    h += '<p class="tp-step-lead">最小费用 <b>' + num(s.cost) + '</b> · 实际分配 <b>' + num(s.quantity) + '</b> / 上限 ' + num(s.proposedQuantity)
      + (s.quantity === 0 ? '（跳过）' : '') + '</p>'
      + (s.ties.length > 1 ? '<p class="sens-note">并列 ' + s.ties.map(cellName).join('、') + '；按下标选取。</p>' : '')
      + (s.guarded ? '<p class="tp-step-guard">防堵路：按上限分配后将有 ' + num(s.feasibilityDeficit)
        + ' 单位无法匹配，已缩减分配。瓶颈：' + s.blockedCutRows.map(function (i) { return rowName(m, i); }).join('、') + '。</p>' : '');
  } else if (s.type === 'initial') {
    title = '初始可行方案（尚未检验最优）';
    h += '<p>零值基：'
      + (s.zeroBasics.length ? s.zeroBasics.map(cellName).join('、') : '无需补入')
      + '（运量 0）。</p><details class="tp-extra"><summary>基与连通分量</summary><p>' + m.components + ' 个连通分量，m+n−k = ' + m.basisSize + ' 个基格；补基按下标，不形成回路。</p></details>';
  } else if (s.type === 'potentials') {
    title = s.entering ? '位势法：选择入基格' : '位势法：最优性检验';
    h += '<p class="tp-formula">基格：uᵢ + vⱼ = c′ᵢⱼ<br>检验数：Δᵢⱼ = c′ᵢⱼ − uᵢ − vⱼ</p>'
      + table(m, s.reduced, null, null, '位势与检验数 Δ（基格 Δ = 0）', true,
        { rowMargins: s.u, colMargins: s.v, rowLabel: '行位势 u', colLabel: '列位势 v', cornerLabel: '—',
          rowMarginAttr: 'data-tp-u', colMarginAttr: 'data-tp-v', rowMarginClass: 'tp-u', colMarginClass: 'tp-v' })
      + '<p>' + (s.entering ? '选负检验数格 ' + cellName(s.entering) + ' 入基（按下标）。' : '可运格 Δ ≥ −容差，当前方案最优。') + '禁运格不参与检验。</p>';
  } else {
    title = '闭回路调整 · 第 ' + s.iteration + ' 轮';
    values = s.beforeAllocation; loop = s.cycle;
    h += '<p class="tp-step-lead">θ = <b>' + num(s.theta) + '</b> · 离基 ' + cellName(s.leaving) + ' · θΔ = ' + num(s.workingDelta)
      + (s.theta === 0 ? '；只换基，运量不变。' : '') + '</p>';
  }
  if (maximizing) options.costMatrix = m.working;
  options.hideCaption = s.type === 'allocation' || s.type === 'initial';
  h += s.type === 'pivot' ? player.render(m, s, index)
    : s.type === 'potentials' ? '' : table(m, values, s.basis, loop, title, false, options);
  if (!s.invariant.valid) h += '<p class="sens-note">校验失败：' + esc(s.invariant.errors.join('、')) + '</p>';
  else if (s.type === 'initial' || s.type === 'potentials') h += '<p class="tp-step-total">' + objectiveLabel + '值 ' + num(maximizing ? s.workingObjective : s.objective) + '</p>';
  return { title: title, html: '<article class="card"><h3>' + (index + 1) + '. ' + esc(title) + '</h3>' + h + '</article>' };
}
function render(res) {
  var m = res.model, optimal = res.status === 'optimal';
  if (res.status === 'infeasible') {
    var f = res.feasibility;
    return '<div class="card"><div class="verdict no"><div class="vtitle">禁运限制下无可行方案</div></div>'
      + '<p>已匹配 ' + num(m.total - f.deficit) + '，仍有 ' + num(f.deficit) + ' 单位无法匹配。</p>'
      + '<p>瓶颈产地集合：' + f.cutRows.map(function (i) { return rowName(m, i); }).join('、')
      + '；可达销地：' + (f.cutCols.length ? f.cutCols.map(function (j) { return colName(m, j); }).join('、') : '无')
      + '。供应 ' + num(f.cutSupply) + ' > 可达需求 ' + num(f.cutDemand) + '。请调整禁运路线或供需。</p>'
      + '<p>' + balanceNote(m) + '</p>' + table(m, m.cost, null, null, '平衡后运输表与禁运瓶颈', true,
        { cutRows: f.cutRows, cutCols: f.cutCols }) + '</div>';
  }
  var h = '<div class="card tp-result"><div class="tp-result-overview"><div class="verdict ' + (optimal ? 'opt' : 'no') + '"><div class="vtitle">'
    + (optimal ? m.direction === 'max' ? '最优净收益' : '最小总费用' : res.feasible ? '当前可行方案（未确认最优）' : '数值校验未通过（未确认最优）') + '</div>'
    + '<div class="sol">z = <span class="zv">' + num(res.objective) + '</span></div></div>'
    + '<dl class="tp-result-facts"><div><dt>线路' + (m.direction === 'max' ? '收益' : '费用') + '</dt><dd>' + num(res.realObjective)
    + '</dd></div><div><dt>处理费 / 罚金</dt><dd>' + num(res.penalty) + '</dd></div></dl></div>';
  if (!optimal) h += '<p>' + esc(res.message) + '</p>';
  if (res.surplus) h += '<p class="tp-balance">剩余供应：' + res.surplus.map(function (v, i) { return '产地' + (i + 1) + '：' + num(v); }).join('；') + '。</p>';
  if (res.shortage) h += '<p class="tp-balance">缺货量：' + res.shortage.map(function (v, j) { return '销地' + (j + 1) + '：' + num(v); }).join('；') + '。</p>';
  h += table(m, res.allocation, res.basis, null, optimal ? '最终最优运输方案' : '当前运输方案', false)
    + '<p class="sens-note">角标：原' + (m.direction === 'max' ? '收益' : '费用') + ' · 中间：运量 · 细框：基变量（含零值基）</p>';
  if (optimal && res.multipleOptimal) h += '<p>存在多重最优（θ = ' + num(res.alternative.theta) + '）。</p>';
  if (res.alternative) h += '<details><summary>查看另一个最优方案</summary>' + table(m, res.alternative.allocation, null, res.alternative.cycle, '另一最优运输方案（原目标 ' + num(res.alternative.objective) + '）', false) + '</details>';
  h += '</div>' + layout.navigation([['transport-derivation', '查看完整推导 / 单步学习']]);
  var contents = res.steps.map(function (s, i) { return stepContent(m, s, i); });
  if (m.direction === 'max') contents.push({ title: optimal ? '最大收益还原' : '当前方案收益还原',
    html: '<article class="card"><h3>' + (contents.length + 1) + '. ' + (optimal ? '最大收益还原' : '当前方案收益还原')
      + '</h3><p>按原收益结算' + (optimal ? '最大净收益' : '当前净收益（未确认最优）') + '。</p>'
      + table(m, res.allocation, res.basis, null, '按原收益结算最终运量', false)
      + '<p>收益 ' + num(res.realObjective) + ' − 费用 ' + num(res.penalty) + ' = ' + num(res.objective) + '。</p>'
      + '<p>工作目标 ' + num(res.workingObjective) + ' · 总运量 Q = ' + num(m.total) + '</p>'
      + '<p class="tp-formula">还原 z = R × Q − 工作目标 = ' + num(res.objective)
      + '<br>' + num(m.maxReward) + ' × ' + num(m.total) + ' − ' + num(res.workingObjective) + ' = ' + num(res.objective) + '</p></article>' });
  h += '<details class="result-work" open><summary>计算过程：初始方案 → 最优方案</summary><section data-section="transport-derivation">'
    + '<div class="card"><h2 class="sec">平衡与转换</h2><p>' + balanceNote(m) + '</p>'
    + (m.direction === 'max' ? '<details class="tp-extra"><summary>查看平衡后的原表</summary>' : '')
    + table(m, m.cost, null, null, '平衡后原费用 / 收益', true) + (m.direction === 'max' ? '</details>' : '')
    + (m.direction === 'max' ? '<p class="tp-formula">最大收益 R = ' + num(m.maxReward) + '；c′ᵢⱼ = R − 原收益ᵢⱼ。</p>' : '')
    + (m.direction === 'max' ? table(m, m.working, null, null, '进入最小化算法的工作费用 c′ᵢⱼ = R − 原收益ᵢⱼ（R = ' + num(m.maxReward) + '）', true) : '')
    + '<p class="sens-note">禁运格不参与计算；有禁运时先验可行性。</p>'
    + (m.direction === 'max' ? '<p class="sens-note">虚拟格收益为负费用；过程使用 c′，末步还原原收益。</p>' : '') + '</div>'
    + study.group(contents, '运输问题逐步推导') + '</section></details>';
  return h;
}
module.exports = { render: render, table: table, balanceNote: balanceNote, num: num };
