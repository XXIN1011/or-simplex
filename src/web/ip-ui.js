/* =========================================================================
   整数规划模块界面
   -------------------------------------------------------------------------
   输入：沿用单纯形法那张输入表（同一个组件），另加一行「每个变量是 连续/整数/0-1」。
   输出：先给松弛问题的解，再按**该方法在本题上到底能不能用**决定输出哪些解法：
         · 能用的全部输出，每个都带完整的逐步过程
         · 某个方法规模过大（比如隐枚举要枚举上百万个点）→ 不硬算，
           改为提示并按用户勾选的解法输出
         · 不能用的不输出，只留一行「为什么不能用」
   ========================================================================= */

var ipSolve = require('../core/integer.js').ipSolve;
var createInputPanel = require('./input-panel.js').createInputPanel;
var render = require('./integer-report.js').render;
var dom = require('./dom.js');
var $ = dom.$, esc = dom.esc, subs = dom.subs;

(function () {
  'use strict';

  var TYPE_NAMES = { cont: '连续', int: '整数', bin: '0-1' };

  var panel = createInputPanel({
    mount: 'ipPanel',
    tbl: 'ipInTbl', dirSeg: 'ipDirSeg',
    addVar: 'ipAddVar', delVar: 'ipDelVar', addCon: 'ipAddCon', delCon: 'ipDelCon',
    maxN: 8, maxM: 8,
    example: require('./examples.js').integer,
    onLoad: function (p) { vtypes = (p.vtypes || []).slice(); renderTypes(); },
    onResize: renderTypes,
    state: { dir: 'max', n: 0, m: 0, c: [], cons: [] },
    onChange: invalidate
  });
  var vtypes = [];                 // 与变量一一对应的类型

  var last = null;

  function invalidate() {
    var hadResult = !!$('ipOut').textContent;
    last = null;
    $('ipOut').innerHTML = '';
    banner(hadResult ? '输入已修改，请重新求解。' : '', '');
  }

  function banner(msg, kind) {
    $('ipBanners').innerHTML = msg
      ? '<div class="banner ' + (kind || 'err') + '">' + esc(msg) + '</div>' : '';
  }

  /* ===================== 变量类型选择器 ===================== */
  function syncVtypes() {
    var n = panel.state.n;
    while (vtypes.length < n) vtypes.push('int');
    vtypes.length = n;
  }
  function renderTypes() {
    syncVtypes();
    var n = panel.state.n, h = '';
    if (n === 0) { $('ipTypes').innerHTML = ''; return; }
    h += '<div class="sens-note">每个变量取值的限制：<b>连续</b>就是普通线性规划的变量，'
      + '<b>整数</b>要求取整，<b>0-1</b>要求只能取 0 或 1。</div>';
    for (var j = 0; j < n; j++) {
      h += '<div class="fh"><span class="fl">x' + subs(j + 1) + '</span>'
        + '<div class="seg sm" data-vt="' + j + '">'
        + ['cont', 'int', 'bin'].map(function (t) {
            return '<button type="button" data-t="' + t + '" class="'
              + (vtypes[j] === t ? 'on' : '') + '">' + TYPE_NAMES[t] + '</button>';
          }).join('')
        + '</div></div>';
    }
    $('ipTypes').innerHTML = h;
    Array.prototype.forEach.call($('ipTypes').querySelectorAll('[data-vt]'), function (box) {
      var j = +box.dataset.vt;
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(box.querySelectorAll('button'), function (x) {
            x.classList.toggle('on', x === b);
          });
          vtypes[j] = b.dataset.t;
          invalidate();
        });
      });
    });
  }

  /* ===================== 求解 ===================== */
  function currentProblem() {
    /* 类型数组和变量数必须先对齐再取问题：新增变量后选择器是延时渲染的，
       万一调用方抢在渲染前就求解，vtypes 可能还是空数组 —— 那会被当成
       「没有一个整数变量」，四种方法全判不可用。这里兜一道，默认按「整数」算。 */
    syncVtypes();
    var p = panel.getProblem();
    p.vtypes = vtypes.slice(0, p.c.length);
    return p;
  }

  function solve() {
    var prob = currentProblem();
    if (prob.c.length < 1) { banner('还没有决策变量，先点「+ 变量」搭一道整数规划。'); return; }
    if (!prob.constraints.length) { banner('还没有约束条件，先点「+ 约束」加一条。'); return; }

    var r;
    try {
      r = ipSolve(prob, { maxNodes: 300 });
    } catch (e) {
      banner('这道题算不了：' + e.message);
      return;
    }
    if (!r.ok) { banner(r.message); return; }
    banner('');
    last = r;
    render(prob, r);
    savedProblems.record();
  }

  /* ===================== 启动 ===================== */
  panel.init();
  syncVtypes();
  $('ipSolveBtn').addEventListener('click', solve);
  renderTypes();
  var savedProblems = require('./draft.js').attachLinear({
    key: 'ip', mount: 'ipPanel', panel: panel, maxN: 8, watch: ['ipTypes'],
    readExtra: function (p) { syncVtypes(); p.vtypes = vtypes.slice(); }
  });
  /* 供回归脚本与截图脚本使用：变量增删后类型选择器是延时渲染的，
     脚本没法等，所以把重绘入口挂出来让它们同步触发（真人手点用不到）。 */
  window.__ipRenderTypes = renderTypes;
})();

/* 本模块没有对外接口：require 一次即完成整数规划界面初始化（副作用模块）。 */
module.exports = {};
