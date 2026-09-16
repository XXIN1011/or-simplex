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
(function () {
  'use strict';

  var TYPE_NAMES = { cont: '连续', int: '整数', bin: '0-1' };
  var MAX_ENUM_POINTS = 4096;      // 隐枚举超过这个点数就不默认全跑
  var MAX_SHOW_ROWS = 300;         // 隐枚举表一次最多铺这么多行，多了折叠

  var panel = createInputPanel({
    tbl: 'ipInTbl', dirSeg: 'ipDirSeg',
    addVar: 'ipAddVar', delVar: 'ipDelVar', addCon: 'ipAddCon', delCon: 'ipDelCon',
    maxN: 8, maxM: 8,
    state: { dir: 'max', n: 0, m: 0, c: [], cons: [] }
  });
  var vtypes = [];                 // 与变量一一对应的类型

  var last = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function subs(k) {
    return String(k).replace(/[0-9]/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[+d]; });
  }
  function num(v) { return fmtNum(v); }
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
          $('ipOut').innerHTML = '';
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
    banner('');
    last = r;
    render(prob, r);
  }

  /* ===================== 输出 ===================== */
  function render(prob, r) {
    var h = '';

    /* ① 松弛问题 */
    h += '<h2 class="sec">松弛问题（先不管整数限制）</h2><div class="card">';
    h += '<div class="sens-note">整数规划的可行域是松弛问题可行域里**那些取整的点**。'
      + '所以第一步总是先把整数限制去掉，解这个普通线性规划 —— 它给出的是'
      + '「界限」（max 问题是最优值的上界），也是后面几种方法的出发点。</div>';
    if (r.noOptimum) {
      var st = r.relax.status === 'infeasible' ? '无可行解' : '无界';
      h += '<div class="verdict no"><div class="vtitle">松弛问题' + st + '</div>'
        + '<div class="vsum">松弛问题的可行域比原问题大，它都' + st + '了，'
        + '原整数规划必然也' + st + '，所以四种方法都无从谈起。</div></div>';
      h += methodListOnly(r);
      $('ipOut').innerHTML = h;
      addScrollHints(document);
      return;
    }
    h += '<div class="verdict opt"><div class="vtitle">松弛问题最优解</div>'
      + '<div class="sol">' + r.relax.solution.map(function (v, j) {
          return 'x' + subs(j + 1) + ' = <span class="v">' + num(v) + '</span>';
        }).join('　　') + '</div>'
      + '<div class="sol">z = <span class="zv">' + num(r.relax.objective) + '</span></div>'
      + '<div class="vsum">' + (r.relaxIntegral
          ? '<b>这个解本身就已经满足所有整数要求</b>，所以它就是整数规划的最优解，'
            + '不必再分枝或割平面。'
          : '解里有非整数分量，不能直接当整数规划的解（直接四舍五入往往既不可行、也不是最优），'
            + '需要用下面的方法求解。') + '</div></div>';
    h += '<details class="help"><summary>展开松弛问题的单纯形法迭代过程</summary>'
      + '<div class="iter-body">' + relaxIterations(r.relax) + '</div></details>';
    h += '</div>';

    /* ② 各方法的适用性一览 */
    h += renderApplicability(prob, r);

    /* ③ 按适用性输出（或按用户勾选输出） */
    h += renderMethods(prob, r);

    $('ipOut').innerHTML = h;
    wireMethodPick(prob, r);
    addScrollHints(document);
  }

  function relaxIterations(res) {
    var shown = res.steps.filter(function (s) { return s.entering !== null; });
    var lastStep = res.steps[res.steps.length - 1];
    var all = shown.concat([lastStep].filter(function (s) { return shown.indexOf(s) < 0; }));
    return all.map(function (step, k) {
      return '<div class="iter-head"><span class="name">第 ' + (k + 1) + ' 张表</span></div>'
        + renderTable(res, step) + explain(res, step);
    }).join('');
  }

  function methodListOnly(r) {
    var h = '<h2 class="sec">四种方法</h2><div class="card">';
    r.methods.forEach(function (m) {
      h += '<div class="judge"><span class="row blk">' + esc(m.name) + '</span>'
        + '<span class="row">' + esc(m.reason || '不适用') + '</span></div>';
    });
    return h + '</div>';
  }

  /* 适用性一览：能用的打勾，不能用的写清理由 */
  function renderApplicability(prob, r) {
    var h = '<h2 class="sec">四种方法在这道题上能不能用</h2><div class="card">';
    h += '<div class="sens-note">不是每种方法对每道题都适用 —— 下面逐个判定，'
      + '<b>不适用的不输出结果</b>（只说清为什么），适用的会把完整过程全部输出。</div>';
    r.methods.forEach(function (m) {
      var ok = m.applicable && !m.tooBig;
      h += '<div class="judge"><span class="row blk">'
        + (ok ? '✓ ' : '✗ ') + esc(m.name) + '</span>';
      if (ok) {
        h += '<span class="row">' + esc(applicableWhy(m, prob, r)) + '</span>';
      } else {
        h += '<span class="row">' + esc(m.reason || '不适用') + '</span>';
      }
      h += '</div>';
    });
    if (needPick(r)) {
      h += '<div class="sens-warn">本题的规模较大：'
        + applicable(r).filter(function (m) { return m.tooBig; })
            .map(function (m) { return m.name + '（' + m.reason + '）'; }).join('；')
        + '。为了避免卡顿，下面**不默认全部输出**，请勾选要看的解法。</div>';
      h += '<div id="ipPick" class="pickbox">'
        + applicable(r).filter(function (m) { return !m.tooBig; }).map(function (m) {
            return '<label class="pick"><input type="checkbox" value="' + m.key + '" checked> '
              + esc(m.name) + '</label>';
          }).join('')
        + '</div>';
    }
    return h + '</div>';
  }

  function applicable(r) { return r.methods.filter(function (m) { return m.applicable; }); }
  function needPick(r) { return r.methods.some(function (m) { return m.tooBig; }); }

  function applicableWhy(m, prob, r) {
    if (m.key === 'graph') return '两个决策变量可以在平面上画出可行域，再把整数格点标出来。';
    if (m.key === 'bnb') return '分枝定界法对任何整数规划都适用（只要求松弛问题有最优解）。';
    if (m.key === 'cut') return '本题是全整数、全 ≤ 约束、数据为整数，符合教材里割平面法要求的标准形式。';
    if (m.key === 'enum') return '本题所有变量都是 0-1 变量，可以按「非 0 即 1」逐点枚举。';
    return '';
  }

  /* ===================== 各方法的详细输出 ===================== */
  function renderMethods(prob, r) {
    var picks = pickedKeys();
    var h = '';
    applicable(r).forEach(function (m) {
      if (m.tooBig) return;                        // 规模过大的：只在上面的提示里说明
      if (picks && picks.indexOf(m.key) < 0) return;
      if (m.key === 'graph') h += viewGraph(prob, r, m);
      else if (m.key === 'bnb') h += viewBnb(prob, r, m);
      else if (m.key === 'cut') h += viewCut(prob, r, m);
      else if (m.key === 'enum') h += viewEnum(prob, r, m);
    });
    if (!h) h = '<h2 class="sec">结果</h2><div class="card"><div class="sens-note">'
      + '没有勾选任何解法。</div></div>';
    return h;
  }
  function pickedKeys() {
    var box = $('ipPick');
    if (!box) return null;                          // 没有勾选框 = 全部输出
    var out = [];
    Array.prototype.forEach.call(box.querySelectorAll('input:checked'), function (i) {
      out.push(i.value);
    });
    return out;
  }
  function wireMethodPick(prob, r) {
    var box = $('ipPick');
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) {
      i.addEventListener('change', function () {
        var keep = box.parentNode;                  // 保住勾选状态，只重画后面的结果
        var checked = pickedKeys();
        var h = '';
        applicable(r).forEach(function (m) {
          if (m.tooBig || checked.indexOf(m.key) < 0) return;
          if (m.key === 'graph') h += viewGraph(prob, r, m);
          else if (m.key === 'bnb') h += viewBnb(prob, r, m);
          else if (m.key === 'cut') h += viewCut(prob, r, m);
          else if (m.key === 'enum') h += viewEnum(prob, r, m);
        });
        var toRemove = [];
        var node = $('ipPick').parentNode.parentNode.nextElementSibling;
        while (node) { toRemove.push(node); node = node.nextElementSibling; }
        toRemove.forEach(function (x) { x.parentNode.removeChild(x); });
        var box2 = document.createElement('div');
        box2.innerHTML = h;
        var anchor = $('ipPick').parentNode.parentNode;
        while (box2.firstChild) anchor.parentNode.insertBefore(box2.firstChild, anchor.nextSibling);
        addScrollHints(document);
      });
    });
  }

  /* ---------------- 图解法 ---------------- */
  function viewGraph(prob, r, m) {
    var h = '<h2 class="sec">图解法</h2><div class="card">';
    var ipBest = ipSolutionOf(r);
    var g = (typeof renderGraph === 'function')
      ? renderGraph(ipWithVarBounds(prob), r.relax, ipBest ? { best: ipBest } : null) : null;
    if (!g) {
      h += '<div class="sens-note">画不出图（需要恰好两个变量、且有可行域）。</div></div>';
      return h;
    }
    h += '<div class="graph">' + g.svg + '</div><div class="explain">' + esc(g.caption) + '</div>';
    h += '<div class="judge">'
      + '<span class="row blk">怎么读这张图</span>'
      + '<span class="row">· 蓝区 = 松弛问题的可行域；灰点 = 蓝区里所有横纵坐标都是整数的点。</span>'
      + '<span class="row">· <b>整数规划的解只能从灰点里挑</b> —— 这就是它与普通线性规划的全部区别。</span>'
      + '<span class="row">· 橙点 = 松弛问题的最优解（等值线平移到蓝区边界时取到）。'
      + '它常常落在边界上、不是灰点。</span>'
      + '<span class="row">· 绿点 = 在灰点里让目标函数最大的那个，就是整数最优解。</span>'
      + '<span class="row">· 橙点和绿点一般不重合 —— 所以「把松弛解四舍五入」是错的：'
      + '四舍五入后的点可能根本不在蓝区里（不可行），也可能不是灰点里最好的（不是最优）。</span>'
      + '</div>';
    if (ipBest) {
      h += resultVerdict(prob, ipBest, ipObjective(prob, ipBest), '图解法');
    }
    return h + '</div>';
  }

  function ipSolutionOf(r) {
    var best = null;
    r.methods.forEach(function (m) {
      if (m.key === 'bnb' && m.best) best = m.best;
      else if (m.key === 'cut' && m.converged && m.integral && !best) best = m.solution;
      else if (m.key === 'enum' && m.best && !best) best = m.best;
    });
    return best;
  }
  function ipObjective(prob, x) {
    var z = 0;
    for (var j = 0; j < prob.c.length; j++) z += prob.c[j] * x[j];
    return z;
  }
  function resultVerdict(prob, x, z, who) {
    return '<div class="verdict opt"><div class="vtitle">最优整数解（' + esc(who) + '）</div>'
      + '<div class="sol">' + x.map(function (v, j) {
          return 'x' + subs(j + 1) + ' = <span class="v">' + num(v) + '</span>';
        }).join('　　') + '</div>'
      + '<div class="sol">z = <span class="zv">' + num(z) + '</span></div></div>';
  }

  /* ---------------- 分枝定界法 ---------------- */
  function viewBnb(prob, r, m) {
    var h = '<h2 class="sec">分枝定界法</h2><div class="card">';
    h += '<div class="sens-note">做法：反复解松弛问题。只要最优解里还有非整数变量，就把它劈成'
      + '「x<sub>j</sub> ≤ ⌊v⌋」与「x<sub>j</sub> ≥ ⌈v⌉」两支分别再解 —— '
      + '这样既不漏掉任何整数解，又能让每支的范围变小。同时手里攥着当前最好的整数解当「界」，'
      + '凡是松弛最优值已经不如它的分支直接剪掉，不必展开。</div>';
    h += '<div class="judge"><span class="row blk">本题的搜索过程</span>'
      + '<span class="row">共展开 <b>' + m.nodes.length + '</b> 个结点，其中'
      + '分枝 ' + m.nodes.filter(function (x) { return x.action === 'branch'; }).length + ' 次、'
      + '剪枝 ' + m.nodes.filter(function (x) { return x.action === 'prune'; }).length + ' 次、'
      + '得到整数解 ' + m.nodes.filter(function (x) { return x.action === 'incumbent'; }).length + ' 次。</span>'
      + (m.complete ? '<span class="row">搜索已完整结束，所以当前最好的整数解就是最优解。</span>'
                    : '<span class="row"><b>注意：结点数达到上限（' + m.maxNodes
                      + '）提前中止，下面给出的是「目前找到的最好整数解」，不能保证是全局最优。</b></span>')
      + '</div>';

    var many = m.nodes.length > 25;
    if (many) {
      h += '<details class="help"><summary>展开全部 ' + m.nodes.length + ' 个结点（默认折叠：结点较多）</summary>';
    }
    m.nodes.forEach(function (nd) {
      h += '<div class="judge"><span class="row blk">结点 ' + nd.id
        + (nd.parent ? '（由结点 ' + nd.parent + ' 分出）' : '（根结点）')
        + '　深度 ' + nd.depth + '</span>';
      h += '<span class="row">· 附加约束：'
        + (nd.bounds.length
            ? nd.bounds.map(function (b) {
                return 'x' + subs(b.j + 1) + ' ' + (b.rel === '<=' ? '≤' : '≥') + ' ' + num(b.val);
              }).join('，')
            : '无（就是原问题）') + '</span>';
      if (nd.res.status === 'optimal') {
        h += '<span class="row">· 松弛解：' + nd.solution.map(function (v, j) {
            var t = prob.vtypes[j], isInt = ipIsInt(v);
            var tag = (t !== 'cont' && !isInt) ? '<b>' + num(v) + '</b>' : num(v);
            return 'x' + subs(j + 1) + ' = ' + tag;
          }).join('　') + '　　z = <b>' + num(nd.objective) + '</b>'
          + (nd.action === 'branch' ? '（加粗的是非整数分量，就是它要分枝）' : '') + '</span>';
      } else {
        h += '<span class="row">· 松弛问题' + (nd.res.status === 'infeasible' ? '无可行解' : '无界') + '</span>';
      }
      h += '<span class="row">· <b>' + esc(nd.actionName) + '</b>：' + esc(nd.note) + '</span>';
      h += '</div>';
      /* 每个结点的单纯形迭代也留着，需要时展开 */
      h += '<details class="help"><summary>结点 ' + nd.id + ' 的单纯形法迭代</summary>'
        + '<div class="iter-body">' + relaxIterations(nd.res) + '</div></details>';
    });
    if (many) h += '</details>';

    if (m.best) {
      h += resultVerdict(prob, m.best, m.bestZ, m.complete ? '分枝定界法' : '分枝定界法·未跑完');
    } else {
      h += '<div class="verdict no"><div class="vtitle">无可行整数解</div>'
        + '<div class="vsum">所有分支都被剪掉了，说明这道整数规划没有可行解。</div></div>';
    }
    return h + '</div>';
  }

  /* ---------------- 割平面法 ---------------- */
  function viewCut(prob, r, m) {
    var h = '<h2 class="sec">割平面法</h2><div class="card">';
    h += '<div class="sens-note">做法：先解松弛问题得到最优表。如果某个基变量取的是分数，'
      + '就<b>直接从那一行</b>读出一条新的约束（割）加进模型 —— 这条约束把当前这个分数解割掉，'
      + '但任何一个整数可行解都仍然满足它。加完之后右端项变成负的，用<b>对偶单纯形法</b>重新求最优。'
      + '反复做，直到最优解全部取整。</div>';
    h += '<div class="judge"><span class="row blk">割是怎么从一行读出来的</span>'
      + '<span class="row">把第 r 行写成 x<sub>Br</sub> = b̄<sub>r</sub> − Σ ā<sub>rj</sub>x<sub>j</sub>'
      + '（求和只对非基变量）。两边取小数部分 f(·)，因为 x<sub>Br</sub> 与非基变量都要求取整，可得：</span>'
      + '<span class="row"><b>Σ f(ā<sub>rj</sub>)·x<sub>j</sub> ≥ f(b̄<sub>r</sub>)</b>　—— 这就是 Gomory 割。</span>'
      + '<span class="row">写成等式并整行取负（好让新剩余变量直接当基变量）：'
      + '−Σ f(ā<sub>rj</sub>)x<sub>j</sub> + s = −f(b̄<sub>r</sub>)。</span></div>';

    if (!m.cuts.length) {
      h += '<div class="judge"><span class="row">松弛问题的解已经是整数解，一刀都不用割。</span></div>';
    }
    m.cuts.forEach(function (c) {
      h += '<div class="sens-h">第 ' + c.round + ' 刀</div><div class="judge">';
      h += '<span class="row">· ' + esc(c.text) + '</span>';
      h += '<span class="row">· 小数部分：f(b̄) = ' + num(ipFrac(c.value)) + '，'
        + '于是割为 Σ f(ā)·x<sub>j</sub> ≥ ' + num(ipFrac(c.value)) + '</span>';
      var parts = [];
      for (var j = 0; j < prob.c.length; j++) {
        var co = -c.cutCoef[j];          // cutCoef 存的是取负后的系数
        if (Math.abs(co) < 1e-9) continue;
        parts.push(num(co) + '·x' + subs(j + 1));
      }
      h += '<span class="row">· 展开：' + (parts.length ? parts.join(' + ') : '0')
        + ' ≥ ' + num(ipFrac(c.value))
        + '　→　加入剩余变量 ' + esc(c.newVarName) + ' 后整行取负，'
        + '右端项变成 ' + num(c.rhs) + '（负的）</span>';
      h += '<span class="row">· 右端项为负说明原基不再可行，但检验数仍全 ≤ 0，'
        + '正好用对偶单纯形法，共 ' + c.dualSteps.length + ' 步：</span>';
      c.dualSteps.forEach(function (s, k) {
        h += '<span class="row">　第 ' + (k + 1) + ' 步：' + esc(s.note) + '</span>';
      });
      h += '</div>';
      /* 加完割之后的表 */
      h += '<details class="help"><summary>第 ' + c.round + ' 刀加入后的单纯形表</summary>'
        + '<div class="iter-body">' + cutTableau(m, c) + '</div></details>';
    });
    h += '<div class="judge"><span class="row blk">结论</span><span class="row">'
      + (m.converged ? '所有基变量都已取整，迭代结束。' :
          '<b>割了 ' + m.maxCuts + ' 刀仍未收敛</b>（达到刀数上限），下面给出的解不保证最优。')
      + '</span></div>';
    if (m.converged) h += resultVerdict(prob, m.solution, m.objective, '割平面法');
    return h + '</div>';
  }

  /* 把割平面法内部的表拼成 renderTable 认得的形状。
     每一刀都用自己的列数快照（c.varsAfter / c.N），不能拿最终的 vars ——
     每加一刀表就宽一列，拿最终列数渲染早期表会越界。 */
  function cutTableau(m, c) {
    var out = '';
    var res = {
      vars: c.varsAfter, mConstraints: c.m, nDecision: c.varsAfter.length,
      steps: [{
        rows: c.rowsAfter, obj: c.objAfter, basis: c.basisAfter,
        entering: null, leaving: null, ratios: null, degenerate: false,
        iter: 0, note: '这就是加入第 ' + c.round + ' 刀之后的表（新行就是割，'
          + '新变量 ' + c.newVarName + ' 是它的剩余变量，右端项为负 → 需要继续用对偶单纯形法）。'
      }]
    };
    out += renderTable(res, res.steps[0]) + explain(res, res.steps[0]);
    c.dualSteps.forEach(function (s) {
      if (!s.ok || !s.snapshot) return;
      out += '<div class="iter-head"><span class="name">' + esc(s.leaveName)
        + ' 出基 → ' + esc(s.enterName) + ' 入基</span></div>';
      var rs = {
        vars: c.varsAfter, mConstraints: c.m, nDecision: c.varsAfter.length,
        steps: [{
          rows: s.snapshot.rows, obj: s.snapshot.obj, basis: s.snapshot.basis,
          entering: s.enter, leaving: s.negRow, ratios: null, degenerate: false,
          iter: 0, note: s.note
        }]
      };
      out += renderTable(rs, rs.steps[0]) + explain(rs, rs.steps[0]);
    });
    return out;
  }

  /* ---------------- 隐枚举法 ---------------- */
  function viewEnum(prob, r, m) {
    var h = '<h2 class="sec">隐枚举法</h2><div class="card">';
    if (m.tooBig) {
      h += '<div class="sens-note">' + esc(m.reason) + '</div></div>';
      return h;
    }
    h += '<div class="sens-note">做法：0-1 问题一共只有 2<sup>n</sup> 个解。'
      + '但没必要每个都逐条检查约束 —— 先设法化成「目标系数全非负」的形式'
      + '（这样目标值随任一个变量由 0 变 1 只会更大），再拿当前最好的解当<b>过滤条件</b>：'
      + '目标值还不如它的点，连约束都不用看，直接跳过。这就是「隐」枚举 —— '
      + '表面上枚举了 2<sup>n</sup> 个，实际上绝大多数被过滤条件挡掉了。</div>';

    /* 标准化说明 */
    h += '<div class="judge"><span class="row blk">标准化</span>';
    if (prob.direction === 'min') {
      h += '<span class="row">· 原题是求最小，把目标系数全部取负转成求最大，'
        + '最后再把结果还原。</span>';
    } else {
      h += '<span class="row">· 原题已经是求最大。</span>';
    }
    if (m.flipped.length) {
      h += '<span class="row">· 目标系数为负的变量做替换 x<sub>j</sub> = 1 − y<sub>j</sub>：'
        + m.flipped.map(function (j) { return 'x' + subs(j + 1); }).join('、')
        + '。这样它们的系数变成正数，目标值单调不减。</span>';
      h += '<span class="row">· 常数项随之变成 ' + num(m.offset) + '。</span>';
    } else {
      h += '<span class="row">· 目标系数本来就都非负，不需要替换。</span>';
    }
    h += '</div>';

    var rows = m.rows;
    var show = rows.length <= MAX_SHOW_ROWS;
    if (!show) {
      h += '<div class="sens-warn">一共 ' + rows.length + ' 个枚举点，全部铺开会很长；'
        + '下面只列出<b>通过过滤条件、真正需要检查约束的</b>那些点。'
        + '（被过滤掉的一律只记「不满足过滤条件」）</div>';
    }
    h += '<details class="help"' + (show ? '' : ' open') + '><summary>'
      + (show ? '展开枚举表（' + rows.length + ' 个点）' : '展开有效点的枚举表')
      + '</summary><div class="scroll"><table class="sens en"><thead><tr>'
      + '<th>#</th><th>取值</th><th>z</th><th>过滤条件</th><th>约束检查</th><th>结论</th>'
      + '</tr></thead><tbody>';
    rows.forEach(function (row) {
      if (!show && row.passFilter === false) return;
      var chk = row.checks.length
        ? row.checks.map(function (c) {
            return (c.sat ? '✓' : '✗') + '第' + (c.i + 1) + '条(' + num(c.lhs) + ')';
          }).join(' ')
        : (row.passFilter === false ? '—' : '');
      h += '<tr>'
        + '<td class="nm">' + row.idx + '</td>'
        + '<td class="nowrap">(' + row.y.join(',') + ')</td>'
        + '<td class="nowrap">' + num(row.zNorm) + '</td>'
        + '<td class="nowrap">' + (row.passFilter ? '✓' : '✗ 跳过') + '</td>'
        + '<td class="nowrap">' + chk + '</td>'
        + '<td>' + esc(row.verdict) + '</td></tr>';
    });
    h += '</tbody></table></div></details>';
    h += '<div class="judge"><span class="row">共 ' + rows.length + ' 个 0-1 点，其中 <b>'
      + m.filteredOut + '</b> 个被过滤条件直接挡掉（占 '
      + Math.round(m.filteredOut / rows.length * 100) + '%），不必检查约束。</span></div>';
    if (m.best) {
      h += resultVerdict(prob, m.best, m.bestZ, '隐枚举法');
    } else {
      h += '<div class="verdict no"><div class="vtitle">无可行解</div>'
        + '<div class="vsum">所有 0-1 点都不满足约束。</div></div>';
    }
    return h + '</div>';
  }

  /* ===================== 启动 ===================== */
  panel.init();
  syncVtypes();
  panel.state.cons = [];
  var origRender = panel.render;
  /* 变量增删后要同步类型选择器 —— 包一层，不动组件本身 */
  var desc = panel.el('addVar');
  ['ipAddVar', 'ipDelVar'].forEach(function (id) {
    $(id).addEventListener('click', function () { setTimeout(function () { renderTypes(); }, 0); });
  });
  $('ipSolveBtn').addEventListener('click', solve);
  renderTypes();
  /* 供回归脚本与截图脚本使用：变量增删后类型选择器是延时渲染的，
     脚本没法等，所以把重绘入口挂出来让它们同步触发（真人手点用不到）。 */
  window.__ipRenderTypes = renderTypes;
})();
