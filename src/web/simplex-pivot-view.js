/* 单纯形主页面的相邻快照讲解。只读展示；不求解、不推演中间表、不保存状态。 */
'use strict';
var format = require('../core/format.js');
var EPS = require('../core/util.js').EPS;
var esc = require('./dom.js').esc;
var renderTable = require('./table-render.js').renderTable;
var addScrollHints = require('./input-panel.js').addScrollHints;
var fmtNum = format.fmtNum, fmtPair = format.fmtPair;

function finite(value) { return typeof value === 'number' && isFinite(value); }
function index(value, length) { return finite(value) && Math.floor(value) === value && value >= 0 && value < length; }
function shape(step, m, n) {
  if (!step || !index(step.iter, Infinity) || !Array.isArray(step.rows) || step.rows.length !== m
      || !Array.isArray(step.basis) || step.basis.length !== m
      || !Array.isArray(step.obj) || step.obj.length !== n + 1) return false;
  var used = [], i, j;
  for (i = 0; i < m; i++) {
    if (!index(step.basis[i], n) || used.indexOf(step.basis[i]) >= 0
        || !Array.isArray(step.rows[i]) || step.rows[i].length !== n + 1) return false;
    used.push(step.basis[i]);
    for (j = 0; j <= n; j++) if (!finite(step.rows[i][j])) return false;
  }
  for (j = 0; j <= n; j++) {
    if (!step.obj[j] || !finite(step.obj[j].a) || !finite(step.obj[j].b)) return false;
  }
  return true;
}

/* 核对记录关系和单位列，不在表现层重做消元来猜测或修补后表。 */
function inspect(res, k) {
  if (!res || !res.ok || !Array.isArray(res.steps) || !index(k, res.steps.length)
      || !Array.isArray(res.vars) || !index(res.mConstraints, Infinity)) return { reason: 'invalid' };
  var a = res.steps[k], b = res.steps[k + 1], m = res.mConstraints, n = res.vars.length;
  for (var v = 0; v < n; v++) if (!res.vars[v] || typeof res.vars[v].name !== 'string') return { reason: 'invalid' };
  if (!shape(a, m, n)) return { reason: 'invalid' };
  if ((a.entering === null || index(a.entering, n)) && a.leaving === null && a.pivot === null) return { reason: 'terminal' };
  if (!index(a.entering, n) || !index(a.leaving, m) || !finite(a.pivot)
      || Math.abs(a.pivot) <= EPS || a.pivot !== a.rows[a.leaving][a.entering]
      || a.basis.indexOf(a.entering) >= 0) return { reason: 'invalid' };
  if (!b) return { reason: 'missing' };
  if (!shape(b, m, n) || b.iter !== a.iter + 1) return { reason: 'mismatch' };
  for (var i = 0; i < m; i++) {
    if (b.basis[i] !== (i === a.leaving ? a.entering : a.basis[i])
        || Math.abs(b.rows[i][a.entering] - (i === a.leaving ? 1 : 0)) > EPS) return { reason: 'mismatch' };
  }
  if (Math.abs(b.obj[a.entering].a) > EPS || Math.abs(b.obj[a.entering].b) > EPS) return { reason: 'mismatch' };
  return { reason: '', before: a, after: b, e: a.entering, r: a.leaving, n: n, m: m };
}

function render(res, k) {
  var pair = inspect(res, k);
  if (pair.reason === 'terminal') return '';
  if (pair.reason) {
    var message = pair.reason === 'missing'
      ? '缺少下一表快照，无法逐项对照。最后一次枢轴可能已执行，但没有记录后续完整表；这里不补算。'
      : '快照缺失或前后表关系不匹配，无法逐项对照。';
    return '<p class="simplex-pivot-unavailable">换表讲解：' + message + '</p>';
  }
  return '<details class="simplex-pivot" data-simplex-pivot="' + k + '"><summary>这一步怎样换表</summary>'
    + '<div data-pivot-body></div></details>';
}

function phases(pair) {
  return pair.m > 1 ? ['locate', 'normalize', 'eliminate', 'objective', 'finish']
    : ['locate', 'normalize', 'objective', 'finish'];
}
var titles = { locate: '定位枢轴', normalize: '主行归一化', eliminate: '其他约束行消元', objective: '目标行更新', finish: '完成换基' };
function formula(text) { return '<p class="simplex-pivot-formula">' + esc(text) + '</p>'; }
function par(value) { return '(' + fmtNum(value) + ')'; }
function pairPar(value) { return '(' + fmtPair(value) + ')'; }

/* 具体操作数与等号右边的结果全部读取快照；此处只连接文字。 */
function explanation(res, pair, phase, row, col) {
  var a = pair.before, b = pair.after, r = pair.r, e = pair.e, n = pair.n;
  var enter = esc(res.vars[e].name), leave = esc(res.vars[a.basis[r]].name);
  var rr = 'R' + (r + 1), ri = 'R' + (row + 1), h = '';
  if (phase === 'locate') {
    return '<p>本次 ' + enter + ' 入基，' + leave + ' 出基。枢轴在第 ' + (r + 1) + ' 行、第 '
      + (e + 1) + ' 列（' + enter + '），原值 p = ' + fmtNum(a.pivot)
      + '。选择依据见上方入基与比值说明。</p>'
      + (a.degenerate ? '<p>本次为退化换基（θ = 0）；目标值不变仍会换基，继续按真实快照查看。</p>' : '');
  }
  if (phase === 'normalize') {
    h = formula(rr + '′ = ' + rr + ' / p');
    h += '<p>' + (a.pivot === 1 ? '枢轴已经是 1，无需缩放，主行数值保持不变。' : '整条主行（含右端项）除以原枢轴，使枢轴成为 1。')
      + '两表轮廓标出第 ' + (r + 1) + ' 行。</p>';
    return h + formula('右端项：' + fmtNum(a.rows[r][n]) + ' ÷ ' + par(a.pivot) + ' = ' + fmtNum(b.rows[r][n]));
  }
  if (phase === 'eliminate') {
    h = formula(ri + '′ = ' + ri + ' − a' + (row + 1) + ',' + (e + 1) + ' × ' + rr + '′');
    if (a.rows[row][e] === 0) h += '<p>变换前入基列系数为 0，无需消元，此行保持不变。</p>';
    else h += '<p>用变换前第 ' + (row + 1) + ' 行系数 ' + fmtNum(a.rows[row][e])
      + '，乘变换后已归一化的第 ' + (r + 1) + ' 行，再从旧行减去。轮廓标出参与的两行。</p>';
    return h + formula('右端项：' + par(a.rows[row][n]) + ' − ' + par(a.rows[row][e]) + ' × '
      + par(b.rows[r][n]) + ' = ' + fmtNum(b.rows[row][n]));
  }
  if (phase === 'objective') {
    h = formula('σj′ = σj − σe × a' + (r + 1) + ',j′');
    h += '<p>σe = ' + esc(pairPar(a.obj[e])) + ' 取自旧目标行，主行取自变换后表；每格的 M 项和常数项一起更新。</p>';
    h += formula(res.vars[col].name + ' 列：' + pairPar(a.obj[col]) + ' − ' + pairPar(a.obj[e]) + ' × '
      + par(b.rows[r][col]) + ' = ' + pairPar(b.obj[col]));
    h += formula('目标行常数项：' + pairPar(a.obj[n]) + ' − ' + pairPar(a.obj[e]) + ' × '
      + par(b.rows[r][n]) + ' = ' + pairPar(b.obj[n]));
    return h + '<p>末格记录内部最大化目标的 ' + (res.swapped ? '−z′（原题 min 已取负）' : '−z')
      + '，不能直接当作原题目标值；原题目标值仍见求解结论。</p>';
  }
  h = '<p>第 ' + (r + 1) + ' 行基变量：' + leave + ' → ' + enter
    + '。入基列已形成单位列：主行是 1，其余约束行是 0，目标行对应检验数为 0。</p>';
  if (index(b.entering, n)) h += '<p>这次换表已完成；下一张表仍有入基选择，整个求解尚未完成，还需继续判定或迭代。</p>';
  else if (res.status === 'optimal' && b === res.steps[res.steps.length - 1]) h += '<p>这次换表已完成；下一张真实快照记录了最优终止判定，原题结论见上方。</p>';
  else h += '<p>这次换表已完成；整个问题的终止状态以求解结论为准。</p>';
  return h;
}

function content(res, pair) {
  var list = phases(pair), rows = '', cols = '';
  for (var i = 0; i < pair.m; i++) if (i !== pair.r) rows += '<option value="' + i + '">第 ' + (i + 1) + ' 行（' + esc(res.vars[pair.before.basis[i]].name) + '）</option>';
  for (var j = 0; j < pair.n; j++) cols += '<option value="' + j + '">' + esc(res.vars[j].name) + '</option>';
  var opts = { unmarked: true, positions: true };
  return '<p class="simplex-pivot-stale-note">这份讲解对应修改前的题目，请重新求解以查看当前输入。</p>'
    + '<div class="simplex-pivot-controls"><p data-pivot-progress role="status" aria-live="polite" aria-atomic="true">第 1 / '
    + list.length + ' 环节 · 定位枢轴</p><div class="simplex-pivot-actions">'
    + '<button type="button" class="btn" data-pivot-prev disabled>上一环节</button>'
    + '<button type="button" class="btn" data-pivot-next>下一环节</button></div></div>'
    + (rows ? '<label class="simplex-pivot-picker" data-pivot-row-picker hidden>查看约束行<select data-pivot-row-select>' + rows + '</select></label>' : '')
    + '<label class="simplex-pivot-picker" data-pivot-col-picker hidden>查看目标列<select data-pivot-col-select>' + cols + '</select></label>'
    + '<div class="simplex-pivot-explanation" data-pivot-explanation></div>'
    + '<p class="simplex-pivot-legend">两表均为已记录的完整快照；轮廓与底色标出本环节涉及的位置，不表示中间表或下一轮选择。</p>'
    + '<div class="simplex-pivot-tables"><figure data-pivot-before><figcaption>换表前 · 第 ' + pair.before.iter + ' 张表</figcaption>'
    + renderTable(res, pair.before, opts) + '</figure><figure data-pivot-after><figcaption>换表后 · 第 ' + pair.after.iter + ' 张表</figcaption>'
    + renderTable(res, pair.after, opts) + '</figure></div>';
}

function wire(root, res) {
  Array.prototype.forEach.call(root.querySelectorAll('[data-simplex-pivot]'), function (details) {
    if (details.getAttribute('data-pivot-ready')) return;
    details.setAttribute('data-pivot-ready', 'true');
    var pair = inspect(res, Number(details.getAttribute('data-simplex-pivot')));
    if (pair.reason) return;
    var initialized = false;
    details.addEventListener('toggle', function () {
      if (!details.open) return;
      if (!initialized) {
        initialized = true;
        initialize(details, res, pair);
      }
      addScrollHints(details);
    });
  });
}

function initialize(details, res, pair) {
  details.querySelector('[data-pivot-body]').innerHTML = content(res, pair);
  var list = phases(pair), phaseIndex = 0, row = pair.r === 0 ? 1 : 0, col = pair.e;
  var prev = details.querySelector('[data-pivot-prev]'), next = details.querySelector('[data-pivot-next]');
  var rowSelect = details.querySelector('[data-pivot-row-select]'), colSelect = details.querySelector('[data-pivot-col-select]');
  if (rowSelect) row = Number(rowSelect.value);
  colSelect.value = String(col);
  Array.prototype.forEach.call(details.querySelectorAll('.scroll'), function (scroll, i) {
    scroll.setAttribute('tabindex', '0');
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', (i ? '换表后' : '换表前') + '单纯形表，可横向滚动');
  });
  function show() {
    var phase = list[phaseIndex];
    details.setAttribute('data-pivot-phase', phase);
    details.querySelector('[data-pivot-progress]').textContent = '第 ' + (phaseIndex + 1) + ' / ' + list.length + ' 环节 · ' + titles[phase];
    details.querySelector('[data-pivot-explanation]').innerHTML = explanation(res, pair, phase, row, col);
    if (rowSelect) rowSelect.parentNode.hidden = phase !== 'eliminate';
    colSelect.parentNode.hidden = phase !== 'objective';
    prev.disabled = phaseIndex === 0;
    next.disabled = phaseIndex === list.length - 1;
    Array.prototype.forEach.call(details.querySelectorAll('[data-pivot-row]'), function (cell) {
      var r = cell.getAttribute('data-pivot-row'), c = Number(cell.getAttribute('data-pivot-col'));
      var after = !!cell.closest('[data-pivot-after]');
      var rowMark = (phase === 'normalize' && r === String(pair.r))
        || (phase === 'eliminate' && (r === String(row) || (after && r === String(pair.r))))
        || (phase === 'objective' && (r === 'obj' || (after && r === String(pair.r))));
      cell.classList.toggle('simplex-pivot-row-mark', rowMark);
      cell.classList.toggle('simplex-pivot-col-mark', (phase === 'locate' || phase === 'finish') && c === pair.e);
      cell.classList.toggle('simplex-pivot-cell-mark', (phase === 'locate' && r === String(pair.r) && c === pair.e)
        || (phase === 'normalize' && r === String(pair.r) && c === pair.n)
        || (phase === 'eliminate' && ((!after && r === String(row) && c === pair.e) || (after && r === String(pair.r) && c === pair.n)))
        || (phase === 'objective' && (r === 'obj' || (after && r === String(pair.r))) && (c === col || c === pair.n)));
    });
  }
  function move(delta, button) {
    phaseIndex = Math.max(0, Math.min(list.length - 1, phaseIndex + delta));
    show();
    if (button.disabled && document.activeElement === button) (delta > 0 ? prev : next).focus();
  }
  prev.addEventListener('click', function () { move(-1, prev); });
  next.addEventListener('click', function () { move(1, next); });
  if (rowSelect) rowSelect.addEventListener('change', function () { row = Number(rowSelect.value); show(); });
  colSelect.addEventListener('change', function () { col = Number(colSelect.value); show(); });
  show();
}

module.exports = { inspect: inspect, render: render, phases: phases, explanation: explanation, content: content, wire: wire };
