/* =========================================================================
   库存论模块界面
   -------------------------------------------------------------------------
   教材式流程：选模型 -> 填参数 -> 求解 -> 逐步摊开计算过程
   复用工程里既有的视觉语言：.card / .scen-tabs / .meth（可收纳步骤卡）/
   .verdict（结论）/ table.inv（数据表）/ table.inp（输入表）
   ========================================================================= */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function nv(id) { var e = $(id); return e ? e.value.trim() : ''; }
  function nnum(id) { var s = nv(id); return s === '' ? null : Number(s); }

  /* ---------------- 模型清单（按教材章节顺序） ---------------- */
  var MODELS = [
    { key: 'eoq', tab: '9.2 基本订货批量', name: '基本经济订货批量模型（EOQ）',
      sub: '不允许缺货 · 瞬时到货' },
    { key: 'short', tab: '9.3 允许缺货', name: '允许缺货的经济订货批量模型',
      sub: '缺货可补 · 缺货损失费 c₂' },
    { key: 'epq', tab: '9.4 陆续到货', name: '供货有限模型（经济生产批量 EPQ）',
      sub: '边产边耗 · 到货速率 p 有限' },
    { key: 'disc', tab: '9.5 批量折扣', name: '批量折扣模型',
      sub: '单价随批量阶梯下降' },
    { key: 'multi', tab: '9.6 多产品约束', name: '约束条件下的多产品库存模型',
      sub: '总资金 / 总库容上限 · 拉格朗日乘数法' }
  ];

  /* ---------------- 默认算例（点开就能直接求解） ---------------- */
  function defaults() {
    return {
      eoq: { D: '10000', c1: '4', c3: '200', K: '10' },
      short: { D: '10000', c1: '4', c2: '2', c3: '200', K: '10' },
      epq: { D: '10000', d: '40', p: '100', c1: '4', c3: '200', n: '250', K: '' },
      disc: {
        D: '5000', c3: '100', mode: 'rate', rate: '0.2', c1: '2',
        tiers: [{ lo: '0', K: '10' }, { lo: '500', K: '9.5' },
                { lo: '1000', K: '9' }, { lo: '2000', K: '8.5' }]
      },
      multi: {
        cons: 'capital', limit: '15000', basis: 'order',
        items: [
          { name: 'A', D: '10000', c1: '4', c3: '200', K: '10', v: '0.5' },
          { name: 'B', D: '5000', c1: '3', c3: '150', K: '15', v: '1' }
        ]
      }
    };
  }

  var saved = defaults();
  var cur = 'eoq';
  var lastRes = null;

  /* ---------------- 输入控件小工具 ---------------- */
  function row(id, sym, unit, val, ph) {
    return '<tr><td class="lbl">' + esc(sym) + '</td>'
      + '<td><input class="num" id="' + id + '" inputmode="decimal" autocomplete="off"'
      + ' aria-label="' + esc(sym + '（' + unit + '）') + '"'
      + ' placeholder="' + esc(ph === undefined ? '' : ph) + '" value="' + esc(val) + '"></td>'
      + '<td class="invunit">' + esc(unit) + '</td></tr>';
  }
  function seg(id, opts, onKey) {
    var h = '<div class="seg" id="' + id + '">';
    opts.forEach(function (o) {
      h += '<button type="button" data-k="' + o.k + '"'
        + (o.k === onKey ? ' class="on"' : '') + '>' + esc(o.t) + '</button>';
    });
    return h + '</div>';
  }
  function wireSeg(id, cb) {
    var box = $(id);
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(box.querySelectorAll('button'), function (x) {
          x.classList.toggle('on', x === b);
        });
        if (cb) cb(b.getAttribute('data-k'));
      });
    });
  }
  function segVal(id) {
    var box = $(id);
    if (!box) return null;
    var on = box.querySelector('button.on');
    return on ? on.getAttribute('data-k') : null;
  }

  /* ================= 各模型的输入表单 ================= */
  function formEOQ(s) {
    return '<div class="scroll"><table class="inp">'
      + row('if_D', 'D', '件/年', s.D, '10000')
      + row('if_c1', 'c1', '元/件·年', s.c1, '4')
      + row('if_c3', 'c3', '元/次', s.c3, '200')
      + row('if_K', 'K', '元/件（可空）', s.K, '可空')
      + '</table></div>';
  }

  function formShort(s) {
    return '<div class="scroll"><table class="inp">'
      + row('if_D', 'D', '件/年', s.D, '10000')
      + row('if_c1', 'c1', '元/件·年', s.c1, '4')
      + row('if_c2', 'c2', '元/件·年', s.c2, '2')
      + row('if_c3', 'c3', '元/次', s.c3, '200')
      + row('if_K', 'K', '元/件（可空）', s.K, '可空')
      + '</table></div>';
  }

  function formEPQ(s) {
    return '<div class="scroll"><table class="inp">'
      + row('if_D', 'D', '件/年', s.D, '10000')
      + row('if_d', 'd', '件/单位时间', s.d, '40')
      + row('if_p', 'p', '件/单位时间', s.p, '100')
      + row('if_c1', 'c1', '元/件·年', s.c1, '4')
      + row('if_c3', 'c3', '元/次', s.c3, '200')
      + row('if_n', 'n', '个/年（可空）', s.n, '如 250')
      + row('if_K', 'K', '元/件（可空）', s.K, '可空')
      + '</table></div>'
      + '<div class="sens-note"><b>n</b> 是「每年有多少个与 d、p 同口径的时间单位」'
      + '（d 按天计就填年工作日数 250 或自然日数 365，按月计填 12）。'
      + '填了就会强制校验 D = d × n；留空则只回显推算值 <b>D/d</b> 供你核对 —— '
      + '这个口径串了的话 Q* 会差 √n 倍。</div>';
  }

  function formDisc(s) {
    var h = '<div class="scroll"><table class="inp">'
      + row('if_D', 'D', '件/年', s.D, '5000')
      + row('if_c3', 'c3', '元/次', s.c3, '100')
      + '</table></div>';
    h += '<div class="lbl2">存贮费口径</div>'
      + seg('if_mode', [{ k: 'rate', t: '按存贮费率 i×K' }, { k: 'abs', t: '绝对存贮费 c₁' }], s.mode)
      + '<div class="scroll"><table class="inp">'
      + (s.mode === 'rate'
          ? row('if_rate', 'i', '存贮费率（如 0.2 表示 20%）', s.rate, '0.2')
          : row('if_c1a', 'c1', '元/件·年（各档相同）', s.c1, '2'))
      + '</table></div>';
    h += '<div class="lbl2">价格分档（下限递增，单价不升）</div>'
      + '<div class="scroll"><table class="inp" id="invDiscTbl">'
      + '<tr><th>档</th><th>下限 Q</th><th>单价 K</th></tr>'
      + discRowsHtml(s.tiers)
      + '</table></div>'
      + '<div class="ctrls">'
      + '<button type="button" class="btn" id="invDiscAdd">+ 一档</button>'
      + '<button type="button" class="btn" id="invDiscDel">− 一档</button>'
      + '</div>'
      + '<div class="sens-note">例如 <span class="mono">0 / 500 / 1000 / 2000</span> 配 '
      + '<span class="mono">10 / 9.5 / 9 / 8.5</span>：表示 0≤Q&lt;500 单价 10 元，'
      + '500≤Q&lt;1000 单价 9.5 元 …… 最后一档没有上限。</div>';
    return h;
  }
  function discRowsHtml(tiers) {
    var h = '';
    tiers.forEach(function (t, i) {
      var n = i + 1;
      h += '<tr><td class="lbl">' + n + '</td>'
        + '<td><input class="num" inputmode="decimal" data-f="lo"'
        + ' aria-label="第 ' + n + ' 档的分界点下限" value="' + esc(t.lo) + '"></td>'
        + '<td><input class="num" inputmode="decimal" data-f="K"'
        + ' aria-label="第 ' + n + ' 档的单价" value="' + esc(t.K) + '"></td></tr>';
    });
    return h;
  }

  function formMulti(s) {
    var h = '<div class="lbl2">约束类型</div>'
      + seg('if_cons', [{ k: 'capital', t: '总资金上限 W' }, { k: 'volume', t: '总库容上限 V' }], s.cons)
      + '<div class="scroll"><table class="inp">'
      + row('if_limit', 'W / V', '元 或 m³', s.limit, '15000')
      + '</table></div>'
      + '<div class="lbl2">资源计量口径</div>'
      + seg('if_basis', [{ k: 'order', t: '按最高存贮量 Q 计' }, { k: 'avg', t: '按平均存贮量 Q/2 计' }], s.basis)
      + '<div class="lbl2">产品参数</div>'
      + '<div class="scroll"><table class="inp" id="invMultiTbl">'
      + '<tr><th>产品</th><th>D</th><th>c₁</th><th>c₃</th><th>K</th><th>v</th></tr>'
      + multiRowsHtml(s.items)
      + '</table></div>'
      + '<div class="ctrls">'
      + '<button type="button" class="btn" id="invMultiAdd">+ 产品</button>'
      + '<button type="button" class="btn" id="invMultiDel">− 产品</button>'
      + '</div>'
      + '<div class="sens-note"><b>K</b> 是单位采购单价（资金约束用），'
      + '<b>v</b> 是单位物品占用库容（库容约束用）——两者都填，切换约束类型时不用重输。</div>';
    return h;
  }
  function multiRowsHtml(items) {
    var h = '';
    items.forEach(function (it, i) {
      var n = i + 1, a = '第 ' + n + ' 个产品的';
      h += '<tr><td><input class="num sm" data-f="name" aria-label="' + a + '名称"'
          + ' value="' + esc(it.name) + '"></td>'
        + '<td><input class="num" inputmode="decimal" data-f="D" aria-label="' + a + '年需求量 D"'
          + ' value="' + esc(it.D) + '"></td>'
        + '<td><input class="num" inputmode="decimal" data-f="c1" aria-label="' + a + '单位存贮费 c1"'
          + ' value="' + esc(it.c1) + '"></td>'
        + '<td><input class="num" inputmode="decimal" data-f="c3" aria-label="' + a + '每次订货费 c3"'
          + ' value="' + esc(it.c3) + '"></td>'
        + '<td><input class="num" inputmode="decimal" data-f="K" aria-label="' + a + '单位采购单价 K"'
          + ' value="' + esc(it.K) + '"></td>'
        + '<td><input class="num" inputmode="decimal" data-f="v" aria-label="' + a + '单位占用库容 v"'
          + ' value="' + esc(it.v) + '"></td></tr>';
    });
    return h;
  }

  function tableRows(tblId, field, cast) {
    var t = $(tblId);
    if (!t) return [];
    var out = [];
    Array.prototype.forEach.call(t.querySelectorAll('tr'), function (tr) {
      var ins = tr.querySelectorAll('input');
      if (!ins.length) return;
      var o = {};
      Array.prototype.forEach.call(ins, function (inp) {
        var f = inp.getAttribute('data-f');
        o[f] = (cast === 'text') ? inp.value.trim() : inp.value.trim();
      });
      out.push(o);
    });
    return out;
  }

  /* ================= 表单渲染与状态收集 ================= */
  var FORMS = { eoq: formEOQ, short: formShort, epq: formEPQ, disc: formDisc, multi: formMulti };

  function renderForm() {
    $('invForm').innerHTML = FORMS[cur](saved[cur]);
    if (cur === 'disc') {
      wireSeg('if_mode', function () { saveForm(); renderForm(); });
      $('invDiscAdd').addEventListener('click', function () { saveForm(); saved.disc.tiers.push({ lo: '', K: '' }); renderForm(); });
      $('invDiscDel').addEventListener('click', function () {
        saveForm();
        if (saved.disc.tiers.length > 1) saved.disc.tiers.pop();
        renderForm();
      });
    }
    if (cur === 'multi') {
      $('invMultiAdd').addEventListener('click', function () {
        saveForm();
        if (saved.multi.items.length < 6) saved.multi.items.push({ name: '', D: '', c1: '', c3: '', K: '', v: '' });
        renderForm();
      });
      $('invMultiDel').addEventListener('click', function () {
        saveForm();
        if (saved.multi.items.length > 1) saved.multi.items.pop();
        renderForm();
      });
    }
    if (window.addScrollHints) addScrollHints(document);
  }

  function saveForm() {
    var s = saved[cur];
    if (cur === 'eoq') {
      s.D = nv('if_D'); s.c1 = nv('if_c1'); s.c3 = nv('if_c3'); s.K = nv('if_K');
    } else if (cur === 'short') {
      s.D = nv('if_D'); s.c1 = nv('if_c1'); s.c2 = nv('if_c2');
      s.c3 = nv('if_c3'); s.K = nv('if_K');
    } else if (cur === 'epq') {
      s.D = nv('if_D'); s.d = nv('if_d'); s.p = nv('if_p');
      s.c1 = nv('if_c1'); s.c3 = nv('if_c3'); s.n = nv('if_n'); s.K = nv('if_K');
    } else if (cur === 'disc') {
      s.D = nv('if_D'); s.c3 = nv('if_c3');
      s.mode = segVal('if_mode') || s.mode;
      /* 两个口径的输入框只会渲染其中一个，所以要判断元素是否存在，
         否则切一次口径就会把另一个框的值清成空字符串 */
      if ($('if_rate')) s.rate = nv('if_rate');
      if ($('if_c1a')) s.c1 = nv('if_c1a');
      s.tiers = tableRows('invDiscTbl');
    } else if (cur === 'multi') {
      s.limit = nv('if_limit');
      s.cons = segVal('if_cons') || s.cons;
      s.basis = segVal('if_basis') || s.basis;
      s.items = tableRows('invMultiTbl');
    }
  }

  /* ================= 求解 ================= */
  var BANNER = { err: null };

  function banner(msg, kind) {
    if (!msg) { $('invBanners').innerHTML = ''; return; }
    $('invBanners').innerHTML = '<div class="banner ' + (kind || 'err') + '">' + esc(msg) + '</div>';
  }

  function solve() {
    lastRes = null;
    var res;
    if (cur === 'eoq') {
      res = invEOQ({ D: nv('if_D'), c1: nv('if_c1'), c3: nv('if_c3'), K: nv('if_K') });
    } else if (cur === 'short') {
      res = invShortage({ D: nv('if_D'), c1: nv('if_c1'), c2: nv('if_c2'),
                          c3: nv('if_c3'), K: nv('if_K') });
    } else if (cur === 'epq') {
      res = invEPQ({ D: nv('if_D'), d: nv('if_d'), p: nv('if_p'), c1: nv('if_c1'),
                     c3: nv('if_c3'), n: nv('if_n'), K: nv('if_K') });
    } else if (cur === 'disc') {
      var mode = segVal('if_mode') || 'rate';
      var tiers = tableRows('invDiscTbl');
      res = invDiscount({ D: nv('if_D'), c3: nv('if_c3'), mode: mode,
                          rate: nv('if_rate'), c1: nv('if_c1a'), tiers: tiers });
    } else {
      var cons = segVal('if_cons') || 'capital';
      res = invMulti({ items: tableRows('invMultiTbl'), constraint: cons,
                       limit: nv('if_limit'),
                       averageBasis: (segVal('if_basis') === 'avg') });
    }
    if (!res || res.ok !== true) {
      banner((res && res.message) || '求解失败。');
      $('invOut').innerHTML = '';
      return;
    }
    banner('');
    lastRes = res;
    $('invOut').innerHTML = RENDER[cur](res);
    if (window.addScrollHints) addScrollHints(document);
  }

  /* ================= 结果渲染小工具 ================= */
  function step(idx, title, body) {
    return '<details class="meth" open>'
      + '<summary class="meth-h">'
      + '<span class="meth-i">' + idx + '</span>'
      + '<span class="meth-n">' + esc(title) + '</span>'
      + '<span class="meth-x"></span>'
      + '</summary><div class="meth-body">' + body + '</div></details>';
  }
  function verdict(title, lines) {
    var h = '<div class="verdict opt"><div class="vtitle">' + esc(title) + '</div>';
    lines.forEach(function (l) { h += '<div class="sol">' + l + '</div>'; });
    return h + '</div>';
  }
  function note(t) { return '<div class="sens-note">' + t + '</div>'; }
  function warn(t) { return '<div class="sens-warn">' + t + '</div>'; }
  function kv(k, v) {
    return '<tr><td class="nm">' + k + '</td><td class="cur"><b>' + v + '</b></td></tr>';
  }
  function tbl(head, rows) {
    return '<div class="scroll"><table class="inv"><tr>'
      + head.map(function (x) { return '<th>' + x + '</th>'; }).join('')
      + '</tr>' + rows + '</table></div>';
  }
  function eq(s) {
    return '<div class="eqbox">' + s + '</div>';
  }

  /* ================= 9.2 EOQ ================= */
  function renderEOQ(r) {
    var h = verdict('最优订货批量 Q* = ' + invNum(r.Q) + ' 件', [
      '最优订货周期 T* = <span class="zv">' + invNum(r.T) + '</span> 年'
        + '（约 ' + invNum(r.T * 365) + ' 天）　年订货次数 ' + invNum(r.orderTimes) + ' 次',
      '单位时间最小总费用 C* = <span class="zv">' + invNum(r.C) + '</span> 元/年'
    ]);
    h += step(1, '目标函数与求导', eq(
      'C(Q) = (D/Q)·c<sub>3</sub> + (Q/2)·c<sub>1</sub><br>'
      + '&nbsp;&nbsp;&nbsp;&nbsp;= (' + invNum(r.D) + '/Q)×' + invNum(r.c3)
      + ' + (Q/2)×' + invNum(r.c1) + '<br><br>'
      + 'dC/dQ = −D·c<sub>3</sub>/Q² + c<sub>1</sub>/2 = 0'
      + '　⇒　Q² = 2·D·c<sub>3</sub>/c<sub>1</sub><br>'
      + 'Q* = √(2×' + invNum(r.D) + '×' + invNum(r.c3) + '/' + invNum(r.c1)
      + ') = <b>' + invNum(r.Q) + '</b>')
      + note('C(Q) 的前一项是<b>订货费</b>：一年订 D/Q 次、每次 c₃；'
        + '后一项是<b>存贮费</b>：库存在一个周期内从 Q 线性降到 0，平均存贮量就是 Q/2。'));
    h += step(2, '结果指标', tbl(['指标', '数值', '单位'], ''
      + kv('最优订货批量 Q*', invNum(r.Q) + '</td><td class="cur">件')
      + kv('最优订货周期 T*', invNum(r.T) + '</td><td class="cur">年')
      + kv('年订货次数 D/Q*', invNum(r.orderTimes) + '</td><td class="cur">次/年')
      + kv('最高存贮量（瞬时到货）', invNum(r.maxInv) + '</td><td class="cur">件')
      + kv('平均存贮量 Q*/2', invNum(r.avgInv) + '</td><td class="cur">件')
      + kv('最小总费用 C*', invNum(r.C) + '</td><td class="cur">元/年')));
    var rows = ''
      + kv('年订货费 (D/Q*)·c₃', invNum(r.costOrder) + '</td><td class="cur">元/年')
      + kv('年存贮费 (Q*/2)·c₁', invNum(r.costHold) + '</td><td class="cur">元/年');
    if (r.costPurchase !== null) {
      rows += kv('年采购成本 D·K', invNum(r.costPurchase) + '</td><td class="cur">元/年')
        + kv('年总费用（含采购）', invNum(r.costTotal) + '</td><td class="cur">元/年');
    }
    h += step(3, '费用构成', tbl(['项目', '数值', '单位'], rows)
      + note('核对面：最优处 <b>订货费 = 存贮费</b>，各占 C* 的一半（'
        + invNum(r.costOrder) + ' = ' + invNum(r.costHold) + '）。'
        + '这是 EOQ 最有用的自检性质 —— 手算完发现两项不相等，一定是算错了。'));
    h += step(4, '解读', note(
      '两种费用此消彼长：Q 偏小则订得太频繁、订货费↑；Q 偏大则库存积压、存贮费↑，'
      + 'Q* 是唯一的平衡点。<br>'
      + (r.costPurchase !== null
        ? '注意 <b>D·K 是常数</b>，不随 Q 变化，所以它不影响 Q* 与 T*，只影响总费用。'
        : '')));
    return h;
  }

  /* ================= 9.3 允许缺货 ================= */
  function renderShort(r) {
    var h = verdict('最优订货批量 Q* = ' + invNum(r.Q) + ' 件', [
      '最高存贮量 S* = <span class="zv">' + invNum(r.S) + '</span> 件　'
        + '最大缺货量 B* = <span class="zv">' + invNum(r.B) + '</span> 件',
      '最小总费用 C* = <span class="zv">' + invNum(r.C) + '</span> 元/年'
        + '　缺货期占比 ' + invPct(r.shortageRatio)
    ]);
    h += step(1, '两个决策变量：Q 与 S', note(
      '一次订 Q 件，到货后先补上一周期的欠货，剩下的才是最高存贮量 S；'
      + '最大缺货量 B = Q − S。周期 T = Q/D 分为存贮期 t₁ = S/D 与缺货期 t₂ = B/D。<br>'
      + 'C(Q,S) = c₃·D/Q + c₁·S²/(2Q) + c₂·B²/(2Q)'));
    h += step(2, '① 先对 S 求偏导', eq(
      '∂C/∂S = c₁·S/Q − c₂·(Q−S)/Q = 0<br>'
      + '⇒ c₁·S = c₂·(Q−S)　⇒　S* = c₂/(c₁+c₂)·Q'
      + '　= ' + invNum(r.c2) + '/(' + invNum(r.c1) + '+' + invNum(r.c2) + ')×Q'
      + ' = ' + invNum(r.c2 / (r.c1 + r.c2)) + '·Q<br>'
      + '⇒ B* = Q − S* = c₁/(c₁+c₂)·Q = ' + invNum(r.c1 / (r.c1 + r.c2)) + '·Q')
      + note('这一步的含义：最优时<b>每多存一件的存贮费</b>与<b>每少存一件的缺货损失</b>'
        + '恰好相等，所以 S 由 c₁、c₂ 的比值决定，与 Q 无关。'));
    h += step(3, '② 代回后对 Q 求导',
      eq('Q* = √( 2·D·c₃·(c₁+c₂) / (c₁·c₂) )<br>'
        + '&nbsp;&nbsp;&nbsp;= √( 2×' + invNum(r.D) + '×' + invNum(r.c3)
        + '×(' + invNum(r.c1) + '+' + invNum(r.c2) + ')/(' + invNum(r.c1)
        + '×' + invNum(r.c2) + ') ) = <b>' + invNum(r.Q) + '</b>')
      + tbl(['指标', '数值', '单位'], ''
        + kv('最优订货批量 Q*', invNum(r.Q) + '</td><td class="cur">件')
        + kv('最高存贮量 S*', invNum(r.S) + '</td><td class="cur">件')
        + kv('最大缺货量 B*', invNum(r.B) + '</td><td class="cur">件')
        + kv('最优订货周期 T*', invNum(r.T) + '</td><td class="cur">年')
        + kv('存贮期 t₁ = S*/D', invNum(r.tStock) + '</td><td class="cur">年')
        + kv('缺货期 t₂ = B*/D', invNum(r.tShort) + '</td><td class="cur">年')
        + kv('缺货期占比 B*/Q*', invPct(r.shortageRatio) + '</td><td class="cur">')
        + kv('平均存贮量 S*²/(2Q*)', invNum(r.avgInv) + '</td><td class="cur">件')
        + kv('平均缺货量 B*²/(2Q*)', invNum(r.avgShort) + '</td><td class="cur">件')
        + kv('最小总费用 C*', invNum(r.C) + '</td><td class="cur">元/年')));
    var rows = ''
      + kv('订货费 (D/Q*)·c₃', invNum(r.costOrder) + '</td><td class="cur">元/年')
      + kv('存贮费', invNum(r.costHold) + '</td><td class="cur">元/年')
      + kv('缺货损失费', invNum(r.costShort) + '</td><td class="cur">元/年');
    if (r.costPurchase !== null) {
      rows += kv('年采购成本 D·K', invNum(r.costPurchase) + '</td><td class="cur">元/年')
        + kv('年总费用（含采购）', invNum(r.costTotal) + '</td><td class="cur">元/年');
    }
    h += step(4, '费用构成与「为什么愿意缺货」', tbl(['项目', '数值', '单位'], rows)
      + tbl(['与不允许缺货（9.2）对照', '数值', '单位'], ''
        + kv('9.2 的 Q*', invNum(r.eoqQ) + '</td><td class="cur">件')
        + kv('9.2 的最小费用', invNum(r.eoqC) + '</td><td class="cur">元/年')
        + kv('本模型 Q* 的放大倍数', invNum(r.qRatio) + '</td><td class="cur">倍')
        + kv('费用节约', invNum(r.saving) + '</td><td class="cur">元/年'))
      + note('缺货损失 c₂ 越小（顾客越愿意等），越值得把批量加大、库存压低，'
        + '用「缺货」替代「存货」。<b>c₂ → ∞ 时全部还原为 9.2 的 EOQ</b>。<br>'
        + '方向别记反：c₂ ↑ 时 Q* ↓、S* ↑、<b>C* ↑</b>（上限就是 EOQ 的费用）'
        + '—— 允许缺货只会省钱，最坏也不过回到 EOQ。'));
    return h;
  }

  /* ================= 9.4 陆续到货 ================= */
  function renderEPQ(r) {
    var h = verdict('最优生产批量 Q* = ' + invNum(r.Q) + ' 件', [
      '最高存贮量 S* = <span class="zv">' + invNum(r.S) + '</span> 件　'
        + '生产周期 T* = <span class="zv">' + invNum(r.T) + '</span> 个时间单位',
      '单位时间最小总费用 C* = <span class="zv">' + invNum(r.C) + '</span> 元/年'
    ]);
    h += step(1, '单位口径校验（本节最容易错的地方）', tbl(['项目', '数值', '说明'], ''
      + kv('由 D/d 推得的每年时间单位数', invNum(r.n, 4)
        + '</td><td class="cur">' + (r.nGiven !== null ? '与你填的 n 一致 ✓ 已校验' : '供你核对') + '')
      + kv('需求/生产比 ρ = d/p', invNum(r.rho) + '</td><td class="cur">到货速度是消耗速度的 '
        + invNum(1 / r.rho, 3) + ' 倍'))
      + note('D、d、p 必须<b>同一时间口径</b>，自洽条件是 D = d × n。'
        + '口径串了 Q* 会差 √n 倍 —— 例如 D 用年需求、d 用日需求率却忘了折算 250 个工作日，'
        + 'Q* 会差 √250 ≈ 15.8 倍。'));
    if (r.warns && r.warns.length) h += warn(r.warns.join('<br>'));
    h += step(2, '库存变化过程（一个周期内）', eq(
      '① 生产期 t<sub>p</sub> = Q/p = ' + invNum(r.Q) + '/' + invNum(r.p)
      + ' = ' + invNum(r.tProduce) + '：库存以 (p−d) 上升<br>'
      + '&nbsp;&nbsp;&nbsp;期末达到最高存贮量 S = (p−d)·t<sub>p</sub>'
      + ' = (1−d/p)·Q = <b>' + invNum(r.S) + '</b><br>'
      + '② 纯消耗期 t<sub>c</sub> = S/d = ' + invNum(r.tConsume)
      + '：库存以 d 下降，降到 0 时下一批到货<br>'
      + '周期 T = t<sub>p</sub> + t<sub>c</sub> = Q/d = ' + invNum(r.T))
      + note('平均存贮量 = S/2 = ' + invNum(r.avgInv)
        + ' 件 —— 库存曲线是一个三角形（上升段 + 下降段），平均高度就是峰值的一半。'));
    h += step(3, '目标函数与结果', eq(
      'C(Q) = (D/Q)·c₃ + (1−d/p)·Q·c₁/2<br>'
      + 'Q* = √( 2·D·c₃ / ((1−d/p)·c₁) )<br>'
      + '&nbsp;&nbsp;&nbsp;= √( 2×' + invNum(r.D) + '×' + invNum(r.c3) + ' / ('
      + invNum(r.oneMinusRho) + '×' + invNum(r.c1) + ') ) = <b>' + invNum(r.Q) + '</b>')
      + tbl(['指标', '数值', '单位'], ''
        + kv('最优生产批量 Q*', invNum(r.Q) + '</td><td class="cur">件')
        + kv('最高存贮量 S*', invNum(r.S) + '</td><td class="cur">件')
        + kv('平均存贮量 S*/2', invNum(r.avgInv) + '</td><td class="cur">件')
        + kv('生产周期 T* = Q*/d', invNum(r.T) + '</td><td class="cur">个时间单位')
        + kv('生产期 t_p = Q*/p', invNum(r.tProduce) + '</td><td class="cur">个时间单位')
        + kv('纯消耗期 t_c', invNum(r.tConsume) + '</td><td class="cur">个时间单位')
        + kv('生产次数 D/Q*', invNum(r.produceTimes) + '</td><td class="cur">次/年')
        + kv('最小总费用 C*', invNum(r.C) + '</td><td class="cur">元/年'))
      + tbl(['费用构成', '数值', '单位'], ''
        + kv('年订货(准备)费 (D/Q*)·c₃', invNum(r.costOrder) + '</td><td class="cur">元/年')
        + kv('年存贮费 (S*/2)·c₁', invNum(r.costHold) + '</td><td class="cur">元/年')));
    h += step(4, '解读', note(
      '与 9.2（瞬时到货）相比，同样的 c₁、c₃ 下 <b>Q* 更大</b>：因为边产边耗，'
      + '库存涨得慢，同样批量占用更少仓容，所以值得「多订一点」来摊薄订货费。<br>'
      + '退化一致性：令 p → ∞ 则 (1−d/p) → 1，公式还原为 EOQ。'
      + '本题若取 p → ∞，Q* 会是 ' + invNum(r.eoqIfInfinite) + ' 件。'));
    return h;
  }

  /* 可行性判定：表里只放短标签，完整理由放在表下的说明里 —— 手机上表格太挤，
     一整句话塞进单元格会把表撑得很难读 */
  function shortStatus(t) {
    if (t.candidate === null) return '无候选（属下一档）';
    if (Math.abs(t.candidate - t.eoq) < 1e-9) return '可行，取 Qᵢ*';
    return 'Qᵢ* < 下限，取左端点';
  }

  /* ================= 9.5 批量折扣 ================= */
  function renderDisc(r) {
    var h = verdict('全局最优订货批量 Q* = ' + invNum(r.Q) + ' 件', [
      '适用单价 K* = <span class="zv">' + invNum(r.K) + '</span> 元/件'
        + '（第 ' + r.bestBracket + ' 档）　年订货次数 ' + invNum(r.orderTimes) + ' 次',
      '年最小总费用 C* = <span class="zv">' + invNum(r.costTotal) + '</span> 元/年'
    ]);
    var tierRows = '';
    r.tiers.forEach(function (t) {
      tierRows += kv('第 ' + t.index + ' 档：' + invNum(t.lo) + ' ≤ Q < '
        + (t.hi === null ? '∞' : invNum(t.hi)),
        invNum(t.K) + ' 元/件</td><td class="cur">c₁ = ' + invNum(t.c1));
    });
    h += step(1, '价格分档与各档存贮费', tbl(['价格区间', '单价', '该档存贮费'], tierRows)
      + note(r.mode === 'rate'
        ? '存贮费按<b>单价 × 存贮费率</b>计：c₁ᵢ = ' + invNum(r.rate) + ' × Kᵢ，'
          + '所以各档的 c₁ 不同（单价越贵、存贮费越高）。'
        : '存贮费是<b>绝对额</b>，各档相同 → 各档的 Qᵢ* 会是同一个数。'));

    var rows2 = '';
    r.tiers.forEach(function (t) {
      rows2 += '<tr><td class="nm">第 ' + t.index + ' 档</td>'
        + '<td>' + invNum(t.eoq) + '</td>'
        + '<td>' + (t.hi === null ? '—' : invNum(t.hi)) + '</td>'
        + '<td class="st' + (t.candidate === null ? ' no' : '') + '">'
        + esc(shortStatus(t)) + '</td>'
        + '<td>' + (t.candidate === null ? '无候选' : invNum(t.candidate)) + '</td></tr>';
    });
    h += step(2, '① 逐档计算 Qᵢ*，② 可行性校验', tbl(
      ['档位', 'Qᵢ* = √(2Dc₃/c₁ᵢ)', '本档上限', '可行性', '本档候选批量'], rows2)
      + note('本档内费用是凸的：Qᵢ* 落在区间内就直接取它；'
        + 'Qᵢ* 小于下限说明本档内费用递增，取左端点；'
        + 'Qᵢ* 超出上限说明本档内费用递减，最低点在右端点 —— '
        + '而右端点按「达到即享受」属下一档，所以本档不产生候选。'));

    var rows3 = '';
    var feas = r.tiers.filter(function (t) { return t.candidate !== null; });
    feas.sort(function (a, b) { return a.costTotal - b.costTotal; });
    feas.forEach(function (t) {
      rows3 += '<tr' + (t.index === r.bestBracket ? ' class="best"' : '') + '>'
        + '<td class="nm">第 ' + t.index + ' 档</td>'
        + '<td>' + invNum(t.candidate) + '</td>'
        + '<td>' + invNum(t.costHold) + '</td>'
        + '<td>' + invNum(t.costOrder) + '</td>'
        + '<td>' + invNum(t.costPurchase) + '</td>'
        + '<td>' + invNum(t.costTotal) + '</td></tr>';
    });
    h += step(3, '③ 各候选点总费用比较', tbl(
      ['档位', '候选批量', '存贮费', '订货费', '采购费', '合计'], rows3)
      + warn('<b>必须计入采购费 D·K</b> —— 它在每一档内是常数（不影响 Qᵢ*），'
        + '但随档位跳变。只比存贮费 + 订货费会得出错误结论。'));
    h += step(4, '结论与折扣区间选择说明',
      tbl(['最终结果', '数值', '单位'], ''
        + kv('全局最优批量 Q*', invNum(r.Q) + '</td><td class="cur">件')
        + kv('适用单价 K*', invNum(r.K) + '</td><td class="cur">元/件')
        + kv('年存贮费', invNum(r.costHold) + '</td><td class="cur">元/年')
        + kv('年订货费', invNum(r.costOrder) + '</td><td class="cur">元/年')
        + kv('年采购费', invNum(r.costPurchase) + '</td><td class="cur">元/年')
        + kv('年最小总费用 C*', invNum(r.costTotal) + '</td><td class="cur">元/年')
        + kv('年订货次数', invNum(r.orderTimes) + '</td><td class="cur">次/年'))
      + (r.atBoundary
        ? note('最优解落在第 ' + r.bestBracket + ' 档的<b>价格分界点</b>上，'
          + '而不是该档的 EOQ（' + invNum(r.tiers[r.bestBracket - 1].eoq) + '）。'
          + '这正是折扣模型最典型、也最容易被漏掉的情形：'
          + '<b>最优解常常不是 EOQ，而是某个价格分界点</b>。')
        : note('该档内 Qᵢ* 自身可行，直接取 Qᵢ* 即可。'))
      + note('对照：若完全不考虑折扣（按第 1 档单价），EOQ = '
        + invNum(r.eoqNoDiscount) + ' 件，但那样要按 ' + invNum(r.tiers[0].K)
        + ' 元/件采购，总费用反而更高。'));
    return h;
  }

  /* ================= 9.6 多产品约束 ================= */
  function renderMulti(r) {
    var isCap = (r.constraint === 'capital');
    var unit = isCap ? '元' : 'm³';
    var h = verdict('各产品最优订货量（λ* = ' + invNum(r.lambda, 8) + '）', [
      r.items.map(function (it) {
        return it.name + ' = <span class="zv">' + invNum(it.Q) + '</span> 件';
      }).join('　　'),
      '最小总存贮费用 Σ = <span class="zv">' + invNum(r.total) + '</span> 元/年'
        + '　资源占用 ' + invNum(r.resourceUsed) + ' / ' + invNum(r.limit) + ' ' + unit
        + '（' + invPct(r.resourceUsed / r.limit) + '）'
    ]);
    var irows = '';
    r.items.forEach(function (it) {
      irows += '<tr><td class="nm">' + esc(it.name) + '</td>'
        + '<td>' + invNum(it.D) + '</td><td>' + invNum(it.c1) + '</td>'
        + '<td>' + invNum(it.c3) + '</td><td>' + invNum(it.g) + '</td>'
        + '<td>' + invNum(it.eoq) + '</td></tr>';
    });
    h += step(1, '已知参数与无约束 EOQ', tbl(
      ['产品', 'D', 'c₁', 'c₃', '单位占用 ' + (isCap ? 'K' : 'v'), '无约束 EOQ'], irows)
      + note('资源计量口径：按' + (r.averageBasis ? '<b>平均存贮量 Q/2</b>' : '<b>最高存贮量 Q</b>')
        + '计，所以约束写成 Σ' + (isCap ? 'Kᵢ' : 'vᵢ') + '·Qᵢ'
        + (r.averageBasis ? '/2' : '') + ' ≤ ' + invNum(r.limit) + ' ' + unit + '。'));

    var q0 = '', use0 = 0;
    /* λ=0 试探的展示：直接用无约束 EOQ 的资源占用 */
    r.items.forEach(function (it) {
      var gEff = r.averageBasis ? it.g / 2 : it.g;
      use0 += gEff * it.eoq;
    });
    q0 = invNum(use0);
    h += step(2, '第一步：先试 λ = 0，看约束是否起作用', eq(
      '各产品取无约束 EOQ 时，资源占用 = ' + q0 + ' ' + unit + '<br>'
      + (r.binding
        ? '&gt; 上限 ' + invNum(r.limit) + ' ' + unit + '　⇒　<b>约束被突破，λ* &gt; 0</b>，'
          + '需按拉格朗日乘数重新分配批量。'
        : '≤ 上限 ' + invNum(r.limit) + ' ' + unit + '　⇒　<b>约束自然满足，λ* = 0</b>，'
          + '资源不构成瓶颈，各产品取无约束 EOQ 即可。')));
    if (!r.binding) {
      h += step(3, '结果（约束不起作用）', tbl(['产品', 'Qᵢ*', '资源占用', '费用合计', '较 EOQ'], (function () {
        var s = '';
        r.items.forEach(function (it) {
          s += '<tr><td class="nm">' + esc(it.name) + '</td><td>' + invNum(it.Q)
            + '</td><td>' + invNum(it.resourceUsed) + '</td><td>' + invNum(it.costTotal)
            + '</td><td>0</td></tr>';
        });
        return s;
      })())
        + note('λ* = 0 的含义：该项资源还有富余，不必为了省费用去压缩批量。'));
      return h;
    }

    h += step(3, '第二步：拉格朗日函数与一阶条件', eq(
      'min Σ( aᵢ/Qᵢ + bᵢ·Qᵢ )　s.t. Σ gᵢ·Qᵢ ≤ R<br>'
      + '&nbsp;&nbsp;其中 aᵢ = c₃ᵢ·Dᵢ，bᵢ = c₁ᵢ/2<br><br>'
      + 'L = Σ(aᵢ/Qᵢ + bᵢ·Qᵢ) + λ(ΣgᵢQᵢ − R)<br>'
      + '∂L/∂Qᵢ = −aᵢ/Qᵢ² + bᵢ + λ·gᵢ = 0<br>'
      + '⇒ <b>Qᵢ(λ) = √( aᵢ/(bᵢ + λ·gᵢ) ) = √( 2·c₃ᵢ·Dᵢ / (c₁ᵢ + 2λ·gᵢ) )</b>')
      + note('λ = 0 时 Qᵢ(0) 就是各产品的独立 EOQ；λ 越大批量被压得越小。'));

    var trows = '';
    var tr = r.trace;
    var show = (tr.length <= 14) ? tr : tr.slice(0, 7).concat(tr.slice(tr.length - 7));
    show.forEach(function (t, i) {
      if (tr.length > 14 && i === 7) trows += '<tr><td class="nm">…</td><td>…</td><td>…</td></tr>';
      trows += '<tr><td class="nm">' + t.iter + '</td><td>' + invNum(t.lam, 10)
        + '</td><td>' + invNum(t.use, 6) + '</td><td>' + invNum(t.use - r.limit, 6) + '</td></tr>';
    });
    h += step(4, '第三步：二分法迭代求 λ*', tbl(
      ['迭代', 'λ', '资源占用 ΣgᵢQᵢ(λ)', '与上限之差'], trows)
      + note('ΣgᵢQᵢ(λ) 关于 λ <b>严格单调递减</b>（λ 越大、批量越小、占用越少），'
        + '所以可以二分求根。收敛值 λ* = <b>' + invNum(r.lambda, 8) + '</b>，'
        + '共迭代 ' + r.trace.length + ' 次。'));

    var frows = '';
    r.items.forEach(function (it) {
      frows += '<tr><td class="nm">' + esc(it.name) + '</td>'
        + '<td>' + invNum(it.Q) + '</td>'
        + '<td>' + invNum(it.resourceUsed) + '</td>'
        + '<td>' + invNum(it.costHold) + '</td>'
        + '<td>' + invNum(it.costOrder) + '</td>'
        + '<td>' + invNum(it.costTotal) + '</td>'
        + '<td>' + (it.shrink > 1e-9 ? '−' + invPct(it.shrink, 1) : '—') + '</td></tr>';
    });
    var sumHold = 0, sumOrd = 0;
    r.items.forEach(function (it) { sumHold += it.costHold; sumOrd += it.costOrder; });
    frows += '<tr class="best"><td class="nm">合计</td><td>—</td><td>'
      + invNum(r.resourceUsed) + '</td><td>' + invNum(sumHold) + '</td><td>'
      + invNum(sumOrd) + '</td><td>' + invNum(r.total) + '</td><td>—</td></tr>';
    h += step(5, '最终结果', tbl(
      ['产品', 'Qᵢ*', '资源占用', '存贮费', '订货费', '费用合计', '较 EOQ'], frows)
      + tbl(['全局指标', '数值', '单位'], ''
        + kv('拉格朗日乘数 λ*', invNum(r.lambda, 8) + '</td><td class="cur">'
          + (isCap ? '1/年' : '元/(m³·年)'))
        + kv('约束是否起作用', (r.binding ? '起作用（取等号）' : '不起作用（有余量）')
          + '</td><td class="cur">')
        + kv('资源实际占用', invNum(r.resourceUsed) + '</td><td class="cur">' + unit)
        + kv('上限 / 余量', invNum(r.limit) + ' / '
          + (Math.abs(r.slack) <= 1e-6 * r.limit ? '0（取等号）' : invNum(r.slack))
          + '</td><td class="cur">' + unit)
        + kv('最小总存贮费用 Σ', invNum(r.total) + '</td><td class="cur">元/年')
        + kv('无约束时总费用', invNum(r.totalUncon) + '</td><td class="cur">元/年')
        + kv('因约束多付的费用', invNum(r.extra) + '（+'
          + invPct(r.extra / r.totalUncon) + '）</td><td class="cur">元/年')));
    h += step(6, '解读', note(
      '约束把每种产品的批量都<b>压小</b>了，费用随之上升；各产品被压的程度不同 —— '
      + '单位资源占用越大（' + (isCap ? '单价越高' : '体积越大')
      + '）、被压得越狠。<br><br>'
      + '<b>λ* 就是这项资源的影子价格</b>：资源上限每放宽 1 ' + unit
      + '，总费用可下降 ' + invNum(r.lambda, 6) + ' 元/年。'
      + '所以如果放宽额度的成本低于这个数，就值得去争取更多资源。<br><br>'
      + '约束只让费用上升了 ' + invPct(r.extra / r.totalUncon)
      + '，幅度不大 —— 因为费用函数在最优点附近很平坦，批量挪开一点费用几乎不变。'));
    return h;
  }

  var RENDER = { eoq: renderEOQ, short: renderShort, epq: renderEPQ,
                 disc: renderDisc, multi: renderMulti };

  /* ================= 初始化 ================= */
  function buildTabs() {
    var h = '<h2 class="sec">选择模型</h2><div class="scen-tabs" id="invTabs">';
    MODELS.forEach(function (m) {
      h += '<button type="button" data-k="' + m.key + '"'
        + (m.key === cur ? ' class="on"' : '') + '>' + esc(m.tab) + '</button>';
    });
    $('invTabsWrap').innerHTML = h + '</div>';
    Array.prototype.forEach.call($('invTabs').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        saveForm();
        cur = b.getAttribute('data-k');
        Array.prototype.forEach.call($('invTabs').querySelectorAll('button'), function (x) {
          x.classList.toggle('on', x.getAttribute('data-k') === cur);
        });
        banner('');
        $('invOut').innerHTML = '';
        setHead();
        renderForm();
      });
    });
  }

  function setHead() {
    var m = null;
    MODELS.forEach(function (x) { if (x.key === cur) m = x; });
    $('invTitle').textContent = m.name;
    $('invSub').textContent = m.sub;
  }

  function init() {
    if (!$('mod-inv')) return;
    buildTabs();
    setHead();
    renderForm();
    $('invSolveBtn').addEventListener('click', solve);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
