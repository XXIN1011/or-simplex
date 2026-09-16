/* =========================================================================
   可复用的「线性规划输入表」组件
   -------------------------------------------------------------------------
   单纯形法与灵敏度分析两个模块都要输入线性规划，所以把输入表抽成一份实现、各自
   挂到不同元素上。逻辑与原 ui.js 里那段完全一致 —— 元素 id 保持不变的那个模块，
   表现也就完全不变（回归脚本依赖这些 id）。
   ========================================================================= */
'use strict';

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

/* cfg = { tbl, dirSeg, addVar, delVar, addCon, delCon, state, onChange, maxN, maxM }
   state = { dir, n, m, c: [], cons: [] } */
function createInputPanel(cfg) {
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
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
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
          + 'data-k="a" data-i="' + i + '" data-j="' + j3 + '" value="' + esc(fmtIn(k.coef[j3])) + '"></td>';
      }
      html += '<td><select class="rel" data-i="' + i + '">'
        + ['<=', '>=', '='].map(function (r) {
          return '<option value="' + r + '"' + (k.rel === r ? ' selected' : '') + '>' + r + '</option>';
        }).join('')
        + '</select></td>';
      html += '<td><input class="num" type="text" inputmode="decimal" placeholder="0" '
        + 'data-k="b" data-i="' + i + '" value="' + esc(fmtIn(k.rhs)) + '"></td>';
      html += '<td><button type="button" class="delvar" data-i="' + i + '">&times;</button></td>';
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
