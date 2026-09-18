/* =========================================================================
   动态规划模块界面
   -------------------------------------------------------------------------
   流程：选题型 → 填这道题 → 求解
   输出：① 建模卡（阶段/状态/决策/状态转移/递推方程）
         ② 逐阶段递推表（每个状态的 f_k(s) 与最优决策 u*_k(s)，可展开逐个决策对比）
         ③ 最优策略回溯（顺着 u* 走一遍）
         ④ 顺序解法对照（同一道题换个方向再推一遍，用来理解两种解法的差别）
   ========================================================================= */
(function () {
  'use strict';

  var TYPE_NAMES = {
    shortest: '最短路线',
    resource: '资源分配',
    knapsack: '背包问题',
    prodinv: '生产与存储',
    replace: '设备更新'
  };
  var TYPE_ORDER = ['shortest', 'resource', 'knapsack', 'prodinv', 'replace'];

  var st = null;          // 当前输入状态（下面 defaultState() 给初值）
  var last = null;        // 最近一次求解结果
  var lastModel = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function subs(k) {
    return String(k).replace(/[0-9]/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[+d]; });
  }
  function bold(s) { return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  /* 把教材写法里的下标转成真下标：f_k(s_k) → f<sub>k</sub>(s<sub>k</sub>)、
     f_{k+1}(u_k) → f<sub>k+1</sub>(u<sub>k</sub>)。先转带花括号的，再转单字符的，
     否则 f_{k+1} 会被单字符规则从中间切开。 */
  function formula(s) {
    return esc(s)
      .replace(/([A-Za-z])_\{([^}]+)\}/g, '$1<sub>$2</sub>')
      .replace(/([A-Za-z])_([A-Za-z0-9])/g, '$1<sub>$2</sub>');
  }

  /* ===================== 输入状态的初值与读写 ===================== */
  function defaultState() {
    return {
      type: 'shortest',
      shortest: {
        counts: [1, 2, 3, 2, 1],
        /* w[i][r][c]：第 i 层第 r 个 → 第 i+1 层第 c 个；null 表示不通 */
        w: [
          [[5, 3]],
          [[1, 3, 6], [8, 7, 6]],
          [[6, 8], [3, 5], [8, 4]],
          [[3], [4]]
        ]
      },
      resource: {
        n: 3, m: 6, exhaust: false,
        g: [
          [0, 4, 7, 9, 11, 12, 13],
          [0, 3, 6, 9, 10, 11, 12],
          [0, 2, 5, 8, 10, 13, 15]
        ]
      },
      knapsack: {
        cap: 10, mode: '01',
        items: [{ w: 3, v: 4 }, { w: 4, v: 5 }, { w: 5, v: 6 }]
      },
      prodinv: { demands: [3, 4, 3], setup: 5, unit: 1, hold: 1 },
      replace: {
        years: 4, price: 12,
        rows: [
          { r: 10, u: 1, s: 0 },
          { r: 9, u: 2, s: 6 },
          { r: 8, u: 4, s: 3 },
          { r: 6, u: 7, s: 1 }
        ]
      }
    };
  }

  /* 把当前界面上的值读回 st（只读可见的那些控件） */
  function readForm() {
    var t = st.type;
    function val(sel, dflt) {
      var el = document.querySelector(sel);
      if (!el) return dflt;
      var v = parseFloat(String(el.value).replace(/[^0-9.\-]/g, ''));
      return isNaN(v) ? dflt : v;
    }
    if (t === 'shortest') {
      document.querySelectorAll('[data-sw]').forEach(function (el) {
        var p = el.dataset.sw.split(',');
        var v = String(el.value).trim();
        st.shortest.w[+p[0]][+p[1]][+p[2]] = (v === '' ? null : Number(v));
      });
    } else if (t === 'resource') {
      document.querySelectorAll('[data-rg]').forEach(function (el) {
        var p = el.dataset.rg.split(',');
        var v = String(el.value).trim();
        st.resource.g[+p[0]][+p[1]] = (v === '' ? 0 : Number(v));
      });
    } else if (t === 'knapsack') {
      document.querySelectorAll('[data-kw]').forEach(function (el) {
        st.knapsack.items[+el.dataset.kw].w = val('[data-kw="' + el.dataset.kw + '"]', 1);
      });
      document.querySelectorAll('[data-kv]').forEach(function (el) {
        st.knapsack.items[+el.dataset.kv].v = val('[data-kv="' + el.dataset.kv + '"]', 0);
      });
      st.knapsack.cap = val('[data-kcap]', 10);
      var m = document.querySelector('[data-kmode].on');
      if (m) st.knapsack.mode = m.dataset.kmode;
    } else if (t === 'prodinv') {
      document.querySelectorAll('[data-pd]').forEach(function (el) {
        st.prodinv.demands[+el.dataset.pd] = val('[data-pd="' + el.dataset.pd + '"]', 0);
      });
      st.prodinv.setup = val('[data-psetup]', 0);
      st.prodinv.unit = val('[data-punit]', 0);
      st.prodinv.hold = val('[data-phold]', 0);
    } else if (t === 'replace') {
      document.querySelectorAll('[data-rr]').forEach(function (el) {
        st.replace.rows[+el.dataset.rr].r = val('[data-rr="' + el.dataset.rr + '"]', 0);
      });
      document.querySelectorAll('[data-ru]').forEach(function (el) {
        st.replace.rows[+el.dataset.ru].u = val('[data-ru="' + el.dataset.ru + '"]', 0);
      });
      document.querySelectorAll('[data-rs]').forEach(function (el) {
        st.replace.rows[+el.dataset.rs].s = val('[data-rs="' + el.dataset.rs + '"]', 0);
      });
      st.replace.years = val('[data-ryears]', 4);
      st.replace.price = val('[data-rprice]', 0);
    }
  }

  /* ===================== 各题型的输入表单 ===================== */
  function numIn(attrs, value) {
    return '<input class="num" type="text" inputmode="decimal" placeholder="0" '
      + attrs + (value === null || value === undefined || value === ''
        ? '' : ' value="' + String(value) + '"') + '>';
  }

  function formShortest() {
    var c = st.shortest.counts, L = c.length, h = '';
    var letters = 'ABCDEFGH';
    h += '<div class="sens-note">网络按层给出：弧只连接相邻两层。'
      + '第一层是起点、最后一层是终点，节点名自动按字母排（' + letters[0] + '、'
      + letters[1] + '₁…）。留空的格子表示这两个节点之间不通。</div>';
    /* 节点数控制 */
    h += '<div class="fh"><span class="fl">层数</span>'
      + '<button type="button" class="btn sm" data-sL="-1">−</button>'
      + '<span class="fv">' + L + '</span>'
      + '<button type="button" class="btn sm" data-sL="1">＋</button>'
      + '<span class="fx">（' + L + ' 层 = ' + (L - 1) + ' 个阶段）</span></div>';
    for (var i = 0; i < L; i++) {
      var fixed = (i === 0 || i === L - 1);
      h += '<div class="fh"><span class="fl">第 ' + (i + 1) + ' 层</span>'
        + '<span class="fx">' + letters[i] + '　节点数</span>'
        + (fixed ? '<span class="fv">1（' + (i === 0 ? '起点' : '终点') + '）</span>'
                 : '<button type="button" class="btn sm" data-sN="' + i + ',-1">−</button>'
                   + '<span class="fv">' + c[i] + '</span>'
                   + '<button type="button" class="btn sm" data-sN="' + i + ',1">＋</button>')
        + '</div>';
    }
    /* 各相邻层的弧长表 */
    for (var i2 = 0; i2 < L - 1; i2++) {
      var from = nodeNames(i2, c), to = nodeNames(i2 + 1, c);
      h += '<div class="sens-h">第 ' + (i2 + 1) + ' 次前进：' + letters[i2] + ' 层 → '
        + letters[i2 + 1] + ' 层（弧长）</div>';
      h += '<div class="scroll"><table class="inp dm"><thead><tr><th></th>';
      to.forEach(function (n) { h += '<th>' + n + '</th>'; });
      h += '</tr></thead><tbody>';
      from.forEach(function (n, r) {
        h += '<tr><th class="rowh">' + n + '</th>';
        to.forEach(function (_, cc) {
          var v = (st.shortest.w[i2] && st.shortest.w[i2][r]) ? st.shortest.w[i2][r][cc] : null;
          h += '<td>' + numIn('data-sw="' + i2 + ',' + r + ',' + cc + '"', v) + '</td>';
        });
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }
    return h;
  }

  function nodeNames(layer, counts) {
    var letters = 'ABCDEFGH';
    var n = counts[layer], out = [];
    for (var j = 0; j < n; j++) out.push(n === 1 ? letters[layer] : letters[layer] + (j + 1));
    return out;
  }

  function formResource() {
    var r = st.resource, h = '';
    h += '<div class="sens-note">把总量 ' + r.m + ' 的资源分给 ' + r.n + ' 个项目，'
      + '下表是「给第 i 个项目分配 x 份时的收益」。允许有剩余就是 Σx ≤ m，'
      + '要求用尽就是 Σx = m。</div>';
    h += '<div class="fh"><span class="fl">项目数</span>'
      + '<button type="button" class="btn sm" data-rn="-1">−</button>'
      + '<span class="fv">' + r.n + '</span>'
      + '<button type="button" class="btn sm" data-rn="1">＋</button>'
      + '<span class="fx">　总量</span>'
      + '<button type="button" class="btn sm" data-rm="-1">−</button>'
      + '<span class="fv">' + r.m + '</span>'
      + '<button type="button" class="btn sm" data-rm="1">＋</button></div>';
    h += '<div class="fh"><span class="fl">资源约束</span>'
      + '<div class="seg sm" id="rEx"><button type="button" data-ex="0" class="'
      + (r.exhaust ? '' : 'on') + '">允许剩余</button>'
      + '<button type="button" data-ex="1" class="' + (r.exhaust ? 'on' : '') + '">必须用尽</button></div></div>';
    h += '<div class="scroll"><table class="inp dm"><thead><tr><th>项目</th>';
    for (var x = 0; x <= r.m; x++) h += '<th>x=' + x + '</th>';
    h += '</tr></thead><tbody>';
    for (var i = 0; i < r.n; i++) {
      h += '<tr><th class="rowh">第 ' + (i + 1) + ' 个</th>';
      for (var x2 = 0; x2 <= r.m; x2++) {
        h += '<td>' + numIn('data-rg="' + i + ',' + x2 + '"', r.g[i] ? r.g[i][x2] : 0) + '</td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div>';
  }

  function formKnapsack() {
    var k = st.knapsack, h = '';
    h += '<div class="sens-note">背包容量 ' + k.cap + '，共 ' + k.items.length + ' 种物品。'
      + '0/1 背包每种最多拿一件；「可重复」背包每种能拿任意多件。</div>';
    h += '<div class="fh"><span class="fl">容量</span>'
      + '<button type="button" class="btn sm" data-kcapd="-1">−</button>'
      + '<span class="fv">' + k.cap + '</span>'
      + '<button type="button" class="btn sm" data-kcapd="1">＋</button>'
      + '<span class="fx">　种类</span>'
      + '<button type="button" class="btn sm" data-kn="-1">−</button>'
      + '<span class="fv">' + k.items.length + '</span>'
      + '<button type="button" class="btn sm" data-kn="1">＋</button></div>';
    h += '<div class="fh"><span class="fl">拿取规则</span>'
      + '<div class="seg sm" id="kMode"><button type="button" data-kmode="01" class="'
      + (k.mode === '01' ? 'on' : '') + '">0/1（至多一件）</button>'
      + '<button type="button" data-kmode="multi" class="' + (k.mode === 'multi' ? 'on' : '') + '">可拿多件</button></div></div>';
    h += '<div class="scroll"><table class="inp dm"><thead><tr><th>物品</th><th>重量 w</th><th>价值 v</th></tr></thead><tbody>';
    k.items.forEach(function (it, i) {
      h += '<tr><th class="rowh">第 ' + (i + 1) + ' 种</th>'
        + '<td>' + numIn('data-kw="' + i + '"', it.w) + '</td>'
        + '<td>' + numIn('data-kv="' + i + '"', it.v) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  function formProdInv() {
    var p = st.prodinv, h = '';
    h += '<div class="sens-note">共 ' + p.demands.length + ' 个时期。每期产多了进库存、产少了不够卖，'
      + '不能欠货；期末库存必须归零。费用 = 生产费（开产就有准备费 ' + p.setup
      + '，另加每件 ' + p.unit + '）+ 存储费（每件每期 ' + p.hold + '）。</div>';
    h += '<div class="fh"><span class="fl">期数</span>'
      + '<button type="button" class="btn sm" data-pn="-1">−</button>'
      + '<span class="fv">' + p.demands.length + '</span>'
      + '<button type="button" class="btn sm" data-pn="1">＋</button></div>';
    h += '<div class="scroll"><table class="inp dm"><thead><tr><th>时期</th>';
    for (var i = 0; i < p.demands.length; i++) h += '<th>第 ' + (i + 1) + ' 期需求</th>';
    h += '</tr></thead><tbody><tr><th class="rowh">d</th>';
    for (var i2 = 0; i2 < p.demands.length; i2++) {
      h += '<td>' + numIn('data-pd="' + i2 + '"', p.demands[i2]) + '</td>';
    }
    h += '</tr></tbody></table></div>';
    h += '<div class="fh"><span class="fl">准备费 a</span>' + numIn('data-psetup', p.setup) + '</div>';
    h += '<div class="fh"><span class="fl">单位成本 c</span>' + numIn('data-punit', p.unit) + '</div>';
    h += '<div class="fh"><span class="fl">存储费 h</span>' + numIn('data-phold', p.hold) + '</div>';
    return h;
  }

  function formReplace() {
    var r = st.replace, h = '';
    var maxAge = r.rows.length - 1;
    h += '<div class="sens-note">一台设备要用 ' + r.years + ' 年，每年年初决定「继续用」还是「更新」。'
      + '役龄 t 的设备当年收益 r(t)、维持费 u(t)；更新要付设备价 ' + r.price
      + '，旧设备按役龄折价 s(t)。求 ' + r.years + ' 年总收益最大。</div>';
    h += '<div class="fh"><span class="fl">年数</span>'
      + '<button type="button" class="btn sm" data-ryd="-1">−</button>'
      + '<span class="fv">' + r.years + '</span>'
      + '<button type="button" class="btn sm" data-ryd="1">＋</button></div>';
    h += '<div class="fh"><span class="fl">设备价 c</span>' + numIn('data-rprice', r.price) + '</div>';
    h += '<div class="fh"><span class="fl">最大役龄</span>'
      + '<button type="button" class="btn sm" data-rt="-1">−</button>'
      + '<span class="fv">' + maxAge + '</span>'
      + '<button type="button" class="btn sm" data-rt="1">＋</button>'
      + '<span class="fx">（役龄 0 = 全新）</span></div>';
    h += '<div class="scroll"><table class="inp dm"><thead><tr><th>役龄 t</th>'
      + '<th>收益 r(t)</th><th>维持费 u(t)</th><th>残值 s(t)</th></tr></thead><tbody>';
    r.rows.forEach(function (row, t) {
      h += '<tr><th class="rowh">' + (t === 0 ? '0（全新）' : t) + '</th>'
        + '<td>' + numIn('data-rr="' + t + '"', row.r) + '</td>'
        + '<td>' + numIn('data-ru="' + t + '"', row.u) + '</td>'
        + '<td>' + numIn('data-rs="' + t + '"', row.s) + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  /* ===================== 表单渲染与交互 ===================== */
  function renderTypeTabs() {
    var h = '<div class="scen-tabs" id="dpTabs">';
    TYPE_ORDER.forEach(function (t) {
      h += '<button type="button" data-t="' + t + '" class="'
        + (t === st.type ? 'on' : '') + '">' + TYPE_NAMES[t] + '</button>';
    });
    h += '</div><div id="dpForm"></div>';
    $('dpInput').innerHTML = h;
    document.querySelectorAll('#dpTabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        readForm();
        st.type = b.dataset.t;
        last = null; lastModel = null;
        $('dpOut').innerHTML = '';
        banner('');
        renderTypeTabs();
      });
    });
    renderForm();
  }

  function renderForm() {
    var body = { shortest: formShortest, resource: formResource, knapsack: formKnapsack,
                 prodinv: formProdInv, replace: formReplace }[st.type]();
    $('dpForm').innerHTML = body;
    wireForm();
  }

  function wireForm() {
    var t = st.type;
    function bump(sel, fn) {
      document.querySelectorAll(sel).forEach(function (b) {
        b.addEventListener('click', function () { readForm(); fn(b); renderForm(); });
      });
    }
    function seg(id, attr, apply) {
      var box = document.getElementById(id);
      if (!box) return;
      box.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          readForm();
          box.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
          apply(b);
          renderForm();
        });
      });
    }
    if (t === 'shortest') {
      bump('[data-sL]', function (b) {
        var L = st.shortest.counts.length + (+b.dataset.sL);
        if (L < 2 || L > 6) return;
        var c = st.shortest.counts.slice(), added = (+b.dataset.sL > 0);
        if (added) c.push(1); else c.pop();
        c[0] = 1; c[c.length - 1] = 1;
        st.shortest.counts = c;
        resizeShortest();
        /* 刚加的那一层默认「全通、权 1」，否则新加完就是一张走不通的网络，
           学生第一眼看到的是「无解」而不是一道题 */
        if (added) {
          var li = st.shortest.w.length - 1;
          st.shortest.w[li] = st.shortest.w[li].map(function (row) {
            return row.map(function (v) { return v === null ? 1 : v; });
          });
        }
      });
      bump('[data-sN]', function (b) {
        var p = b.dataset.sN.split(','), i = +p[0];
        st.shortest.counts[i] += (+p[1]);
        if (st.shortest.counts[i] < 1) st.shortest.counts[i] = 1;
        if (st.shortest.counts[i] > 3) st.shortest.counts[i] = 3;
        resizeShortest();
      });
    } else if (t === 'resource') {
      bump('[data-rn]', function (b) {
        var r = st.resource;
        if (+b.dataset.rn > 0) {
          if (r.n >= 4) return;
          r.n++; r.g.push(new Array(r.m + 1).fill(0));
        } else { if (r.n <= 1) return; r.n--; r.g.pop(); }
      });
      bump('[data-rm]', function (b) {
        var r = st.resource, m = r.m + (+b.dataset.rm);
        if (m < 1 || m > 8) return;
        r.g.forEach(function (row) {
          while (row.length <= m) row.push(0);
          row.length = m + 1;
        });
        r.m = m;
      });
      seg('rEx', 'data-ex', function (b) { st.resource.exhaust = (b.dataset.ex === '1'); });
    } else if (t === 'knapsack') {
      bump('[data-kcapd]', function (b) {
        var v = st.knapsack.cap + (+b.dataset.kcapd);
        if (v >= 1 && v <= 20) st.knapsack.cap = v;
      });
      bump('[data-kn]', function (b) {
        var k = st.knapsack;
        if (+b.dataset.kn > 0) { if (k.items.length >= 5) return; k.items.push({ w: 2, v: 3 }); }
        else { if (k.items.length <= 1) return; k.items.pop(); }
      });
      seg('kMode', 'data-kmode', function (b) { st.knapsack.mode = b.dataset.kmode; });
    } else if (t === 'prodinv') {
      bump('[data-pn]', function (b) {
        var p = st.prodinv;
        if (+b.dataset.pn > 0) { if (p.demands.length >= 6) return; p.demands.push(3); }
        else { if (p.demands.length <= 2) return; p.demands.pop(); }
      });
    } else if (t === 'replace') {
      bump('[data-ryd]', function (b) {
        var v = st.replace.years + (+b.dataset.ryd);
        if (v >= 2 && v <= 6) st.replace.years = v;
      });
      bump('[data-rt]', function (b) {
        var r = st.replace, v = r.rows.length - 1 + (+b.dataset.rt);
        if (v < 2 || v > 5) return;
        if (+b.dataset.rt > 0) r.rows.push({ r: 6, u: 6, s: 1 });
        else r.rows.pop();
      });
    }
  }

  /* 层数或某层节点数变了以后，把弧长表按新尺寸对齐（已填的值尽量保留） */
  function resizeShortest() {
    var c = st.shortest.counts, L = c.length;
    var old = st.shortest.w, neu = [];
    for (var i = 0; i < L - 1; i++) {
      var rows = c[i], cols = c[i + 1], m = [];
      for (var r = 0; r < rows; r++) {
        var row = [];
        for (var cc = 0; cc < cols; cc++) {
          var o = (old[i] && old[i][r]) ? old[i][r][cc] : null;
          row.push(o === undefined ? null : o);
        }
        m.push(row);
      }
      if (i === old.length - 1 && old.length === L - 1) { /* 同上，无需处理 */ }
      neu.push(m);
    }
    /* 层数变多时，新加的那一层默认给一条「全通、权 1」的边，免得直接无解 */
    if (neu.length > old.length) {
      for (var z = old.length; z < neu.length; z++) {
        neu[z] = neu[z].map(function (row) { return row.map(function (v) { return v === null ? 1 : v; }); });
      }
    }
    st.shortest.w = neu;
  }

  function banner(msg) {
    $('dpBanners').innerHTML = msg ? '<div class="banner err">' + esc(msg) + '</div>' : '';
  }

  /* ===================== 求解 ===================== */
  var BUILDERS = {
    shortest: function (s) { return dpShortest({ layers: layerNames(s.counts), w: s.w }); },
    resource: function (s) { return dpResource({ total: s.m, g: s.g, exhaust: s.exhaust }); },
    knapsack: function (s) { return dpKnapsack({ cap: s.cap, items: s.items, mode: s.mode }); },
    prodinv: function (s) { return dpProdInv({ demands: s.demands, setup: s.setup, unit: s.unit, hold: s.hold }); },
    replace: function (s) {
      return dpReplace({
        years: s.years, price: s.price, initAge: 0,
        income: s.rows.map(function (r) { return r.r; }),
        upkeep: s.rows.map(function (r) { return r.u; }),
        salvage: s.rows.map(function (r) { return r.s; })
      });
    }
  };
  function layerNames(counts) {
    var letters = 'ABCDEFGH', out = [];
    for (var i = 0; i < counts.length; i++) out.push(nodeNames(i, counts));
    return out;
  }

  function solve() {
    readForm();
    var model, res;
    try {
      model = BUILDERS[st.type](st[st.type]);
      res = dpSolve(model);
    } catch (e) {
      banner('这道题算不了：' + e.message);
      return;
    }
    banner('');
    last = res; lastModel = model;
    renderResult(res, model);
  }

  /* ===================== 输出 ===================== */
  function renderResult(res, model) {
    var h = '';
    /* ① 建模卡 */
    h += '<h2 class="sec">建模</h2><div class="card"><div class="judge">'
      + '<span class="row blk">' + esc(model.meta.title) + '</span>'
      + '<span class="row">· ' + formula(model.meta.stageName) + '</span>'
      + '<span class="row">· ' + formula(model.meta.stateName) + '</span>'
      + '<span class="row">· ' + formula(model.meta.decisionName) + '</span>'
      + '<span class="row">· 最优值函数：f<sub>k</sub>(s<sub>k</sub>) —— '
      + '从第 k 阶段的 s<sub>k</sub> 出发走完全过程的最优总指标</span>'
      + '<span class="row blk">递推方程（逆序解法）</span>'
      + '<span class="row">' + formula(model.meta.formula) + '</span>'
      + '<span class="row">边界条件：' + formula(model.meta.boundary) + '</span>'
      + '</div></div>';

    /* ② 逆序解法 */
    h += '<h2 class="sec">逐阶段递推（逆序解法）</h2>';
    h += '<div class="card"><div class="sens-note">从最后一段往前推：'
      + '每格 f<sub>k</sub>(s) 都是「这一个状态下，把后面的路走完的最优值」。'
      + '它只用了<b>后一阶段已经算好的 f<sub>k+1</sub></b> —— '
      + '这就是动态规划「无后效性」带来的好处。</div>';
    h += res.backward.cells.map(function (c, idx) {
      return stageTable(res, model, 'backward', c, idx === 0);
    }).join('');
    h += '</div>';

    /* ③ 最优策略 */
    h += '<h2 class="sec">最优策略回溯</h2><div class="card">';
    if (res.backward.policy.length === 0) {
      h += '<div class="sens-note">从起点起没有任何可行路径，这道题无解。</div>';
    } else {
      h += '<div class="judge">'
        + '<span class="row">从起始状态 ' + esc(res.backward.startLabel)
        + ' 出发，每一步都取该状态的最优决策 u*<sub>k</sub>：</span>';
      res.backward.policy.forEach(function (p) {
        h += '<span class="row">· 阶段 ' + p.k + '　' + esc(p.sLabel) + ' ——' + esc(p.dLabel)
          + '→ ' + esc(p.nextLabel) + '　（这一步的指标 = ' + fmtNum(p.v) + '）</span>';
      });
      h += '</div>';
      h += '<div class="verdict opt"><div class="vtitle">最优策略</div>'
        + '<div class="sol">' + res.backward.policy.map(function (p) {
            return esc(p.dLabel.replace('→ ', ''));
          }).join('　→　')
        + '</div>'
        + '<div class="sol">最优值 = <span class="zv">' + fmtNum(res.backward.value) + '</span>'
        + '　（' + (res.sense === 'max' ? '最大化' : '最小化') + '）</div>'
        + '<div class="vsum">起点：' + esc(res.backward.startLabel) + '；'
        + res.backward.policy.length + ' 个阶段依次的决策如上。</div></div>';
    }
    h += '</div>';

    /* ④ 顺序解法对照 */
    h += '<h2 class="sec">顺序解法对照</h2><div class="card">';
    h += '<div class="sens-note">同一个模型换个方向推：从起点往后走，'
      + 'f<sub>k</sub> 挂在<b>下一阶段的状态</b>上，'
      + '即 f<sub>k</sub>(s<sub>k+1</sub>) = opt{ v<sub>k</sub>(s<sub>k</sub>,u<sub>k</sub>) + f<sub>k−1</sub>(s<sub>k</sub>) }。'
      + '两种解法结论必须一致（本应用里两者是各自独立算的，用来互相印证）。</div>';
    h += '<details class="help"><summary>展开顺序解法的逐阶段递推表</summary>';
    h += res.forward.cells.map(function (c) {
      return stageTable(res, model, 'forward', c, false);
    }).join('');
    h += '</details>';
    h += '<div class="judge"><span class="row">逆序解法最优值 = <b>' + fmtNum(res.backward.value)
      + '</b>　|　顺序解法最优值 = <b>' + fmtNum(res.forward.value) + '</b>　→ '
      + (Math.abs((res.backward.value || 0) - (res.forward.value || 0)) < 1e-9
          ? '一致 ✓' : '★不一致★') + '</span></div>';
    h += '</div>';

    $('dpOut').innerHTML = h;
    addScrollHints(document);
  }

  function stageTable(res, model, mode, cell, openFirst) {
    var isMax = res.sense === 'max';
    /* 各题型自己给阶段起名字（「第 k 次前进」「第 k 个项目」…）。
       注意不能用 replace('k', 数字) —— 那只会换掉第一处 k，
       于是「阶段 k（第 k 次前进）」会变成「阶段 1（第 k 次前进）」。 */
    var title = model.meta.stageLabel ? model.meta.stageLabel(cell.k)
                                      : ('阶段 ' + cell.k);
    var h = '<div class="sens-h">' + esc(title) + '</div>';
    if (cell.states.length === 0 && mode === 'forward') {
      return h + '<div class="sens-note">这一阶段没有可达的状态。</div>';
    }
    h += '<div class="scroll"><table class="sens dpt"><thead><tr>'
      + '<th>' + (mode === 'backward' ? '状态 s' + subs(cell.k) : '到达的状态 s' + subs(cell.k + 1)) + '</th>'
      + '<th>f' + subs(mode === 'backward' ? cell.k : cell.k) + '</th>'
      + '<th>' + (mode === 'backward' ? '最优决策 u*' + subs(cell.k) : '由谁而来') + '</th>'
      + '</tr></thead><tbody>';
    cell.states.forEach(function (s) {
      h += '<tr><td class="nowrap">' + esc(s.label) + '</td>'
        + '<td class="nowrap">' + (s.best === null ? '<span class="muted">不可达</span>' : fmtNum(s.best)) + '</td>'
        + '<td class="nowrap">' + esc(mode === 'backward' ? s.bestDLabel : (s.fromLabel + ' 经 ' + s.bestDLabel))
        + '</td></tr>';
    });
    h += '</tbody></table></div>';

    /* 每个状态的候选对比：这才是「为什么选它」的现场 */
    var withCases = cell.states.filter(function (s) { return s.cases && s.cases.length; });
    if (withCases.length) {
      h += '<details class="help"' + (openFirst ? '' : '') + '><summary>这一阶段每个决策的对比</summary>';
      withCases.forEach(function (s) {
        h += '<div class="sens-h">s' + subs(cell.k) + ' = ' + esc(s.label) + '：</div><div class="judge">';
        s.cases.forEach(function (c) {
          if (!c.reachable) {
            h += '<span class="row">· ' + esc(c.dLabel) + '　→ 走不到终点（不可行）</span>';
            return;
          }
          var isBest = Math.abs(c.total - s.best) < 1e-9;
          h += '<span class="row">' + (isBest ? '★ ' : '· ') + esc(c.dLabel)
            + '　→ 阶段指标 ' + fmtNum(c.v) + ' + 后续最优 ' + fmtNum(c.fNext)
            + ' = <b>' + fmtNum(c.total) + '</b>'
            + (isBest ? '　← 取它（' + (isMax ? '最大' : '最小') + '）' : '') + '</span>';
        });
        if (s.alts && s.alts.length > 1) {
          h += '<span class="row"><b>有 ' + s.alts.length + ' 个决策并列最优</b>'
            + '（多重最优策略），回溯时只需取其中一个。</span>';
        }
        h += '</div>';
      });
      h += '</details>';
    }
    return h;
  }

  /* ===================== 启动 ===================== */
  st = defaultState();
  st.shortest.counts = [1, 2, 3, 2, 1];
  resizeShortest.call(null);
  renderTypeTabs();
  $('dpSolveBtn').addEventListener('click', solve);
})();
