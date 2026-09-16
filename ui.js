/* =========================================================================
   界面逻辑：输入表 ↔ 状态 ↔ 渲染迭代过程
   ========================================================================= */
(function () {
  'use strict';

  var MAXN = 6, MAXM = 8;

  /* 默认打开即为空状态：0 个决策变量、0 个约束，题目全部由用户自己搭建 */
  var state = { dir: 'max', n: 0, m: 0, c: [], cons: [] };

  /* ---------------- 工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function fmtIn(v) {
    if (v === undefined || v === null || isNaN(v)) return '0';
    return (Math.abs(v - Math.round(v)) < 1e-9) ? String(Math.round(v)) : String(v);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 表格横向溢出时给一句提示：手机上看不见滚动条，不说一声用户不知道右边还有内容。
     只在真的溢出（scrollWidth > clientWidth）时才插入，且不重复插入。 */
  function addScrollHints(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.scroll'), function (box) {
      if (box.scrollWidth <= box.clientWidth + 1) return;
      var next = box.nextElementSibling;
      if (next && next.className === 'scroll-hint') return;
      var hint = document.createElement('div');
      hint.className = 'scroll-hint';
      hint.textContent = '← 左右滑动查看完整表格 →';
      box.parentNode.insertBefore(hint, box.nextSibling);
      box.addEventListener('scroll', function () {
        hint.classList.toggle('hide', box.scrollLeft > 6);
      }, { passive: true });
    });
  }

  /* ---------------- 渲染输入表 ---------------- */
  function renderInput() {
    var n = state.n, m = state.m, html = '';
    /* 完全没有变量也没有约束时不渲染表头，否则会留下一个孤零零的 "b" 悬在中间 */
    if (n > 0 || m > 0) {
      html += '<thead><tr><th></th>';
      for (var j = 0; j < n; j++) html += '<th class="var">x' + (j + 1) + '</th>';
      if (m > 0) {
        html += '<th></th><th class="rhs">b</th><th></th>';
      } else {
        /* 没有约束行时，关系符 / b / 删除 这三列不存在，表头留空占位以保持列数一致 */
        html += '<th colspan="3"></th>';
      }
      html += '</tr></thead>';
    }
    html += '<tbody>';

    /* 目标函数行 */
    html += '<tr><td class="lbl">z =</td>';
    for (var j2 = 0; j2 < n; j2++) {
      html += '<td><input class="num" type="text" inputmode="decimal" '
        + 'data-k="c" data-j="' + j2 + '" value="' + esc(fmtIn(state.c[j2])) + '"></td>';
    }
    if (n === 0) {
      html += '<td colspan="3" class="empty-tip">还没有变量，点下方「+ 变量」添加</td>';
    } else {
      html += '<td></td><td></td><td></td>';
    }
    html += '</tr>';

    /* 约束行 */
    if (m === 0) {
      html += '<tr><td class="lbl">&mdash;</td><td colspan="' + (n + 3)
        + '" class="empty-tip">没有约束条件，点下方「+ 约束」添加</td></tr>';
    }
    for (var i = 0; i < m; i++) {
      var k = state.cons[i];
      html += '<tr><td class="lbl">' + (i + 1) + '</td>';
      for (var j3 = 0; j3 < n; j3++) {
        html += '<td><input class="num" type="text" inputmode="decimal" '
          + 'data-k="a" data-i="' + i + '" data-j="' + j3 + '" value="' + esc(fmtIn(k.coef[j3])) + '"></td>';
      }
      html += '<td><select class="rel" data-i="' + i + '">'
        + ['<=', '>=', '='].map(function (r) {
          return '<option value="' + r + '"' + (k.rel === r ? ' selected' : '') + '>' + r + '</option>';
        }).join('')
        + '</select></td>';
      html += '<td><input class="num" type="text" inputmode="decimal" '
        + 'data-k="b" data-i="' + i + '" value="' + esc(fmtIn(k.rhs)) + '"></td>';
      html += '<td><button type="button" class="delvar" data-i="' + i + '">&times;</button></td>';
      html += '</tr>';
    }
    html += '</tbody>';
    $('inTbl').innerHTML = html;
    bindInputs();
    $('delVar').disabled = (state.n < 1);
    $('delCon').disabled = (state.m < 1);
    $('addVar').disabled = (state.n >= MAXN);
    $('addCon').disabled = (state.m >= MAXM);
    addScrollHints(document);
  }

  function bindInputs() {
    var t = $('inTbl');
    Array.prototype.forEach.call(t.querySelectorAll('input.num'), function (inp) {
      inp.addEventListener('input', function () {
        var v = parseFloat(inp.value.replace(/[^0-9.\-]/g, ''));
        if (isNaN(v)) v = 0;
        var k = inp.dataset.k;
        if (k === 'c') state.c[+inp.dataset.j] = v;
        else if (k === 'a') state.cons[+inp.dataset.i].coef[+inp.dataset.j] = v;
        else if (k === 'b') state.cons[+inp.dataset.i].rhs = v;
        markStale();
      });
    });
    Array.prototype.forEach.call(t.querySelectorAll('select.rel'), function (sel) {
      sel.addEventListener('change', function () {
        state.cons[+sel.dataset.i].rel = sel.value;
        markStale();
      });
    });
    Array.prototype.forEach.call(t.querySelectorAll('button.delvar'), function (b) {
      b.addEventListener('click', function () {
        if (state.m < 1) return;
        state.cons.splice(+b.dataset.i, 1);
        state.m--;
        renderInput();
      });
    });
  }

  /* ---------------- 变量数 / 约束数（下限放宽到 0） ---------------- */
  function setN(n) {
    n = Math.max(0, Math.min(MAXN, n));
    if (n === state.n) return;
    var j;
    while (state.c.length < n) state.c.push(0);
    state.c.length = n;
    for (var i = 0; i < state.cons.length; i++) {
      while (state.cons[i].coef.length < n) state.cons[i].coef.push(0);
      state.cons[i].coef.length = n;
    }
    state.n = n;
    renderInput();
  }
  function setM(m) {
    m = Math.max(0, Math.min(MAXM, m));
    if (m === state.m) return;
    while (state.cons.length < m) {
      var coef = [];
      for (var j = 0; j < state.n; j++) coef.push(0);
      state.cons.push({ coef: coef, rel: '<=', rhs: 0 });
    }
    state.cons.length = m;
    state.m = m;
    renderInput();
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
    var prob = {
      direction: state.dir,
      c: state.c.slice(0, state.n),
      constraints: state.cons.slice(0, state.m).map(function (k) {
        return { coef: k.coef.slice(0, state.n), rel: k.rel, rhs: k.rhs };
      })
    };
    var res = simplexSolve(prob);
    renderResult(res, prob);
  }

  /* ---------------- 事件绑定 ---------------- */
  Array.prototype.forEach.call($('dirSeg').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      state.dir = b.dataset.dir;
      Array.prototype.forEach.call($('dirSeg').querySelectorAll('button'), function (x) {
        x.classList.toggle('on', x === b);
      });
    });
  });
  $('addVar').addEventListener('click', function () { setN(state.n + 1); });
  $('delVar').addEventListener('click', function () { setN(state.n - 1); });
  $('addCon').addEventListener('click', function () { setM(state.m + 1); });
  $('delCon').addEventListener('click', function () { setM(state.m - 1); });
  $('solveBtn').addEventListener('click', doSolve);

  /* ---------------- 启动 ---------------- */
  /* 打开即是空状态（0 变量 0 约束），用户点「+ 变量」「+ 约束」自行搭建题目 */
  renderInput();
})();
