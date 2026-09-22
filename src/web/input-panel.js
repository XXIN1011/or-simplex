/* =========================================================================
   可复用的「线性规划输入表」组件
   -------------------------------------------------------------------------
   单纯形法与灵敏度分析两个模块都要输入线性规划，所以把输入表抽成一份实现、各自
   挂到不同元素上。逻辑与原 ui.js 里那段完全一致 —— 元素 id 保持不变的那个模块，
   表现也就完全不变（回归脚本依赖这些 id）。
   ========================================================================= */
'use strict';

var dom = require('./dom.js');
var esc = dom.esc;

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

/* =========================================================================
   输入区「外壳」的生成：方向段控 + 输入表容器 + 四个增减按钮
   -------------------------------------------------------------------------
   这四样东西在四个模块里长得一模一样，只有 id 前缀、按钮文案和表格类名不同。
   以前它们是四段几乎逐行相同的 HTML 抄在 template.html 里（46 个 id 里有 24 个
   是这种副本）——改一处（比如换按钮文案、加个 aria）就得改四处，漏一处就不一致。

   现在模板里每个模块只留一个挂载点（如 <div id="simplexPanel"></div>），
   由调用方给一份配置，这里统一生成。**生成的 id / class / data-* 与原来逐字一致**
   （回归脚本与截图都依赖这些 id，例如 `#dirSeg button[data-dir="min"]`）。

   cfg 追加字段：
     mount     'simplexPanel'   外壳插进哪个元素；不给就沿用模板里已有的静态外壳
     tblClass  'inp' / 'inp mtx' 输入表的类（指派问题的矩阵多一个 mtx）
     dirOrder  ['max','min']    段控顺序（指派问题默认 min 在前）
     labels    { addVar, delVar, addCon, delCon } 四个按钮的文案
   ========================================================================= */
var DEFAULT_LABELS = { addVar: '+ 变量', delVar: '− 变量', addCon: '+ 约束', delCon: '− 约束' };

function buildChrome(cfg) {
  if (!cfg.mount) return;                       // 没给挂载点：模板里已有静态外壳
  var mount = document.getElementById(cfg.mount);
  if (!mount) throw new Error('输入区挂载点 #' + cfg.mount + ' 不在页面上');

  var state = cfg.state || {};
  var order = cfg.dirOrder || ['max', 'min'];
  /* 初始高亮要与 state.dir 一致：模板版靠手写 class="on"，这里由状态推出来，
     少一个「改了默认方向忘了改 HTML」的坑。 */
  var on = (order.indexOf(state.dir) >= 0) ? state.dir : order[0];
  var L = cfg.labels || DEFAULT_LABELS;

  var html = '<div class="seg" id="' + cfg.dirSeg + '">';
  for (var i = 0; i < order.length; i++) {
    html += '<button type="button" data-dir="' + order[i] + '"'
      + (order[i] === on ? ' class="on"' : '') + '>' + order[i] + '</button>';
  }
  html += '</div>'
    + '<div class="scroll"><table class="' + (cfg.tblClass || 'inp') + '" id="' + cfg.tbl + '"></table></div>'
    + '<div class="ctrls">'
    + '<button type="button" class="btn" id="' + cfg.addVar + '">' + L.addVar + '</button>'
    + '<button type="button" class="btn" id="' + cfg.delVar + '">' + L.delVar + '</button>'
    + '<button type="button" class="btn" id="' + cfg.addCon + '">' + L.addCon + '</button>'
    + '<button type="button" class="btn" id="' + cfg.delCon + '">' + L.delCon + '</button>'
    + '</div>';

  mount.innerHTML = html;
}

/* cfg = { tbl, dirSeg, addVar, delVar, addCon, delCon, state, onChange, maxN, maxM }
   state = { dir, n, m, c: [], cons: [] } */
function createInputPanel(cfg) {
  buildChrome(cfg);                             // 外壳先落地，下面的 init() 才取得到元素
  var MAXN = cfg.maxN || 6, MAXM = cfg.maxM || 8;
  var state = cfg.state;
  var onChange = cfg.onChange || function () {};

  function el(k) { return document.getElementById(cfg[k]); }

  /* 输入框取值：0（含从来没填过）一律返回空串，交给 placeholder 显示一个灰色的 0。
     这样新增变量/约束后点进去就是空白，可以直接打字，不必先删掉那个 0；
     什么都不填时读取逻辑仍按 0 处理，结果与以前完全一致。 */
  function fmtIn(v) {
    if (v === undefined || v === null || isNaN(v)) return '';
    if (Math.abs(v) < 1e-9) return '';
    return (Math.abs(v - Math.round(v)) < 1e-9) ? String(Math.round(v)) : String(v);
  }

  function render() {
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
      html += '<td><input class="num" type="text" inputmode="decimal" placeholder="0" '
        + 'aria-label="目标函数中 x' + (j2 + 1) + ' 的系数" '
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
        html += '<td><input class="num" type="text" inputmode="decimal" placeholder="0" '
          + 'aria-label="第 ' + (i + 1) + ' 条约束中 x' + (j3 + 1) + ' 的系数" '
          + 'data-k="a" data-i="' + i + '" data-j="' + j3 + '" value="' + esc(fmtIn(k.coef[j3])) + '"></td>';
      }
      /* 关系符没有 placeholder 可用，必须显式给 aria-label，
         否则读屏用户只会听到一个孤零零的 "<=" 下拉框（审查脚本也会记为「无标注」） */
      html += '<td><select class="rel" data-i="' + i + '" aria-label="第 ' + (i + 1) + ' 条约束的关系符">'
        + ['<=', '>=', '='].map(function (r) {
          return '<option value="' + r + '"' + (k.rel === r ? ' selected' : '') + '>' + r + '</option>';
        }).join('')
        + '</select></td>';
      html += '<td><input class="num" type="text" inputmode="decimal" placeholder="0" '
        + 'aria-label="第 ' + (i + 1) + ' 条约束的右端项 b' + (i + 1) + '" '
        + 'data-k="b" data-i="' + i + '" value="' + esc(fmtIn(k.rhs)) + '"></td>';
      html += '<td><button type="button" class="delvar" data-i="' + i + '" aria-label="删除第 ' + (i + 1) + ' 条约束">&times;</button></td>';
      html += '</tr>';
    }
    html += '</tbody>';
    el('tbl').innerHTML = html;
    bind();
    el('delVar').disabled = (state.n < 1);
    el('delCon').disabled = (state.m < 1);
    el('addVar').disabled = (state.n >= MAXN);
    el('addCon').disabled = (state.m >= MAXM);
    addScrollHints(document);
  }

  function bind() {
    var t = el('tbl');
    Array.prototype.forEach.call(t.querySelectorAll('input.num'), function (inp) {
      inp.addEventListener('input', function () {
        /* 空白的格子（用户什么都没填）按 0 处理；只敲了 "-" / "." 这种中间状态也先当 0，等输完再说 */
        var v = parseFloat(inp.value.replace(/[^0-9.\-]/g, ''));
        if (isNaN(v)) v = 0;
        var k = inp.dataset.k;
        if (k === 'c') state.c[+inp.dataset.j] = v;
        else if (k === 'a') state.cons[+inp.dataset.i].coef[+inp.dataset.j] = v;
        else if (k === 'b') state.cons[+inp.dataset.i].rhs = v;
        onChange();
      });
    });
    Array.prototype.forEach.call(t.querySelectorAll('select.rel'), function (sel) {
      sel.addEventListener('change', function () {
        state.cons[+sel.dataset.i].rel = sel.value;
        onChange();
      });
    });
    Array.prototype.forEach.call(t.querySelectorAll('button.delvar'), function (b) {
      b.addEventListener('click', function () {
        if (state.m < 1) return;
        state.cons.splice(+b.dataset.i, 1);
        state.m--;
        render();
      });
    });
  }

  /* ---------------- 变量数 / 约束数（下限放宽到 0） ---------------- */
  function setN(n) {
    n = Math.max(0, Math.min(MAXN, n));
    if (n === state.n) return;
    while (state.c.length < n) state.c.push(0);
    state.c.length = n;
    for (var i = 0; i < state.cons.length; i++) {
      while (state.cons[i].coef.length < n) state.cons[i].coef.push(0);
      state.cons[i].coef.length = n;
    }
    state.n = n;
    render();
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
    render();
  }
  function setDir(d) {
    state.dir = d;
    Array.prototype.forEach.call(el('dirSeg').querySelectorAll('button'), function (x) {
      x.classList.toggle('on', x.dataset.dir === d);
    });
  }

  /* 按当前输入拼出求解器要的问题对象 */
  function getProblem() {
    return {
      direction: state.dir,
      c: state.c.slice(0, state.n),
      constraints: state.cons.slice(0, state.m).map(function (k) {
        return { coef: k.coef.slice(0, state.n), rel: k.rel, rhs: k.rhs };
      })
    };
  }

  function init() {
    Array.prototype.forEach.call(el('dirSeg').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { setDir(b.dataset.dir); });
    });
    var wire = function (key, fn) { el(key).addEventListener('click', fn); };
    wire('addVar', function () { setN(state.n + 1); });
    wire('delVar', function () { setN(state.n - 1); });
    wire('addCon', function () { setM(state.m + 1); });
    wire('delCon', function () { setM(state.m - 1); });
    render();
  }

  return {
    state: state, init: init, render: render,
    setN: setN, setM: setM, setDir: setDir,
    getProblem: getProblem, el: el
  };
}

/* 对外接口：buildChrome 建外壳 / createInputPanel 建表 + 绑事件 / addScrollHints 插提示 */
module.exports = {
  buildChrome: buildChrome,
  createInputPanel: createInputPanel,
  addScrollHints: addScrollHints
};
