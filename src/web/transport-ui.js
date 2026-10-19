/* 运输表输入与事件；只调用核心公开 API，求解过程由 report 渲染。 */
'use strict';
var dom = require('./dom.js'), $ = dom.$, esc = dom.esc;
var parseNumber = require('../core/number-input.js').parseNumber;
var transport = require('../core/transport.js');
var report = require('./transport-report.js');
var player = require('./transport-player.js');
var panels = require('./input-panel.js');
var layout = require('./result-layout.js');
var draft = require('./draft.js');
(function () {
  var MAX = 8, guide, saved;
  var state = { direction: 'min', rows: 0, cols: 0, cells: [], supply: [], demand: [], surplusCost: [], shortageCost: [] };
  var disposePlayer = function () {};
  function invalidate() { disposePlayer(); disposePlayer = function () {}; $('tpOut').innerHTML = ''; $('tpBanners').innerHTML = ''; }
  function number(raw) { return parseNumber(raw, true); }
  function problem() {
    return { direction: state.direction, cost: state.cells.map(function (r) { return r.map(function (v) { return transport.isForbidden(v) ? v : number(v); }); }),
      supply: state.supply.map(number), demand: state.demand.map(number) };
  }
  function syncBalance() {
    var m = transport.validate(problem());
    var b = transport.balance(problem());
    $('tpBalance').textContent = b.ok ? '总供应 ' + report.num(b.supplyTotal) + '；总需求 ' + report.num(b.demandTotal)
      + (b.difference > 0 ? ' · 供大于求，剩余 ' + report.num(b.difference) : b.difference < 0 ? ' · 供小于求，缺货 ' + report.num(-b.difference) : ' · 供需平衡')
      : state.rows && state.cols ? '供需量须为非负数。' : '请添加产地和销地。';
    if (m.ok && m.forbiddenCount) $('tpBalance').textContent += '；' + m.forbiddenCount + ' 条禁运路线，需另验可行性。';
    /* 虚拟线路在求解前就可检查：原输入保留，平衡表由 core 生成。 */
    var preview = $('tpVirtual').querySelector('details'), previewOpen = preview && preview.open;
    $('tpVirtual').innerHTML = m.ok && (m.virtual || m.balanceAdjustment)
      ? '<details class="tp-extra"' + (previewOpen ? ' open' : '') + '><summary>查看补齐后的运输表</summary><p class="sens-note">' + report.balanceNote(m) + '</p>'
        + report.table(m, m.cost, null, null, '平衡后原费用 / 收益', true) + '</details>' : '';
    panels.addScrollHints($('tpPanel'));
  }
  function input(key, i, j, label) {
    var v = key === 'cells' ? state.cells[i][j] : state[key][i];
    var blocked = key === 'cells' && transport.isForbidden(v);
    var valid = blocked || isFinite(number(v)) && (key === 'cells' || number(v) >= 0);
    return '<input class="num" type="text" inputmode="text" placeholder="0" aria-label="' + esc(label)
      + (key === 'cells' ? '（填 M 禁运）' : '') + '" aria-invalid="' + (!valid) + '" data-key="' + key + '" data-i="' + i + '"'
      + (j === undefined ? '' : ' data-j="' + j + '"') + ' value="' + esc(v) + '">';
  }
  function renderInput() {
    var h = '', i, j;
    if (!state.rows && !state.cols) h = '<tbody><tr><td class="empty-tip">载入示例，或用下方按钮添加产地、销地。</td></tr></tbody>';
    else {
      h = '<caption>单位' + (state.direction === 'max' ? '收益' : '运费') + '</caption><thead><tr><th scope="col">产地 / 销地</th>';
      for (j = 0; j < state.cols; j++) h += '<th scope="col">销地' + (j + 1) + '</th>';
      h += '<th scope="col">供应量</th></tr></thead><tbody>';
      for (i = 0; i < state.rows; i++) {
        h += '<tr><th scope="row">产地' + (i + 1) + '</th>';
        for (j = 0; j < state.cols; j++) h += '<td' + (transport.isForbidden(state.cells[i][j]) ? ' class="tp-blocked"' : '') + '>' + input('cells', i, j, '产地' + (i + 1) + '至销地' + (j + 1) + (state.direction === 'max' ? '单位收益' : '单位运费')) + '</td>';
        h += '<td class="tp-margin">' + input('supply', i, undefined, '产地' + (i + 1) + '供应量') + '</td></tr>';
      }
      h += '</tbody><tfoot><tr><th scope="row">需求量</th>';
      for (j = 0; j < state.cols; j++) h += '<td class="tp-margin">' + input('demand', j, undefined, '销地' + (j + 1) + '需求量') + '</td>';
      h += '<td>—</td></tr></tfoot>';
    }
    $('tpInTbl').innerHTML = h;
    $('tpAddRow').disabled = state.rows >= MAX; $('tpDelRow').disabled = !state.rows;
    $('tpAddCol').disabled = state.cols >= MAX; $('tpDelCol').disabled = !state.cols;
    Array.prototype.forEach.call($('tpDirSeg').querySelectorAll('button'), function (b) {
      var active = b.dataset.dir === state.direction;
      b.classList.toggle('on', active); b.setAttribute('aria-pressed', String(active));
    });
    if (guide) guide.sync(state.rows, state.cols);
    syncBalance();
  }
  function resize(rows, cols) {
    function size(a, n) { var out = []; for (var i = 0; i < n; i++) out[i] = a[i] === undefined ? '' : a[i]; return out; }
    state.supply = size(state.supply, rows); state.demand = size(state.demand, cols);
    state.surplusCost = size(state.surplusCost, rows); state.shortageCost = size(state.shortageCost, cols);
    var cells = [];
    for (var i = 0; i < rows; i++) cells[i] = size(state.cells[i] || [], cols);
    state.rows = rows; state.cols = cols; state.cells = cells;
    invalidate(); renderInput();
  }
  function load(p) {
    state.direction = p.direction;
    state.cells = p.cells.map(function (r) { return r.slice(); });
    ['supply', 'demand'].forEach(function (k) { state[k] = p[k].slice(); });
    /* 保留草稿结构兼容性；已移除的费用配置不从旧题恢复，也不参与网页求解。 */
    state.surplusCost = p.supply.map(function () { return ''; });
    state.shortageCost = p.demand.map(function () { return ''; });
    state.rows = p.rows; state.cols = p.cols;
    invalidate(); renderInput();
  }
  panels.buildChrome({ mount: 'tpPanel', tbl: 'tpInTbl', dirSeg: 'tpDirSeg', tblClass: 'inp mtx transport-input',
    matrix: 'transport', maxN: MAX, maxM: MAX, dirOrder: ['min','max'], state: { dir: 'min' },
    addVar: 'tpAddRow', delVar: 'tpDelRow', addCon: 'tpAddCol', delCon: 'tpDelCol',
    labels: { addVar: '+ 产地', delVar: '− 产地', addCon: '+ 销地', delCon: '− 销地' } });
  var extras = document.createElement('div');
  extras.innerHTML = '<p class="sens-note tp-input-note">空白=0 · 支持分数 · M 禁运</p>'
    + '<p class="tp-balance" id="tpBalance" role="status" aria-live="polite"></p>'
    + '<div id="tpVirtual"></div>';
  $('tpPanel').appendChild(extras);
  /* 主操作紧接供需状态，补齐表作为后续可选查看内容。 */
  extras.insertBefore($('tpSolveBtn').parentNode, $('tpVirtual'));
  function loadExample(p) {
    load({ direction: p.direction, rows: p.supply.length, cols: p.demand.length,
      cells: p.cost.map(function (r) { return r.map(String); }), supply: p.supply.map(String), demand: p.demand.map(String),
      surplusCost: p.supply.map(function () { return ''; }), shortageCost: p.demand.map(function () { return ''; }) });
  }
  Array.prototype.forEach.call($('tpDirSeg').querySelectorAll('button'), function (b) {
    b.textContent = b.dataset.dir === 'min' ? '最小运费' : '最大收益';
    b.addEventListener('click', function () { state.direction = b.dataset.dir; invalidate(); renderInput(); });
  });
  guide = require('./input-guide.js').attach($('tpPanel'), {
    sample: function () {
      loadExample(require('./examples.js').transport());
    }
  });
  [['tpAddRow', 1, 0], ['tpDelRow', -1, 0], ['tpAddCol', 0, 1], ['tpDelCol', 0, -1]].forEach(function (a) {
    $(a[0]).addEventListener('click', function () {
      resize(Math.max(0, Math.min(MAX, state.rows + a[1])), Math.max(0, Math.min(MAX, state.cols + a[2])));
    });
  });
  function edit(e) {
    var inp = e.target, key = inp.getAttribute('data-key');
    if (!key) return;
    var i = +inp.dataset.i;
    if (key === 'cells') state.cells[i][+inp.dataset.j] = inp.value;
    else state[key][i] = inp.value;
    var blocked = key === 'cells' && transport.isForbidden(inp.value);
    inp.setAttribute('aria-invalid', String(!blocked && (!isFinite(number(inp.value)) || (key !== 'cells' && number(inp.value) < 0))));
    if (key === 'cells') inp.parentNode.classList.toggle('tp-blocked', blocked);
    invalidate(); syncBalance();
  }
  $('tpPanel').addEventListener('input', edit);
  $('tpPanel').addEventListener('change', edit);
  $('tpSolveBtn').addEventListener('click', function () {
    invalidate();
    var res = transport.transportSolve(problem());
    if (!res.ok) { $('tpBanners').innerHTML = '<div class="banner err">' + esc(res.message) + '</div>'; return; }
    $('tpOut').innerHTML = report.render(res);
    panels.addScrollHints($('tpOut')); layout.wire($('tpOut')); disposePlayer = player.wire($('tpOut'), res); saved.record();
  });
  renderInput();
  saved = draft.attach({ key: 'transport', mount: 'tpPanel', valid: draft.validTransport,
    read: function () { return state; }, restore: load,
    reset: function () { state.direction = 'min'; resize(0, 0); } });
})();
module.exports = {};
