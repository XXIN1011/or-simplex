/* =========================================================================
   迭代表 + 迭代讲解的渲染
   -------------------------------------------------------------------------
   单纯形法界面（ui.js）、灵敏度分析界面（sens-ui.js）、整数规划界面（ip-ui.js）
   都要把「一张迭代表 + 一段讲解」印出来，形状完全一样，没有理由各写一份。
   本模块是纯函数：吃 core 层给出的结果对象，吐 HTML 字符串，不碰任何全局。
   （原先这两个函数定义在 ui.js 里，靠两个全局挂载给另外两个界面用；
     现在改为标准 require，跨模块的全局挂载已全部删除。）
   ========================================================================= */
'use strict';

var format = require('../core/format.js');
var fmtNum = format.fmtNum;
var fmtPair = format.fmtPair;

  /* ---------------- 迭代表渲染 ---------------- */
  function renderTable(res, step) {
    var names = res.vars.map(function (v) { return v.name; });
    var N = names.length;
    var leaveCol = (step.leaving === null || step.leaving === undefined) ? -1 : step.basis[step.leaving];
    var h = '<thead><tr><th>基</th>';
    for (var j = 0; j < N; j++) {
      var thc = [];
      if (step.entering === j) thc.push('enter');
      if (leaveCol === j) thc.push('leave');
      h += '<th class="' + thc.join(' ') + '">' + names[j] + '</th>';
    }
    h += '<th class="bcol">b</th></tr></thead><tbody>';

    for (var i = 0; i < res.mConstraints; i++) {
      h += '<tr><td class="rowlbl base">' + names[step.basis[i]] + '</td>';
      for (var j2 = 0; j2 < N; j2++) {
        var cls = [];
        if (step.entering === j2) cls.push('enter');
        if (step.leaving === i) cls.push('leave');
        if (step.leaving === i && step.entering === j2) cls.push('pivot');
        h += '<td class="cell ' + cls.join(' ') + '">' + fmtNum(step.rows[i][j2]) + '</td>';
      }
      h += '<td class="bcol">' + fmtNum(step.rows[i][N]) + '</td></tr>';
    }

    h += '<tr class="objrow"><td class="rowlbl">σ</td>';
    for (var j3 = 0; j3 < N; j3++) {
      h += '<td class="cell ' + (step.entering === j3 ? 'enter' : '') + '">'
        + fmtPair(step.obj[j3]) + '</td>';
    }
    h += '<td class="bcol">' + fmtPair(step.obj[N]) + '</td></tr>';

    return '<div class="scroll"><table class="tb">' + h + '</tbody></table></div>';
  }

  function explain(res, step) {
    if (step.note) return '<div class="explain">' + step.note + '</div>';
    var names = res.vars.map(function (v) { return v.name; });
    var eName = names[step.entering];
    var lName = names[step.basis[step.leaving]];
    var sig = fmtPair(step.obj[step.entering]);

    var ratios = step.ratios.map(function (r) {
      if (!r.ok) return '第 ' + (r.row + 1) + ' 行系数 ≤ 0，不参与比值';
      return '<span class="row">θ' + (r.row + 1) + ' = ' + fmtNum(step.rows[r.row][names.length])
        + ' ÷ ' + fmtNum(step.rows[r.row][step.entering]) + ' = <b>' + fmtNum(r.theta) + '</b></span>';
    }).join('');

    return '<div class="explain">'
      + '<span class="row"><b>① 选入基变量</b>：检验数 <span class="k">σ = ' + sig + '</span>（'
      + eName + ' 列）是当前最大的正检验数，说明增加 ' + eName + ' 能改善目标函数 → '
      + '<span class="k">' + eName + ' 入基</span>。</span>'
      + '<span class="row"><b>② 比值检验</b>（最小比值规则，保证解仍然可行）：</span>'
      + ratios
      + '<span class="row">最小值对应的第 ' + (step.leaving + 1) + ' 行被顶出，故 '
      + '<span class="w">' + lName + ' 出基</span>，即它变为 0。</span>'
      + (step.degenerate
          ? '<span class="row"><b>注意：这一步出现「退化」</b>——最小比值 θ = 0，'
            + '说明被顶出的 ' + lName + ' 本来就取 0，所以这次迭代'
            + '<span class="w">不会改善目标函数值</span>，只是换了一组基。'
            + '退化时若枢轴规则选取不当可能出现循环。</span>'
          : '')
      + '<span class="row"><b>③ 枢轴变换</b>：枢轴元素为 <span class="k">'
      + fmtNum(step.pivot) + '</span>（第 ' + (step.leaving + 1) + ' 行 ' + eName
      + ' 列），对该行做初等行变换使它变成 1、该列其余元素变成 0。</span>'
      + '</div>';
  }

module.exports = {
  renderTable: renderTable,
  explain: explain
};
