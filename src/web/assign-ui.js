/* =========================================================================
   指派问题（匈牙利法）模块界面
   -------------------------------------------------------------------------
   输入：系数矩阵（行 = 人员、列 = 工作）。单元格里填数字；填 ×（或 x、-、M）
        表示「这个人不能做这件事」（禁止指派）。矩阵几行几列由「+ 行 / + 列」
        控制，**空矩阵也是合法输入**（会有确定结论，不弹错）。
   输出：
     ① 转换：最大化 → b = M − c；人数与工作数不等 → 补虚拟行列（费用 0）
     ② 每一轮迭代的每一步 —— 行归约 / 列归约 / 试指派 / 覆盖线 / 矩阵调整，
        每一步一张矩阵快照：圈定的 0、被划掉的 0、覆盖线、θ 都画在矩阵上；
     ③ 结论：最优指派 + 目标值（最大化再给一条 Σb = n·M − z 的检验）；
     ④ 符号说明：文案来自 core/assignment.js 的 assignSymbols()，界面不另写一份。
   -------------------------------------------------------------------------
   本文件只碰 DOM 与排版，一个算式也不自己算：全部数值来自 core/assignment.js。
   ========================================================================= */

var format = require('../core/format.js');
var fmtNum = format.fmtNum;

var assignment = require('../core/assignment.js');
var assignSolve = assignment.assignSolve;
var assignSymbols = assignment.assignSymbols;

var inputPanel = require('./input-panel.js');
var addScrollHints = inputPanel.addScrollHints;

(function () {
  'use strict';

  var MAX_ROW = 8;                 // 人员数上限（再多手机上矩阵就看不清了）
  var MAX_COL = 8;                 // 工作数上限
  /* 禁止指派的记号：与 core/assignment.js 的 FORBIDDEN_TOKENS 保持一致 */
  var FORBIDDEN = ['x', 'X', '×', '-', '—', '–', '∞', 'M', 'inf', 'INF', 'Inf'];

  /* cells[i][j] 存的是**用户原样输入的字符串**：这样「×」不会被解析掉，
     重绘时还能原样显示；转成数字只在求解那一刻做（readCost）。 */
  var state = { dir: 'min', rows: 0, cols: 0, cells: [] };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function subs(k) {
    return String(k).replace(/[0-9]/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[+d]; });
  }
  function banner(msg) {
    $('asBanners').innerHTML = msg ? '<div class="banner err">' + esc(msg) + '</div>' : '';
  }

  /* 一格输入 → 数字 / null（禁止指派）/ 0（空） */
  function parseCell(raw) {
    var s = String(raw === undefined || raw === null ? '' : raw).trim();
    if (s === '') return 0;                                  // 与项目其它模块一致：空格按 0 计
    if (FORBIDDEN.indexOf(s) >= 0) return null;
    var v = parseFloat(s.replace(/[^0-9.\-+eE]/g, ''));
    return isFinite(v) ? v : 0;
  }

  /* ===================== 输入表 ===================== */
  function renderInput() {
    var m = state.rows, n = state.cols, h = '', i, j;
    if (m > 0 && n > 0) {
      h += '<thead><tr><th></th>';
      for (j = 0; j < n; j++) h += '<th class="colh">工作' + (j + 1) + '</th>';
      h += '</tr></thead>';
    }
    h += '<tbody>';
    if (m === 0 || n === 0) {
      h += '<tr><td class="empty-tip">还没有系数矩阵 —— 点下方「+ 行 / + 列」搭出来'
        + '（行 = 人员，列 = 工作）。单元格里填 <b>×</b> 表示这个人不能做这件事。</td></tr>';
    } else {
      for (i = 0; i < m; i++) {
        h += '<tr><th class="lbl">' + rowName(i, m) + '</th>';
        for (j = 0; j < n; j++) {
          var v = (state.cells[i] && state.cells[i][j] !== undefined) ? state.cells[i][j] : '';
          h += '<td><input class="num" type="text" inputmode="text" placeholder="0" '
            + 'aria-label="' + rowName(i, m) + '做第 ' + (j + 1) + ' 项工作的费用或收益，填 × 表示不允许" '
            + 'data-i="' + i + '" data-j="' + j + '" value="' + esc(v) + '"></td>';
        }
        h += '</tr>';
      }
    }
    h += '</tbody>';
    $('asInTbl').innerHTML = h;
    bindInput();
    $('asDelRow').disabled = (m < 1);
    $('asAddRow').disabled = (m >= MAX_ROW);
    $('asDelCol').disabled = (n < 1);
    $('asAddCol').disabled = (n >= MAX_COL);
    addScrollHints(document);
  }

  function bindInput() {
    Array.prototype.forEach.call($('asInTbl').querySelectorAll('input.num'), function (inp) {
      inp.addEventListener('input', function () {
        var i = +inp.dataset.i, j = +inp.dataset.j;
        if (!state.cells[i]) state.cells[i] = [];
        state.cells[i][j] = inp.value;
        $('asOut').innerHTML = '';          // 一改输入就把上一次的结果收掉，免得对不上
      });
    });
  }

  function rowName(i, m) { return i < m ? '人员' + (i + 1) : '虚拟人员' + (i - m + 1); }

  function setSize(rows, cols) {
    rows = Math.max(0, Math.min(MAX_ROW, rows));
    cols = Math.max(0, Math.min(MAX_COL, cols));
    var cells = [], i, j;
    for (i = 0; i < rows; i++) {
      var old = state.cells[i] || [];
      var row = [];
      for (j = 0; j < cols; j++) row.push(old[j] === undefined ? '' : old[j]);
      cells.push(row);
    }
    state.rows = rows; state.cols = cols; state.cells = cells;
    renderInput();
  }

  function readCost() {
    var out = [];
    for (var i = 0; i < state.rows; i++) {
      var row = [];
      for (var j = 0; j < state.cols; j++) row.push(parseCell(state.cells[i] && state.cells[i][j]));
      out.push(row);
    }
    return out;
  }

  /* ===================== 求解 ===================== */
  function solve() {
    var res;
    try {
      res = assignSolve({ direction: state.dir, cost: readCost() });
    } catch (e) {
      banner('这道题算不了：' + e.message);
      return;
    }
    if (!res.ok) { banner(res.message || '输入有误'); return; }
    banner('');
    render(res);
  }

  /* ===================== 输出 ===================== */
  function render(res) {
    var h = '';
    h += transformCard(res);
    if (res.status === 'infeasible' || res.status === 'iteration-limit') {
      h += '<div class="card"><div class="verdict no"><div class="vtitle">'
        + (res.status === 'infeasible' ? '无可行解' : '未收敛') + '</div>'
        + '<div class="vsum">' + esc(res.message) + '</div></div></div>';
      $('asOut').innerHTML = h;
      addScrollHints(document);
      return;
    }
    if (res.empty) {
      h += '<div class="card"><div class="verdict opt"><div class="vtitle">空问题</div>'
        + '<div class="sol">z = <span class="zv">0</span></div>'
        + '<div class="vsum">' + esc(res.message) + '</div></div></div>';
      $('asOut').innerHTML = h;
      addScrollHints(document);
      return;
    }
    h += roundsCard(res);
    h += conclusionCard(res);
    $('asOut').innerHTML = h;
    addScrollHints(document);
  }

  /* ---------------- ① 转换（只在真做了转换时才出现） ---------------- */
  function transformCard(res) {
    if (!res.hasVirtual && res.direction !== 'max') return '';
    var h = '<h2 class="sec">转换</h2><div class="card">';
    h += '<div class="std-note">';
    if (res.direction === 'max') {
      h += '<b>最大化 → 最小化。</b>取矩阵里的最大元素 M = ' + fmtNum(res.M)
        + '，令 b<sub>ij</sub> = M − c<sub>ij</sub>。求最小的 Σb 与求最大的 Σc 是同一件事'
        + '（Σb = n·M − Σc，n·M 是常数），所以匈牙利法照样能用；'
        + '最后用 z = n·M − Σb 还原成最大总收益。<br>';
    }
    if (res.hasVirtual) {
      h += '<b>人数与工作数不等 → 补虚拟行列。</b>'
        + (res.virtualRows.length ? '补 ' + res.virtualRows.length + ' 个虚拟人员' : '')
        + (res.virtualRows.length && res.virtualCols.length ? '、' : '')
        + (res.virtualCols.length ? '补 ' + res.virtualCols.length + ' 项虚拟工作' : '')
        + '，费用一律取 0，把矩阵补成 ' + res.N + ' 阶方阵。'
        + (res.virtualRows.length
            ? '谁被派去做虚拟工作，就表示这个人（这类人）没有真实工作要做。'
            : '哪项工作落到了虚拟人员头上，就表示这项工作没有人做 —— 这是「工作比人多」时必然出现的结果。');
    }
    h += '</div>';
    h += '<div class="std-h">原系数矩阵</div>';
    h += matrixHtml(res.original, null, null, res.rowLabels.slice(0, res.m), res.colLabels.slice(0, res.n));
    h += '<div class="std-arrow">↓ ' + (res.direction === 'max'
      ? 'b = M − c' + (res.hasVirtual ? '，虚拟行列取 0' : '')
      : '补虚拟行列（费用取 0）') + '</div>';
    h += '<div class="std-h">进入匈牙利法的矩阵</div>';
    h += matrixHtml(res.working, null, null, res.rowLabels, res.colLabels);
    return h + '</div>';
  }

  /* ---------------- ② 每一轮迭代 ---------------- */
  function roundsCard(res) {
    var h = '<h2 class="sec">迭代过程（匈牙利法）</h2>';
    h += '<div class="card"><div class="sens-note">本节对应教材第 6 章 6.7 分配问题（6.7.2 最优匹配），'
      + '步骤名称按通用口径书写（教材正文未逐条核对）。步骤：'
      + '<b>① 行归约</b>每行减去本行最小元素 → <b>② 列归约</b>每列减去本列最小元素 → '
      + '<b>③ 试指派</b>圈出互不同行同列的 0 → <b>④ 覆盖线</b>用最少的直线盖住所有 0 → '
      + '<b>⑤ 矩阵调整</b>未覆盖的最小元素 θ，未覆盖的减 θ、被两条线交叉覆盖的加 θ，回到③。'
      + '圈出的 0 达到 n = ' + res.N + ' 个时结束，圈到的那 n 个格子就是最优指派。</div>'
      + '</div>';

    /* 按轮次分组：steps 是平铺的，界面按 round 归拢，一轮一张可收纳卡 */
    var byRound = {};
    res.steps.forEach(function (s) {
      if (!byRound[s.round]) byRound[s.round] = [];
      byRound[s.round].push(s);
    });
    Object.keys(byRound).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      h += roundSection(res, r, byRound[r]);
    });
    return h;
  }

  function roundSection(res, round, steps) {
    var last = steps[steps.length - 1];
    var tryStep = null;
    steps.forEach(function (s) { if (s.phase === 'try') tryStep = s; });
    var chip = tryStep
      ? '圈出 ' + tryStep.matching.length + ' 个独立零元素'
        + (last.phase === 'adjust' ? '　θ = ' + fmtNum(last.theta) : '')
        + (tryStep.done ? '　✓ 完成' : '')
      : '';
    var h = '<details class="meth" open><summary class="meth-h">'
      + '<span class="meth-i">' + round + '</span>'
      + '<span class="meth-n">第 ' + round + ' 轮迭代' + (round === 1 ? '（行归约 → 列归约 → 试指派' : '（试指派') + '…）</span>'
      + (chip ? '<span class="meth-c">' + chip + '</span>' : '')
      + '<span class="meth-x"></span></summary><div class="meth-body">';
    steps.forEach(function (s) {
      h += '<div class="iter-head"><span class="name">' + esc(s.label) + '</span>'
        + '<span class="tag' + (s.done ? ' done' : '') + '">' + esc(s.title) + '</span></div>';
      h += matrixHtml(s.matrix, s.marks, s.lines, res.rowLabels, res.colLabels);
      h += matrixLegend(s, res.rowLabels, res.colLabels);
      if (s.details.length) {
        h += '<div class="judge">';
        s.details.forEach(function (d) {
          h += '<span class="row">· ' + esc(d).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</span>';
        });
        h += '</div>';
      }
      if (s.note) h += '<div class="sens-note">→ ' + esc(s.note) + '</div>';
    });
    return h + '</div></details>';
  }

  /* 每张矩阵下面的图例：圈 / 划掉 / 禁止 / 覆盖线。
     ★ 覆盖线一定要**点名**盖住了哪一行、哪一列：线是画在矩阵上的，读者最需要的是
       「这条线说的是谁」，而不是「横线 = 没打勾的行」这种抽象规则（规则在讲解里已有）。 */
  function matrixLegend(s, rowLabels, colLabels) {
    var bits = ['〇 圈定的 0（一次指派）'];
    if (s.marks && s.marks.some(function (r) { return r.some(function (v) { return v === 'cross'; }); })) {
      bits.push('<s>0</s> 被划掉的 0（同行同列已经有指派）');
    }
    if (s.matrix.some(function (r) { return r.some(function (v) { return v === null; }); })) {
      bits.push('× 禁止指派');
    }
    if (s.lines) {
      var hr = [], vc = [];
      s.lines.rows.forEach(function (v, i) { if (v) hr.push(rowLabels[i] || ('第' + (i + 1) + '行')); });
      s.lines.cols.forEach(function (v, j) { if (v) vc.push(colLabels[j] || ('第' + (j + 1) + '列')); });
      bits.push('<span class="lg-warn lg-h">━ 横线盖住的是行：'
        + esc(hr.length ? hr.join('、') : '无') + '</span>');
      bits.push('<span class="lg-warn lg-v">┃ 竖线盖住的是列：'
        + esc(vc.length ? vc.join('、') : '无') + '</span>');
      bits.push('共 ' + (hr.length + vc.length) + ' 条线');
    }
    return '<div class="mtx-legend">' + bits.join('<br>') + '</div>';
  }

  /**
   * matrixHtml —— 把一张矩阵渲染成表格。
   * @param {Array<Array<number|null>>} M 矩阵
   * @param {Array<Array<string|null>>} [marks] 逐格标记（circ / cross）
   * @param {{rows:boolean[],cols:boolean[]}} [lines] 覆盖线
   * @param {string[]} rowLabels 行名
   * @param {string[]} colLabels 列名
   * @returns {string}
   */
  function matrixHtml(M, marks, lines, rowLabels, colLabels) {
    var h = '<div class="scroll"><table class="mtxout"><thead><tr><th></th>';
    for (var j = 0; j < colLabels.length; j++) {
      h += '<th' + (lines && lines.cols[j] ? ' class="cxh"' : '') + '>' + esc(colLabels[j]) + '</th>';
    }
    h += '</tr></thead><tbody>';
    for (var i = 0; i < M.length; i++) {
      var cls = [];
      if (lines && lines.rows[i]) cls.push('lr');
      h += '<tr><th class="lbl' + (cls.length ? ' ' + cls.join(' ') : '') + '">'
        + esc(rowLabels[i] || ('第' + (i + 1) + '行')) + '</th>';
      for (var j2 = 0; j2 < M[i].length; j2++) {
        var v = M[i][j2], mk = marks ? marks[i][j2] : null;
        /* 覆盖线：横线画在该行的每个格子上、竖线画在该列的每个格子上 —— 类名必须拼进
           class 属性里，写成 <td lr> 只是一个没人认识的属性，线根本不会出现。 */
        var tdCls = [];
        if (lines && lines.rows[i]) tdCls.push('lr');
        if (lines && lines.cols[j2]) tdCls.push('lc');
        var inner;
        if (v === null) inner = '<span class="cv forbid">×</span>';
        else if (mk === 'circ') inner = '<span class="cv circ">' + esc(fmtNum(v)) + '</span>';
        else if (mk === 'cross') inner = '<span class="cv cross">' + esc(fmtNum(v)) + '</span>';
        else inner = '<span class="cv' + (Math.abs(v) < 1e-9 ? ' zero' : '') + '">' + esc(fmtNum(v)) + '</span>';
        h += '<td' + (tdCls.length ? ' class="' + tdCls.join(' ') + '"' : '') + '>' + inner + '</td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  }

  /* ---------------- ③ 结论 ---------------- */
  function conclusionCard(res) {
    var h = '<h2 class="sec">结论</h2><div class="card">';
    h += '<div class="verdict opt"><div class="vtitle">最优指派（共 ' + res.roundCount + ' 轮、'
      + res.steps.length + ' 步）</div>';
    h += '<div class="judge" style="margin-top:0;background:transparent;border-left:0;padding:0">';
    res.assignment.forEach(function (a) {
      h += '<span class="row">' + esc(a.rowName) + ' → ' + esc(a.colName)
        + (a.used ? '　<b>' + esc(fmtNum(a.cost)) + '</b>'
                  : '　<span class="muted">（虚拟，这一方没有真实工作）</span>') + '</span>';
    });
    h += '</div>';
    h += '<div class="sol">' + (res.direction === 'max' ? '最大总收益' : '最小总费用')
      + ' z = <span class="zv">' + esc(fmtNum(res.objective)) + '</span></div>';
    if (res.direction === 'max') {
      h += '<div class="vsum">检验：转换后 Σb = ' + esc(fmtNum(res.zMin)) + '，n·M = '
        + esc(fmtNum(res.N * res.M)) + '，两者相减正好等于 z（z = n·M − Σb）。</div>';
    }
    var free = res.assignment.filter(function (a) { return !a.used; });
    if (free.length) {
      h += '<div class="vsum">有 ' + free.length + ' 个格子接的是虚拟行列，说明'
        + (res.virtualCols.length ? '这一方没有分到真实工作' : '有工作由虚拟人员顶掉了')
        + '——这是人数与工作数不等的必然结果。</div>';
    }
    return h + '</div></div>';
  }

  /* ---------------- ④ 符号说明 ----------------
     渲染在模块页自己的容器里（不在结果容器内）：符号说明是「随时想查就查」的东西，
     求解前也该看得到，而且它不随结果被清空。 */
  function renderSymbols() {
    var box = $('asSym');
    if (!box) return;
    var h = '<details class="help"><summary>符号说明</summary><ul>';
    assignSymbols().forEach(function (s) {
      h += '<li><b>' + esc(s.k) + '</b><span class="d">' + esc(s.d) + '</span></li>';
    });
    box.innerHTML = h + '</ul></details>';
  }

  /* ===================== 启动 ===================== */
  Array.prototype.forEach.call($('asDirSeg').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      state.dir = b.dataset.dir;
      Array.prototype.forEach.call($('asDirSeg').querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x === b);
      });
      $('asOut').innerHTML = '';
    });
  });
  $('asAddRow').addEventListener('click', function () { setSize(state.rows + 1, state.cols ? state.cols : 1); });
  $('asDelRow').addEventListener('click', function () { setSize(state.rows - 1, state.cols); });
  $('asAddCol').addEventListener('click', function () { setSize(state.rows ? state.rows : 1, state.cols + 1); });
  $('asDelCol').addEventListener('click', function () { setSize(state.rows, state.cols - 1); });
  $('asSolveBtn').addEventListener('click', solve);
  renderInput();
  renderSymbols();

  /* 供截图脚本与回归脚本使用：一次性把矩阵尺寸与内容摆好（真人手点用不到） */
  window.__asFill = function (rows, cols, values) {
    setSize(rows, cols);
    if (values) {
      state.cells = values.map(function (r) {
        return r.map(function (v) { return v === null || v === undefined ? '×' : String(v); });
      });
      renderInput();
    }
    return 'filled';
  };
})();

/* 本模块没有对外接口：require 一次即完成指派问题界面初始化（副作用模块）。 */
module.exports = {};
