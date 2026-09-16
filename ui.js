/* =========================================================================
   界面逻辑：输入表 ↔ 状态 ↔ 渲染迭代过程
   ========================================================================= */
(function () {
  'use strict';

  /* 默认打开即为空状态：0 个决策变量、0 个约束，题目全部由用户自己搭建。
     输入表逻辑抽在 input-panel.js，单纯形法与灵敏度分析两个模块共用一份实现。 */
  var panel = createInputPanel({
    tbl: 'inTbl', dirSeg: 'dirSeg',
    addVar: 'addVar', delVar: 'delVar', addCon: 'addCon', delCon: 'delCon',
    maxN: 6, maxM: 8,
    state: { dir: 'max', n: 0, m: 0, c: [], cons: [] },
    onChange: function () { markStale(); }
  });
  var state = panel.state;

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

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
      banners.innerHTML = '<div class="banner err"><b>输入有误</b>：' + esc(res.message) + '</div>';
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }

    var html = '';
    var legend = '<span class="nb">x = 决策变量</span>　<span class="nb">s = 松弛 / 剩余变量</span>　'
      + '<span class="nb">a = 人工变量</span>　·　<span class="nb">σ 行末列为 −z</span>';
    if (res.swapped) legend += '　·　<span class="nb">min 问题已取负转为 max，z 已还原</span>';
    html += '<div class="banner">' + legend + '</div>';

    html += standardCard(prob, res);
    html += graphCard(prob, res);

    html += '<h2 class="sec">迭代过程（共 ' + (res.steps.length - 1) + ' 次迭代）</h2>';
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

    html += '<h2 class="sec">结论</h2>';
    html += verdict(res);
    html += dualCard(res, prob);
    html += sensCard(res);

    box.innerHTML = html;
    box.classList.add('show');
    addScrollHints(box);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function verdict(res) {
    if (res.status === 'optimal') {
      var sols = res.solution.map(function (v, j) {
        return 'x' + (j + 1) + ' = <span class="v">' + fmtNum(v) + '</span>';
      }).join('　　');
      if (res.solution.length === 0) {
        sols = '<span class="muted">本题没有决策变量</span>';
      }
      var extra = '<div class="vsum">';
      extra += '非基变量取 0。';
      if (res.altOptimal.length) {
        var names = res.vars.map(function (v) { return v.name; });
        extra += '<br>注意：非基变量 ' + res.altOptimal.map(function (i) { return names[i]; }).join('、')
          + ' 的检验数为 0，说明本题存在<b>多重最优解</b>（还有别的方案达到同样最优值）。';
      }
      if (res.swapped) extra += '<br>原问题为 min 型，已按 max 求解后还原目标值。';
      extra += '</div>';
      return '<div class="verdict opt">'
        + '<div class="vtitle">最优解</div>'
        + '<div class="sol">' + sols + '</div>'
        + '<div class="sol">z = <span class="zv">' + fmtNum(res.objective) + '</span></div>'
        + extra + '</div>';
    }
    if (res.status === 'infeasible') {
      return '<div class="verdict no">'
        + '<div class="vtitle">无可行解</div>'
        + '<div class="vsum">迭代结束时人工变量仍然留在基中并取正值，说明约束条件之间互相矛盾，'
        + '不存在能同时满足全部约束的非负解。</div></div>';
    }
    if (res.status === 'unbounded') {
      return '<div class="verdict unb">'
        + '<div class="vtitle">无界解</div>'
        + '<div class="vsum">入基变量的列中没有正的系数，它可以在满足约束的前提下无限增大，'
        + '目标函数值也随之无限增大（或减小），因此最优解不存在。</div></div>';
    }
    return '<div class="verdict no">'
      + '<div class="vtitle">未能在限定步数内收敛</div>'
      + '<div class="vsum">可能存在退化导致的循环，请检查题目数据。</div></div>';
  }

  /* 对偶解（影子价格）：y = c_B·B⁻¹，由算法层算出 */
  function dualCard(res, prob) {
    if (res.status !== 'optimal' || !res.dual || !res.dual.length) return '';
    var items = res.dual.map(function (v, i) {
      return '<span>y' + (i + 1) + ' = <span class="dv">' + fmtNum(v) + '</span></span>';
    }).join('');
    var loose = [];
    for (var i = 0; i < res.dual.length; i++) {
      if (Math.abs(res.dual[i]) < 1e-9) loose.push(i + 1);
    }
    return '<div class="card"><div class="iter-head"><span class="name">对偶解（影子价格）</span></div>'
      + '<div class="dlist">' + items + '</div>'
      + '<div class="explain">yᵢ 表示第 i 个约束的右端项每增加 1 个单位时，最优目标值 z 会变化多少'
      + '（在最优基不变的前提下）。'
      + (loose.length
          ? '其中第 ' + loose.join('、') + ' 个约束的影子价格为 0 —— '
            + (loose.length > 1 ? '它们' : '它') + '还有余量、没被用尽，放宽也不会改变最优值。'
          : '这里全是紧约束：每条约束都被用尽了，放宽任何一条都会改变最优值。')
      + '</div></div>';
  }

  /* 灵敏度分析：保持当前最优基不变时，c 与 b 的允许变化范围。
     算法层已经把区间算好（见 simplex-core.js 的 sensitivityAnalysis），
     这里只负责把区间写成教材里那种不等式。 */
  function sensCard(res) {
    var s = res.sensitivity;
    if (!s || (!s.c.length && !s.b.length)) return '';

    /* 把区间写成「3/2 ≤ c1 ≤ 5」「c1 ≥ 3/2」这种形式 */
    function rng(lo, hi, name) {
      var noLo = (lo === -Infinity), noHi = (hi === Infinity);
      if (noLo && noHi) return '<span class="free">可任意取值</span>';
      if (noLo) return name + ' ≤ <b>' + fmtNum(hi) + '</b>';
      if (noHi) return name + ' ≥ <b>' + fmtNum(lo) + '</b>';
      if (Math.abs(hi - lo) < 1e-9) return name + ' = <b>' + fmtNum(lo) + '</b>';
      return '<b>' + fmtNum(lo) + '</b> ≤ ' + name + ' ≤ <b>' + fmtNum(hi) + '</b>';
    }

    var pinned = 0;
    var h = '<h2 class="sec">灵敏度分析</h2><div class="card">';
    h += '<div class="sens-note">保持当前最优基不变时，各系数允许的变化范围。</div>';

    if (s.c.length) {
      h += '<div class="sens-h">目标函数系数 c</div>';
      h += '<div class="scroll"><table class="sens"><tbody>';
      s.c.forEach(function (e) {
        var nm = 'c' + (e.j + 1);
        var eff;
        if (!e.basic || Math.abs(e.slope) < 1e-9) {
          eff = '不改变 z*';
        } else {
          eff = '每 +1 → z* ' + (e.slope > 0 ? '+' : '−') + fmtNum(Math.abs(e.slope));
        }
        h += '<tr>'
          + '<td class="nm">x' + (e.j + 1) + '<span class="btag' + (e.basic ? ' on' : '') + '">'
          + (e.basic ? '基' : '非基') + '</span></td>'
          + '<td class="cur">' + fmtNum(e.current) + '</td>'
          + '<td class="rng">' + rng(e.lo, e.hi, nm) + '</td>'
          + '<td class="eff">' + eff + '</td>'
          + '</tr>';
      });
      h += '</tbody></table></div>';
      h += '<div class="sens-note">基变量的 c 每增加 1，最优值就变化 x 的取值；'
        + '非基变量仍取 0，所以改它的 c 在这段范围内不影响最优值。</div>';
    }

    if (s.b.length) {
      h += '<div class="sens-h">右端项 b</div>';
      h += '<div class="scroll"><table class="sens"><tbody>';
      s.b.forEach(function (e) {
        var nm = 'b' + (e.i + 1);
        if (e.pinned) pinned++;
        h += '<tr>'
          + '<td class="nm">约束 ' + (e.i + 1) + '</td>'
          + '<td class="cur">' + fmtNum(e.current) + '</td>'
          + '<td class="rng">' + rng(e.lo, e.hi, nm) + '</td>'
          + '<td class="eff">y = ' + fmtNum(e.shadow) + '</td>'
          + '</tr>';
      });
      h += '</tbody></table></div>';
      h += '<div class="sens-note">区间内影子价格 y 保持有效：b 每增加 1，最优值变化 y。</div>';
    }

    if (s.degenerate) {
      h += '<div class="sens-warn">本题最优基里含取值为 0 的人工变量（退化情形），'
        + '允许区间不唯一，下表给出的是「当前这个基」能保持的范围。';
      if (pinned) h += '写成「= 某值」的表示该系数一动，最优基就会改变。';
      h += '</div>';
    }

    h += '</div>';
    return h;
  }

  /* 关系符显示成数学符号 */
  function relSym(rel) {
    return rel === '<=' ? '≤' : (rel === '>=' ? '≥' : '=');
  }

  /* 把 Σ c_j·name_j 渲染成可读表达式：系数 1 省略，系数 0 默认跳过 */
  function linExpr(coeffs, names, keepZero) {
    var out = '';
    for (var j = 0; j < coeffs.length; j++) {
      var c = coeffs[j];
      if (Math.abs(c) < 1e-12 && !keepZero) continue;
      var a = Math.abs(c);
      var cs = (Math.abs(a - 1) < 1e-12) ? '' : fmtNum(a);
      var term = cs + names[j];
      if (!out) out = (c < 0 ? '-' : '') + term;
      else out += (c < 0 ? ' - ' : ' + ') + term;
    }
    return out || '0';
  }

  /* 标准化卡片：把「原问题 → 标准型」的变换摊开给学生看。
     原问题用用户输入的形式；标准型取自算法第一张表（即标准化后的约束矩阵）。 */
  function standardCard(prob, res) {
    var names = res.vars.map(function (v) { return v.name; });
    var kinds = res.vars.map(function (v) { return v.kind; });
    var N = names.length;
    var n = prob.c.length;
    var xNames = names.slice(0, n);
    var cons = prob.constraints || [];
    var init = res.steps[0];
    var pad = '       ';

    /* ---- ① 原问题 ---- */
    var orig = ['<div class="std-line">' + prob.direction + ' z = ' + linExpr(prob.c, xNames) + '</div>'];
    cons.forEach(function (k, i) {
      orig.push('<div class="std-line">' + (i === 0 ? 's.t.  ' : pad)
        + linExpr(k.coef, xNames) + ' ' + relSym(k.rel) + ' ' + fmtNum(k.rhs) + '</div>');
    });
    orig.push('<div class="std-line">' + (cons.length ? pad : 's.t.  ') + xNames.join(', ') + ' ≥ 0</div>');

    /* ---- ② 标准型的目标函数（人工变量带 M，松弛变量系数为 0） ----
       显示顺序按「决策变量 → 松弛/剩余 → 人工变量」分组，否则 s 和 a 交织会很乱 */
    var order = [];
    ['x', 's', 'a'].forEach(function (kind) {
      kinds.forEach(function (k, i) { if (k === kind) order.push(i); });
    });
    var zStr = '';
    order.forEach(function (j) {
      var c, isM = false;
      if (kinds[j] === 'a') { isM = true; c = 0; }
      else if (kinds[j] === 'x') { c = res.swapped ? -prob.c[j] : prob.c[j]; }
      else { c = 0; }
      var abs = Math.abs(c);
      var cs = isM ? 'M' : (abs < 1e-12 ? '0' : (Math.abs(abs - 1) < 1e-12 ? '' : fmtNum(abs)));
      var neg = isM ? true : (c < 0);
      var term = cs + names[j];
      if (!zStr) zStr = (neg ? '-' : '') + term;
      else zStr += (neg ? ' - ' : ' + ') + term;
    });
    if (!zStr) zStr = '0';

    /* ---- ② 标准型的约束（等式形式） ---- */
    var std = ['<div class="std-line">max z' + (res.swapped ? "'" : '') + ' = ' + zStr + '</div>'];
    for (var i2 = 0; i2 < res.mConstraints; i2++) {
      var row = init.rows[i2];
      std.push('<div class="std-line">' + (i2 === 0 ? 's.t.  ' : pad)
        + linExpr(row.slice(0, N), names) + ' = ' + fmtNum(row[N]) + '</div>');
    }
    std.push('<div class="std-line">' + (res.mConstraints ? pad : 's.t.  ') + names.join(', ') + ' ≥ 0</div>');

    /* ---- 变换说明 ---- */
    var notes = [];
    if (res.swapped) {
      notes.push('原问题是 <b>min</b> 型，先把目标函数整体取负转成 max 型（记 z′ = −z），结果再还原回 z。');
    }
    if (kinds.indexOf('s') >= 0) {
      notes.push('不等式约束通过加减<b>松弛 / 剩余变量</b> s 化成等式：≤ 加 s，≥ 减 s。s 在目标函数里系数为 0。');
    }
    if (kinds.indexOf('a') >= 0) {
      notes.push('出现人工变量 a：≥ 约束减去剩余变量后要再补一个 a，= 约束直接补 a，'
        + '目的是凑出初始单位基。a 在目标函数里带 <b>−M</b>（M 是形式上无穷大的正数），逼它退到 0。');
    }
    if (cons.some(function (k) { return k.rhs < 0; })) {
      notes.push('有约束的右端项为负，已整行取负并翻转关系符，使右端项非负。');
    }

    return '<h2 class="sec">标准化</h2>'
      + '<div class="card stdcard">'
      + '<div class="std-h">① 原问题</div>'
      + orig.join('')
      + '<div class="std-arrow">↓ 引入松弛 / 剩余 / 人工变量，化为等式</div>'
      + '<div class="std-h">② 标准型</div>'
      + std.join('')
      + (notes.length ? '<div class="std-note">' + notes.join('<br>') + '</div>' : '')
      + '</div>';
  }

  /* 图解法：仅当决策变量恰好 2 个、且不是无可行解时才画 */
  function graphCard(prob, res) {
    if (typeof renderGraph !== 'function') return '';
    var g = null;
    try { g = renderGraph(prob, res); } catch (e) { g = null; }
    if (!g) return '';
    return '<h2 class="sec">图解法</h2>'
      + '<div class="card"><div class="graph">' + g.svg + '</div>'
      + '<div class="explain">' + g.caption + '</div></div>';
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

  /* 迭代表与讲解的渲染给灵敏度分析模块复用 —— 两个模块的表格长得一模一样，
     没有理由各写一份。 */
  window.renderTable = renderTable;
  window.explain = explain;
})();
