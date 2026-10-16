/* =========================================================================
   界面逻辑：输入表 ↔ 状态 ↔ 渲染迭代过程
   ========================================================================= */

var simplex = require('../core/simplex.js');
var simplexSolve = simplex.simplexSolve;

var inputPanel = require('./input-panel.js');
var createInputPanel = inputPanel.createInputPanel;
var addScrollHints = inputPanel.addScrollHints;

var tableRender = require('./table-render.js');
var renderTable = tableRender.renderTable;
var explain = tableRender.explain;

var dom = require('./dom.js');
var $ = dom.$, esc = dom.esc;
var report = require('./simplex-report.js');
var verdict = report.verdict;
var dualCard = report.dualCard;
var sensCard = report.sensCard;
var standardCard = report.standardCard;
var graphCard = report.graphCard;
var resultLayout = require('./result-layout.js');

(function () {
  'use strict';

  /* 默认打开即为空状态：0 个决策变量、0 个约束，题目全部由用户自己搭建。
     输入表逻辑抽在 input-panel.js，单纯形法与灵敏度分析两个模块共用一份实现。 */
  var panel = createInputPanel({
    mount: 'simplexPanel',
    tbl: 'inTbl', dirSeg: 'dirSeg',
    addVar: 'addVar', delVar: 'delVar', addCon: 'addCon', delCon: 'delCon',
    maxN: 6, maxM: 8,
    example: require('./examples.js').linear,
    state: { dir: 'max', n: 0, m: 0, c: [], cons: [] },
    onChange: function () { markStale(); }
  });
  var state = panel.state;

  /* ---------------- 工具（共用实现见 dom.js） ---------------- */

  /* 输入改动后把旧结果标灰，避免"结果与输入不符"的误读 */
  function markStale() {
    var r = $('result');
    if (!r.classList.contains('show') || r.classList.contains('stale')) return;
    r.classList.add('stale');
    $('banners').innerHTML = '<div class="banner">输入已修改，点「求解」重新计算。</div>';
  }

  function renderResult(res, prob) {
    var banners = $('banners');
    var box = $('result');
    banners.innerHTML = '';
    box.classList.remove('stale');

    if (!res.ok) {
      $('mod-simplex').classList.remove('has-result');
      banners.innerHTML = '<div class="banner err"><b>输入有误</b>：' + esc(res.message) + '</div>';
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }

    var html = '<h2 class="sec">结论</h2>' + verdict(res) + dualCard(res, prob);
    html += resultLayout.navigation([['standard','查看标准化'],['iterations','查看迭代过程']]);
    html += sensCard(res);
    html += '<details class="result-work" open><summary>完整推导（可收起）</summary>';
    var legend = '<span class="nb">x = 决策变量</span>　<span class="nb">s = 松弛 / 剩余变量</span>　'
      + '<span class="nb">a = 人工变量</span>　·　<span class="nb">σ 行末列为 −z</span>';
    if (res.swapped) legend += '　·　<span class="nb">min 问题已取负转为 max，z 已还原</span>';
    html += '<div class="banner">' + legend + '</div>';

    html += '<section data-section="standard">' + standardCard(prob, res) + '</section>';
    html += graphCard(prob, res);

    html += '<section data-section="iterations"><h2 class="sec">迭代过程（共 ' + (res.steps.length - 1) + ' 次迭代）</h2>';
    res.steps.forEach(function (step, idx) {
      var title = idx === 0 ? '初始表' : '第 ' + idx + ' 次迭代';
      var isLast = (idx === res.steps.length - 1);
      var tag = '';
      if (isLast && res.status === 'optimal') tag = '<span class="tag done">最优</span>';
      else if (isLast) tag = '<span class="tag stop">终止</span>';
      else tag = '<span class="tag">' + (idx === 0 ? '起点' : '迭代 ' + idx) + '</span>';

      html += '<div class="card">'
        + '<div class="iter-head"><span class="name">' + title + '</span>' + tag + '</div>'
        + renderTable(res, step)
        + explain(res, step)
        + '</div>';
    });

    html += '</section></details>';

    box.innerHTML = html;
    box.classList.add('show');
    $('mod-simplex').classList.add('has-result');
    addScrollHints(box);
    resultLayout.wire(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------- 求解 ---------------- */
  function doSolve() {
    var prob = panel.getProblem();
    var res = simplexSolve(prob);
    renderResult(res, prob);
  }

  /* ---------------- 事件绑定与启动 ---------------- */
  /* 输入表（按钮、max/min 切换、首屏渲染）全部交给共用组件 */
  panel.init();
  $('solveBtn').addEventListener('click', doSolve);

})();

/* 本模块没有对外接口：require 一次即完成界面初始化（事件绑定、首屏渲染）。
   两张表 + 讲解的渲染已抽到 table-render.js。 */
module.exports = {};
