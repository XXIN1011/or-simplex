/* =========================================================================
   灵敏度分析模块界面
   -------------------------------------------------------------------------
   教材式的流程：
     ① 输入基准线性规划 → 求基准最优解
     ② 选择要分析的变化：改目标函数系数 / 改右端项 / 增加约束 / 增加变量
     ③ 输出「前置判断」的推导，再把变化后的表接下去迭代，用的还是单纯形法那套表格
   ========================================================================= */

var format = require('../core/format.js');
var fmtNum = format.fmtNum;
var fmtAff = format.fmtAff;

var simplex = require('../core/simplex.js');
var simplexSolve = simplex.simplexSolve;

var scenario = require('../core/scenario.js');
var sensAnalyze = scenario.sensAnalyze;
var sensParam = scenario.sensParam;

var inputPanel = require('./input-panel.js');
var createInputPanel = inputPanel.createInputPanel;
var addScrollHints = inputPanel.addScrollHints;

var tableRender = require('./table-render.js');
var renderTable = tableRender.renderTable;
var explain = tableRender.explain;
(function () {
  'use strict';

  /* 输入表：与单纯形法模块共用同一份组件实现，只是挂到 s* 的 id 上 */
  var panel = createInputPanel({
    tbl: 'sInTbl', dirSeg: 'sDirSeg',
    addVar: 'sAddVar', delVar: 'sDelVar', addCon: 'sAddCon', delCon: 'sDelCon',
    maxN: 6, maxM: 8,
    state: { dir: 'max', n: 0, m: 0, c: [], cons: [] }
  });

  var base = null;      // 基准问题的求解结果
  var baseProb = null;  // 基准问题本身
  var last = null;      // 最近一次场景分析的结果

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- 基准题求解 ---------------- */
  function solveBase() {
    var prob = panel.getProblem();
    if (prob.c.length < 1) {
      banner('还没有决策变量，先点「+ 变量」搭一个线性规划。');
      return;
    }
    var res = simplexSolve(prob);
    if (res.ok === false) { banner(res.message); return; }
    if (res.status !== 'optimal') {
      banner('基准问题没有最优解（' + statusName(res.status) + '），灵敏度分析是在最优解上做的，换一道题再试。');
      base = null; baseProb = null;
      $('sBase').innerHTML = '';
      $('sScenario').innerHTML = '';
      return;
    }
    banner('');
    base = res;
    baseProb = prob;
    last = null;
    renderBase();
    renderScenario();
  }

  function statusName(s) {
    return s === 'optimal' ? '最优解'
      : s === 'infeasible' ? '无可行解'
      : s === 'unbounded' ? '无界解' : '未收敛';
  }

  /* 基准结果：只给结论摘要，详细迭代过程在「单纯形法」模块里看 */
  function renderBase() {
    var sols = base.solution.map(function (v, j) {
      return 'x' + (j + 1) + ' = <span class="v">' + fmtNum(v) + '</span>';
    }).join('　　') || '<span class="muted">本题没有决策变量</span>';
    var names = base.steps[base.steps.length - 1].basis.map(function (c) { return base.vars[c].name; });
    $('sBase').innerHTML = '<h2 class="sec">基准最优解</h2>'
      + '<div class="verdict opt">'
      + '<div class="vtitle">最优解</div>'
      + '<div class="sol">' + sols + '</div>'
      + '<div class="sol">z = <span class="zv">' + fmtNum(base.objective) + '</span></div>'
      + '<div class="vsum">最优基：' + names.join('、')
      + '。下面的分析都从这张最优表出发 —— 先判断变化后最优基还是不是它，不是就接着迭代。</div>'
      + '</div>';
  }

  /* ---------------- 场景选择与参数输入 ---------------- */
  function renderScenario() {
    var h = '<h2 class="sec">选择要分析的变化</h2><div class="card">'
      + '<div class="scen-tabs" id="sensTabs">'
      + scenTab('c', '改目标系数')
      + scenTab('a', '改技术系数 a<sub>ij</sub>')
      + scenTab('b', '改右端项')
      + scenTab('add-var', '增加一个变量')
      + scenTab('add-con', '增加一个约束')
      + scenTab('param', '参数线性规划')
      + '</div><div id="sensForm"></div></div>';
    $('sScenario').innerHTML = h;
    Array.prototype.forEach.call($('sensTabs').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call($('sensTabs').querySelectorAll('button'), function (x) {
          x.classList.toggle('on', x === b);
        });
        renderForm(b.dataset.t);
      });
    });
    renderForm('c');
  }
  function scenTab(t, label) {
    return '<button type="button" data-t="' + t + '" class="' + (t === 'c' ? 'on' : '') + '">'
      + label + '</button>';
  }

  var TITLES = {
    c: '目标函数系数变化',
    a: '技术系数 a_ij 变化',
    b: '右端项变化',
    'add-con': '增加一个约束',
    'add-var': '增加一个变量',
    param: '参数线性规划'
  };

  function renderForm(t) {
    var n = baseProb.c.length, m = baseProb.constraints.length, h = '';
    var small = ' class="num sm" type="text" inputmode="decimal" placeholder="0"';

    if (t === 'c') {
      h += '<div class="sens-note">填入新的目标函数系数（不改的照着原样填）。</div>'
        + '<div class="fh"><span class="fl">新目标函数</span><span class="fe">z =</span>';
      for (var j = 0; j < n; j++) {
        h += '<input' + small + ' data-f="c" data-j="' + j + '" value="' + baseProb.c[j] + '">'
          + '<span class="fx">x' + (j + 1) + (j < n - 1 ? ' +' : '') + '</span>';
      }
      h += '</div>';
    } else if (t === 'b') {
      h += '<div class="sens-note">填入新的右端项。</div><div class="fh"><span class="fl">新右端项 b</span></div>';
      for (var i = 0; i < m; i++) {
        h += '<div class="fh"><span class="fl">约束 ' + (i + 1) + '</span>'
          + '<input' + small + ' data-f="b" data-i="' + i + '" value="' + baseProb.constraints[i].rhs + '"></div>';
      }
    } else if (t === 'add-con') {
      h += '<div class="sens-note">追加一条约束（原来的约束与目标函数都不动）。</div>'
        + '<div class="fh"><span class="fl">新约束</span>';
      for (var j2 = 0; j2 < n; j2++) {
        h += '<input' + small + ' data-f="ac-a" data-j="' + j2 + '" value="0">'
          + '<span class="fx">x' + (j2 + 1) + (j2 < n - 1 ? ' +' : '') + '</span>';
      }
      h += '<select class="rel" data-f="ac-rel" aria-label="新约束的关系符"><option value="<=">&lt;=</option>'
        + '<option value=">=">&gt;=</option><option value="=">=</option></select>'
        + '<input' + small + ' data-f="ac-b" value="0"></div>';
    } else if (t === 'a') {
      /* 技术系数 a_ij：先用两个下拉框定位「哪一条约束里的哪一个变量」，
         再把新值填上。定位变了就把当前系数值同步到输入框，省得手动去查。 */
      var copts = '', vopts = '', ci, vj;
      for (ci = 0; ci < m; ci++) copts += '<option value="' + ci + '">约束 ' + (ci + 1) + '</option>';
      for (vj = 0; vj < n; vj++) vopts += '<option value="' + (vj) + '">x' + (vj + 1) + '</option>';
      h += '<div class="sens-note">选一个技术系数 a<sub>ij</sub>（第 i 条约束里 x<sub>j</sub> 的系数）改成新值。'
        + '改的是<b>非基变量</b>的列还是<b>基变量</b>的列，判据完全不同。</div>'
        + '<div class="fh"><span class="fl">第</span>'
        + '<select class="rel" data-f="a-con" aria-label="选择第几条约束">' + copts + '</select>'
        + '<span class="fx">条约束里的</span></div>'
        + '<div class="fh"><span class="fl">变量</span>'
        + '<select class="rel" data-f="a-var" aria-label="选择哪个变量">' + vopts + '</select></div>'
        + '<div class="fh"><span class="fl">改为</span>'
        + '<input' + small + ' data-f="a-val" value="'
        + String(baseProb.constraints[0].coef[0]) + '"></div>';
    } else if (t === 'param') {
      h += '<div class="sens-note">把某个系数写成含参数 λ 的形式，求「λ 在什么范围内最优基不变」，'
        + '以及越过临界值之后最优解怎么接着变。先选参数加在哪一类系数上。</div>'
        + '<div class="scen-tabs" id="pKind">'
        + '<button type="button" data-k="c" class="on">变量系数 c<sub>j</sub>(λ)</button>'
        + '<button type="button" data-k="b">右边系数 b<sub>i</sub>(λ)</button>'
        + '</div><div id="pBody"></div>';
    } else {
      h += '<div class="sens-note">新增一个变量 x' + (n + 1) + '，填入它的目标系数与在各约束中的系数。</div>'
        + '<div class="fh"><span class="fl">目标系数</span>'
        + '<input' + small + ' data-f="av-c" value="0"><span class="fx">x' + (n + 1) + '</span></div>';
      for (var i2 = 0; i2 < m; i2++) {
        h += '<div class="fh"><span class="fl">约束 ' + (i2 + 1) + ' 中系数</span>'
          + '<input' + small + ' data-f="av-a" data-i="' + i2 + '" value="0"></div>';
      }
    }
    h += '<div class="actions"><button type="button" class="btn primary" id="sensGo">分　析</button></div>';
    $('sensForm').innerHTML = h;
    $('sensGo').addEventListener('click', function () { runScenario(t); });

    if (t === 'a') {
      var pick = function (f) { return $('sensForm').querySelector('[data-f="' + f + '"]'); };
      var sync = function () {
        var i3 = parseInt(pick('a-con').value, 10), j3 = parseInt(pick('a-var').value, 10);
        pick('a-val').value = String(baseProb.constraints[i3].coef[j3]);
      };
      pick('a-con').addEventListener('change', sync);
      pick('a-var').addEventListener('change', sync);
    }
    if (t === 'param') {
      paramKind = 'c';
      Array.prototype.forEach.call($('pKind').querySelectorAll('button'), function (b) {
        b.addEventListener('click', function () {
          Array.prototype.forEach.call($('pKind').querySelectorAll('button'), function (x) {
            x.classList.toggle('on', x === b);
          });
          paramKind = b.dataset.k;
          renderParamBody();
        });
      });
      renderParamBody();
    }
  }

  /* 参数线性规划的 λ 系数输入（跟着上面的小标签切换） */
  var paramKind = 'c';
  function renderParamBody() {
    var n = baseProb.c.length, m = baseProb.constraints.length, h = '', k;
    var small = ' class="num sm" type="text" inputmode="decimal" placeholder="0"';
    if (paramKind === 'c') {
      h += '<div class="sens-note">填各变量系数的 λ 系数 d<sub>j</sub>，'
        + '即 c<sub>j</sub>(λ) = c<sub>j</sub> + λ·d<sub>j</sub>（不变的填 0，至少填一个非 0）。</div>';
      for (k = 0; k < n; k++) {
        h += '<div class="fh"><span class="fl">c<sub>' + (k + 1) + '</sub>(λ) = '
          + String(baseProb.c[k]) + ' + λ·</span>'
          + '<input' + small + ' data-f="pd" data-j="' + k + '"></div>';
      }
    } else {
      h += '<div class="sens-note">填各右端项的 λ 系数 e<sub>i</sub>，'
        + '即 b<sub>i</sub>(λ) = b<sub>i</sub> + λ·e<sub>i</sub>（不变的填 0，至少填一个非 0）。</div>';
      for (k = 0; k < m; k++) {
        h += '<div class="fh"><span class="fl">b<sub>' + (k + 1) + '</sub>(λ) = '
          + String(baseProb.constraints[k].rhs) + ' + λ·</span>'
          + '<input' + small + ' data-f="pe" data-i="' + k + '"></div>';
      }
    }
    $('pBody').innerHTML = h;
  }

  function num(sel) {
    var el = document.querySelector(sel);
    if (!el) return 0;
    var v = parseFloat(String(el.value).replace(/[^0-9.\-]/g, ''));
    return isNaN(v) ? 0 : v;
  }
  function collect(t) {
    var n = baseProb.c.length, m = baseProb.constraints.length, i;
    if (t === 'c') {
      var c = [];
      for (i = 0; i < n; i++) c.push(num('[data-f="c"][data-j="' + i + '"]'));
      return { type: 'c', c: c };
    }
    if (t === 'a') {
      return { type: 'a',
               con: parseInt($('sensForm').querySelector('[data-f="a-con"]').value, 10),
               v: parseInt($('sensForm').querySelector('[data-f="a-var"]').value, 10),
               value: num('[data-f="a-val"]') };
    }
    if (t === 'b') {
      var rhs = [];
      for (i = 0; i < m; i++) rhs.push(num('[data-f="b"][data-i="' + i + '"]'));
      return { type: 'b', rhs: rhs };
    }
    if (t === 'add-con') {
      var co = [];
      for (i = 0; i < n; i++) co.push(num('[data-f="ac-a"][data-j="' + i + '"]'));
      return { type: 'add-con', coef: co,
               rel: document.querySelector('[data-f="ac-rel"]').value,
               rhs: num('[data-f="ac-b"]') };
    }
    if (t === 'param') {
      if (paramKind === 'c') {
        var d = [];
        for (i = 0; i < n; i++) d.push(num('[data-f="pd"][data-j="' + i + '"]'));
        return { param: true, kind: 'c', d: d };
      }
      var e = [];
      for (i = 0; i < m; i++) e.push(num('[data-f="pe"][data-i="' + i + '"]'));
      return { param: true, kind: 'b', e: e };
    }
    var coef = [];
    for (i = 0; i < m; i++) coef.push(num('[data-f="av-a"][data-i="' + i + '"]'));
    return { type: 'add-var', c: num('[data-f="av-c"]'), coef: coef };
  }

  function runScenario(t) {
    var sc = collect(t);
    var r = sc.param ? sensParam(baseProb, sc) : sensAnalyze(baseProb, sc);
    if (!r.ok) { banner(r.message); return; }
    banner('');
    last = r;
    if (r.parameter) renderParam(r);
    else renderAnalysis(r);
  }

  /* ---------------- 参数线性规划的结果 ---------------- */
  function subs(k) {
    return String(k).replace(/[0-9]/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[+d]; });
  }
  /* 下标 j 用的 Unicode 字符（直接写 'j' 会变成正体，看起来像变量名的一部分） */
  var SUBJ = 'ⱼ';
  /* 把 λ 的系数写成「+ λ」「− 2λ」这种带符号的样子 */
  function lamSigned(v) {
    var a = Math.abs(v);
    return (v > 0 ? ' + ' : ' − ') + (Math.abs(a - 1) < 1e-12 ? '' : String(a)) + 'λ';
  }
  function lamRange(lo, hi) {
    if (lo === -Infinity && hi === Infinity) return '全部 λ';
    if (lo === -Infinity) return 'λ ≤ ' + fmtNum(hi);
    if (hi === Infinity) return 'λ ≥ ' + fmtNum(lo);
    if (Math.abs(hi - lo) < 1e-9) return 'λ = ' + fmtNum(lo);
    return fmtNum(lo) + ' ≤ λ ≤ ' + fmtNum(hi);
  }

  function renderParam(r) {
    var isC = (r.kind === 'c');
    var h = '<h2 class="sec">参数线性规划（' + (isC ? '2.6.1 变量系数' : '2.6.2 右边系数') + '）</h2>';

    /* ① 参数写法回显，免得看错对象 */
    var parts = [], base0 = isC ? baseProb.c : baseProb.constraints.map(function (k) { return k.rhs; });
    var sym = isC ? 'c' : 'b';
    r.varNames.forEach(function (v, i2) {
      if (Math.abs(v) < 1e-12) return;
      parts.push(sym + subs(i2 + 1) + '(λ) = ' + String(base0[i2]) + lamSigned(v));
    });
    h += '<div class="card"><div class="sens-h">参数形式</div><div class="judge">'
      + '<span class="row">' + (parts.length ? parts.join('　　') : '（没有填 λ 的系数）') + '</span>'
      + '<span class="row">其余 ' + sym + SUBJ
      + (isC ? ' 与 λ 无关（检验数行里它们不带 λ）' : ' 与 λ 无关（检验数行完全不随 λ 变）')
      + '。</span>' + '</div></div>';

    /* ② 分段表 */
    h += '<div class="card"><div class="sens-h">λ 的分段与对应的最优解</div>'
      + '<div class="sens-note">每一段里最优基都不变，所以 x 与 z 都是 λ 的一次式；'
      + '段的端点就是临界值 —— 那里某一列的检验数正好变成 0（'
      + (isC ? '于是它可以入基' : '于是某一行的基变量正好变成 0，让它出基')
      + '）。</div>'
      + '<table class="sens"><thead><tr><th>λ 范围</th><th>最优基</th><th>x(λ)</th><th>z(λ)</th></tr></thead><tbody>';
    r.segments.forEach(function (s) {
      var xs = [];
      s.x.forEach(function (v, j) {
        if (Math.abs(v.a) < 1e-12 && Math.abs(v.b) < 1e-12) return;
        xs.push('x' + subs(j + 1) + ' = ' + fmtAff(v));
      });
      if (!xs.length) xs.push('（这一段没有取正值的决策变量）');
      else if (xs.length < s.x.length) xs.push('其余 x' + SUBJ + ' = 0');
      h += '<tr><td class="nowrap">' + lamRange(s.lo, s.hi) + '</td>'
        + '<td>' + s.basisNames.join('<br>') + '</td>'
        + '<td>' + xs.join('<br>') + '</td>'
        + '<td class="nowrap">z = ' + fmtAff(s.z) + '</td></tr>';
      if (s.note) {
        h += '<tr><td colspan="4" class="sens-warn">' + esc(s.note) + '</td></tr>';
      }
    });
    h += '</tbody></table>'
      + '<div class="sens-note">用法：先看 λ = 0 落在哪一段，那一段给出当前的最优解；'
      + 'λ 越过某个临界值后，最优基换成相邻那一段的。</div></div>';

    if (r.warn) h += '<div class="card"><div class="sens-warn">' + esc(r.warn) + '</div></div>';

    var box = document.createElement('div');
    box.id = 'sensOut';
    box.innerHTML = h;
    var old = $('sensOut');
    if (old) old.parentNode.removeChild(old);
    $('sScenario').parentNode.insertBefore(box, $('sScenario').nextSibling);
    addScrollHints(document);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------- 输出：前置判断 + 继续迭代表 ---------------- */
  function renderAnalysis(r) {
    var h = '<h2 class="sec">' + TITLES[r.kind] + '</h2>';

    /* ① 前置判断（教材里的那一步推导） */
    h += '<div class="card"><div class="sens-h">' + r.judgement.title + '</div>'
      + '<div class="sens-note">' + r.judgement.head + '</div>';
    if (r.judgement.matrix) {
      h += '<div class="judge">B⁻¹ = ' + esc(r.judgement.matrix) + '</div>';
    }
    h += '<div class="judge">';
    /* 教材把「系数变化」按非基变量 / 基变量拆成两小节，判据不同，所以分块列 */
    (r.judgement.blocks || []).forEach(function (blk) {
      h += '<span class="row blk">' + esc(blk.label) + '</span>';
      blk.lines.forEach(function (l) {
        h += '<span class="row">· ' + l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</span>';
      });
    });
    (r.judgement.lines || []).forEach(function (l) {
      h += '<span class="row">· ' + l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>') + '</span>';
    });
    h += '</div>';
    h += '<div class="vsum"><b>' + r.judgement.conclusion + '</b></div></div>';

    /* ② 在原最优表上继续迭代；原基被彻底破坏时改为重新求解 */
    var shown = r.steps.filter(function (s) { return s.entering !== null || s.dual; });
    var lastStep = r.steps[r.steps.length - 1];
    var all = shown.concat([lastStep].filter(function (s) { return shown.indexOf(s) < 0; }));

    h += '<h2 class="sec">' + (r.restart ? '重新求解（从标准初始基重跑大 M 法）'
                                          : '在原最优表上继续迭代') + '</h2>';
    all.forEach(function (step, k) {
      h += '<div class="card">'
        + '<div class="iter-head"><span class="name">'
        + (step.dual ? '对偶单纯形 · 第 ' + (k + 1) + ' 步' : (step.entering === null ? '终点' : '第 ' + (k + 1) + ' 步'))
        + '</span>' + (step.degenerate ? '<span class="tag">退化</span>' : '')
        + (step.dual ? '<span class="tag">对偶</span>' : '') + '</div>'
        + renderTable(r, step)
        + explain(r, step)
        + '</div>';
    });

    /* ③ 结论 */
    h += '<h2 class="sec">结论</h2>';
    if (r.status === 'optimal') {
      var sols = r.result.solution.map(function (v, j) {
        return 'x' + (j + 1) + ' = <span class="v">' + fmtNum(v) + '</span>';
      }).join('　　');
      h += '<div class="verdict opt"><div class="vtitle">变化后的最优解</div>'
        + '<div class="sol">' + (sols || '<span class="muted">本题没有决策变量</span>') + '</div>'
        + '<div class="sol">z = <span class="zv">' + fmtNum(r.result.objective) + '</span></div>'
        + '<div class="vsum">最优基：' + r.result.basisNames.join('、')
        + '　　（基准最优基：' + r.base.basisNames.join('、') + '）</div></div>';
    } else {
      h += '<div class="verdict ' + (r.status === 'unbounded' ? 'unb' : 'no') + '">'
        + '<div class="vtitle">' + statusName(r.status) + '</div>'
        + '<div class="vsum">按新的条件，问题' + (r.status === 'infeasible' ? '不存在可行解' : '目标值无界')
        + '，因此没有最优解。</div></div>';
    }

    $('sBase').innerHTML = $('sBase').innerHTML.replace(/<h2 class="sec">分析结果<\/h2>[\s\S]*$/, '');
    var box = document.createElement('div');
    box.id = 'sensOut';
    box.innerHTML = h;
    var old = $('sensOut');
    if (old) old.parentNode.removeChild(old);
    $('sScenario').parentNode.insertBefore(box, $('sScenario').nextSibling);
    addScrollHints(document);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function banner(msg) {
    $('sBanners').innerHTML = msg
      ? '<div class="banner err">' + esc(msg) + '</div>' : '';
  }

  /* ---------------- 启动 ---------------- */
  panel.init();
  $('sSolveBtn').addEventListener('click', solveBase);
})();

/* 本模块没有对外接口：require 一次即完成灵敏度分析界面初始化（副作用模块）。 */
module.exports = {};
