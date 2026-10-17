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
  if (m.balanceAdjustment) h += '供需差属于浮点求和误差；已将需求校正 ' + num(m.balanceAdjustment) + '（原输入保留）。';
  if (!m.virtual) return h + '供需平衡。';
  h += m.virtual.type === 'surplus' ? '补虚拟销地，需求 ' : '补虚拟产地，供应 ';
  h += num(m.virtual.amount) + '。虚拟运输量表示' + (m.virtual.type === 'surplus' ? '各产地剩余供应' : '各销地缺货') + '，不代表实际运输。';
  return h + '默认零费用表示不计剩余处理损失或缺货损失；不会产生真实收益。可在输入区配置逐产地处理费或逐销地罚金。最大收益时这些费用从总收益中扣除，虚拟格原收益为费用的负数。';
}
function vector(a) { return a.map(num).join('，'); }
function stepContent(m, s, index) {
  var title, h = '', values = s.allocation, loop = null;
  if (s.type === 'allocation') {
    title = '最小元素分配 ' + cellName(s.cell);
    h += '<p>在尚未固定且剩余供需均为正的可运格中，选择最小工作费用 ' + num(s.cost) + '，格 ' + cellName(s.cell)
      + '；并列候选 ' + s.ties.map(cellName).join('、') + '，取行列下标最小者。</p>'
      + '<p>普通分配上限 min(剩余供应, 剩余需求) = ' + num(s.proposedQuantity) + '。'
      + (s.guarded ? '可行性检查发现按上限分配会堵住后续路线，剩余网络将有 ' + num(s.feasibilityDeficit)
        + ' 单位无法匹配；瓶颈产地：' + s.blockedCutRows.map(function (i) { return rowName(m, i); }).join('、')
        + '。本格改取保持剩余供需可满足的最大量。' : '')
      + '实际分配 <b>' + num(s.quantity) + '</b>。' + (s.quantity === 0 ? '本格跳过，不作为基变量。' : '') + '剩余供应 [' + vector(s.remainingSupply)
      + ']；剩余需求 [' + vector(s.remainingDemand) + ']。</p>';
  } else if (s.type === 'initial') {
    title = '初始可行方案（尚未检验最优）';
    h += '<p>最小元素分配结束。按行列下标补入不形成回路的零值基变量：'
      + (s.zeroBasics.length ? s.zeroBasics.map(cellName).join('、') : '无需补基')
      + '。可运图有 ' + m.components + ' 个连通分量（含孤立结点），基格构成 m+n−分量数 = ' + m.basisSize + ' 条边的森林；只用可运格补基。零值基仍是基变量，实际运量为 0。</p>';
  } else if (s.type === 'potentials') {
    title = s.entering ? 'MODI 位势与检验：选择入基格' : 'MODI 最优性检验';
    h += '<p>每个连通分量独立选一个结点令位势为 0，对每个基格解 uᵢ + vⱼ = c′ᵢⱼ。行位势 u = [' + vector(s.u) + ']；列位势 v = [' + vector(s.v) + ']。</p>'
      + '<p>检验数 Δᵢⱼ = c′ᵢⱼ − uᵢ − vⱼ；负检验数表示工作目标可下降。逐格按费用与位势的大小估计浮点舍入容差，参考上界 ' + num(m.costTolerance) + '。</p>'
      + table(m, s.reduced, null, null, '检验数 Δ（基格应为 0；数值在本格容差内视为 0）', true)
      + '<p>' + (s.entering ? '按 Bland 规则取行列下标最小的负检验数可运非基格 ' + cellName(s.entering) + ' 入基。' : '所有可运非基检验数 ≥ −容差，当前方案在数值容差内最优；禁运格不参与检验。') + '</p>';
  } else {
    title = '闭回路调整 · 第 ' + s.iteration + ' 轮';
    values = s.beforeAllocation; loop = s.cycle;
    h += '<p>入基 ' + cellName(s.entering) + '，沿基树的唯一闭回路依次标 + / −：'
      + s.cycle.map(function (c) { return cellName(c) + (c.sign > 0 ? '+' : '−'); }).join(' → ') + ' → 起点。</p>'
      + '<p>θ = 所有负号格的最小运量 = <b>' + num(s.theta) + '</b>。正号格加 θ，负号格减 θ；同量离基候选取下标最小者 '
      + cellName(s.leaving) + ' 离基。' + (s.theta === 0 ? '本轮为退化换基，运量与目标值不变，基身份改变。' : '') + '</p>'
      + '<p>工作目标变化 θΔ = ' + num(s.workingDelta) + '；原目标 ' + num(s.objectiveBefore) + ' → ' + num(s.objectiveAfter)
      + '（变化 ' + num(s.delta) + '）。</p>';
  }
  h += s.type === 'allocation' || s.type === 'pivot' ? player.render(m, s, index)
    : table(m, values, s.basis, loop, title, false);
  h += '<p class="sens-note">当前原目标值 ' + num(s.objective) + '。本步' + (s.type === 'allocation' ? '部分分配与无环基' : '非负、供需守恒与基结构')
    + '校验：' + (s.invariant.valid ? '通过' : esc(s.invariant.errors.join('、'))) + '。</p>';
  return { title: title, html: '<article class="card"><h3>' + (index + 1) + '. ' + esc(title) + '</h3>' + h + '</article>' };
}
function render(res) {
  var m = res.model, optimal = res.status === 'optimal';
  if (res.status === 'infeasible') {
    var f = res.feasibility;
    return '<div class="card"><div class="verdict no"><div class="vtitle">禁运限制下无可行方案</div></div>'
      + '<p>' + esc(res.message) + '</p><p>在辅助网络中，最大可匹配量为 ' + num(m.total - f.deficit)
      + '，仍有 ' + num(f.deficit) + ' 单位供需无法匹配；这不是最优运输方案，也不新增虚拟线路绕过禁运。</p>'
      + '<p>瓶颈产地集合：' + f.cutRows.map(function (i) { return rowName(m, i); }).join('、')
      + '；其可达销地集合：' + (f.cutCols.length ? f.cutCols.map(function (j) { return colName(m, j); }).join('、') : '无')
      + '。这些产地供应 ' + num(f.cutSupply) + '，可达需求仅 ' + num(f.cutDemand) + '。请检查禁运标记或调整供需。</p>'
      + '<p>下表标出瓶颈产地及其可达销地；禁运格保持关闭，不会通过额外增加虚拟供需绕过限制。</p>'
      + '<p>' + balanceNote(m) + '</p>' + table(m, m.cost, null, null, '平衡后运输表与禁运瓶颈', true,
        { cutRows: f.cutRows, cutCols: f.cutCols }) + '</div>';
  }
  var h = '<div class="card"><div class="verdict ' + (optimal ? 'opt' : 'no') + '"><div class="vtitle">'
    + (optimal ? m.direction === 'max' ? '最优净收益' : '最小总费用' : res.feasible ? '当前可行方案（未确认最优）' : '数值校验未通过（未确认最优）') + '</div>'
    + '<div class="sol">z = <span class="zv">' + num(res.objective) + '</span></div></div>';
  if (!optimal) h += '<p>' + esc(res.message) + '</p>';
  h += '<p>真实线路' + (m.direction === 'max' ? '总收益' : '总费用') + ' ' + num(res.realObjective) + '；剩余处理费 / 缺货罚金 ' + num(res.penalty) + '。</p>';
  if (m.direction === 'max') h += '<p>转换 c′ = −原收益（虚拟格为正罚金）。最小工作目标 ' + num(res.workingObjective) + '，还原 z = −工作目标 = ' + num(res.objective) + '。</p>';
  if (res.surplus) h += '<p class="tp-balance">剩余供应：' + res.surplus.map(function (v, i) { return '产地' + (i + 1) + '：' + num(v); }).join('；') + '。</p>';
  if (res.shortage) h += '<p class="tp-balance">缺货量：' + res.shortage.map(function (v, j) { return '销地' + (j + 1) + '：' + num(v); }).join('；') + '。</p>';
  h += table(m, res.allocation, res.basis, null, optimal ? '最终最优运输方案' : '当前运输方案', false)
    + '<p class="sens-note">格内左上角是原费用（最大收益题为原收益），中间是运量；运量外套方框的格是基变量，零值基同样套框并在格内标注。零值基格也参与位势与回路计算。虚拟行列以文字标识。</p>';
  if (optimal) h += '<p>' + (res.multipleOptimal ? '存在多重最优：已找到可正量调整的零检验数回路（θ = ' + num(res.alternative.theta) + '），下方可查看另一方案。' : '未发现不同的最优运输方案；零检验数仅允许零步长换基时不算多重最优。') + '</p>';
  if (res.alternative) h += '<details><summary>查看另一个最优方案</summary>' + table(m, res.alternative.allocation, null, res.alternative.cycle, '另一最优运输方案（原目标 ' + num(res.alternative.objective) + '）', false) + '</details>';
  h += '</div>' + layout.navigation([['transport-derivation', '查看完整推导 / 单步学习']]);
  h += '<details class="result-work" open><summary>计算过程：初始可行方案 → MODI 最优方案</summary><section data-section="transport-derivation">'
    + '<div class="card"><h2 class="sec">模型平衡与转换</h2><p>' + balanceNote(m) + '</p>'
    + table(m, m.cost, null, null, '平衡后原费用 / 收益矩阵（含虚拟行列）', true)
    + (m.direction === 'max' ? table(m, m.working, null, null, '进入最小化算法的工作费用 c′ = −原收益', true) : '')
    + '<p>禁运格不参与分配、补基、位势检验和闭回路。存在禁运时，先用辅助最大流检查可行性；逐格尝试普通分配上限，必要时减少至可行最大量，再固定该格。最大流只作可行性保护，费用优化仍用 MODI。</p>'
    + '<p>固定规则：最小元素并列取行列下标最小者；MODI 负检验数取下标最小者入基；最小负号运量并列取下标最小者离基。Bland 规则防止退化循环；仍检测重复基及迭代上限，异常停止不报告最优。</p></div>'
    + study.group(res.steps.map(function (s, i) { return stepContent(m, s, i); }), '运输问题逐步推导') + '</section></details>';
  return h;
}
module.exports = { render: render, table: table, balanceNote: balanceNote, num: num };
