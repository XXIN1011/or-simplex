/* =========================================================================
   界面逻辑：输入表 ↔ 状态 ↔ 渲染迭代过程
   ========================================================================= */
(function () {
  'use strict';

  var MAXN = 6, MAXM = 8;

  var DEMOS = [
    { name: 'max z = 2x1 + 3x2', dir: 'max', c: [2, 3], cons: [
      { coef: [1, 2], rel: '<=', rhs: 8 },
      { coef: [4, 0], rel: '<=', rhs: 16 },
      { coef: [0, 4], rel: '<=', rhs: 12 }] },
    { name: 'min z = 2x1 + 3x2（≥ 约束）', dir: 'min', c: [2, 3], cons: [
      { coef: [1, 1], rel: '>=', rhs: 3 },
      { coef: [1, 2], rel: '>=', rhs: 4 }] },
    { name: 'min z = 4x1 + x2（含等式）', dir: 'min', c: [4, 1], cons: [
      { coef: [3, 1], rel: '=', rhs: 3 },
      { coef: [4, 3], rel: '>=', rhs: 6 },
      { coef: [1, 2], rel: '<=', rhs: 4 }] },
    { name: '无界解示例', dir: 'max', c: [1, 0], cons: [
      { coef: [-1, 1], rel: '<=', rhs: 0 },
      { coef: [0, 1], rel: '<=', rhs: 3 }] },
    { name: '无可行解示例', dir: 'max', c: [1, 0], cons: [
      { coef: [1, 0], rel: '>=', rhs: 5 },
      { coef: [1, 0], rel: '<=', rhs: 2 }] }
  ];

  var state = { dir: 'max', n: 2, m: 2, c: [2, 3], cons: [] };

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

  /* ---------------- 载入数据 ---------------- */
  function loadDemo(i) {
    var d = DEMOS[i];
    state.dir = d.dir;
    state.n = d.c.length;
    state.m = d.cons.length;
    state.c = d.c.slice();
    state.cons = d.cons.map(function (k) {
      return { coef: k.coef.slice(), rel: k.rel, rhs: k.rhs };
    });
    /* max/min 分段按钮必须跟着例题同步，否则界面显示与实际方向不符 */
    Array.prototype.forEach.call($('dirSeg').querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.dir === state.dir);
    });
    markDemoSelected(i);
    renderInput();
  }

  /* 在下拉菜单里标记当前选中的例题。
     按钮文字固定为「经典例题」，不再被例题名替换 —— 否则按钮看起来像标签，
     且每次点击都直接跳到下一个例题，容易把已输入的内容冲掉。 */
  function markDemoSelected(i) {
    var items = $('demoMenu').querySelectorAll('button[data-i]');
    Array.prototype.forEach.call(items, function (el) {
      el.classList.toggle('on', +el.dataset.i === i);
    });
  }

  /* ---------------- 渲染输入表 ---------------- */
  function renderInput() {
    var n = state.n, m = state.m, html = '';
    html += '<thead><tr><th></th>';
    for (var j = 0; j < n; j++) html += '<th class="var">x' + (j + 1) + '</th>';
    html += '<th></th><th class="rhs">b</th><th></th></tr></thead><tbody>';

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

    box.innerHTML = html;
    box.classList.add('show');
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
      extra += '非基变量取 0。最优值 <b>z = ' + fmtNum(res.objective) + '</b>。';
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

  /* 例题选择：改成下拉列表。
     点按钮只展开/收起列表，只有真正选中某一项才会载入，
     不会再像以前那样"点一下就跳到下一个例题、把当前输入冲掉"。 */
  var demoMenu = $('demoMenu');
  demoMenu.innerHTML = DEMOS.map(function (d, i) {
    return '<button type="button" data-i="' + i + '">' + esc(d.name) + '</button>';
  }).join('');

  function closeDemoMenu() {
    demoMenu.classList.remove('open');
    $('demoBtn').classList.remove('open');
  }
  $('demoBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    var open = demoMenu.classList.toggle('open');
    $('demoBtn').classList.toggle('open', open);
  });
  demoMenu.addEventListener('click', function (e) {
    e.stopPropagation();
    var btn = e.target.closest ? e.target.closest('button[data-i]') : null;
    if (!btn) return;
    loadDemo(+btn.dataset.i);
    closeDemoMenu();
    doSolve();
  });
  document.addEventListener('click', closeDemoMenu);

  /* ---------------- 启动 ---------------- */
  loadDemo(0);
})();
